import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { URL } from 'node:url';

export const CLIENT_ID = 'pearl-cli';
export const DEFAULT_SCOPES = Object.freeze([
  'profile:read',
  'venues:read',
  'visits:read',
  'saves:read',
  'trips:read',
  'reservations:read',
  'friends:read',
]);

const OPAQUE_ACCESS_TOKEN = /^pat_[A-Za-z0-9_-]{40,80}$/;
const OPAQUE_REFRESH_TOKEN = /^prt_[A-Za-z0-9_-]{40,80}$/;
const ACCESS_TOKEN_TTL_SECONDS = 600;

export function base64Url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

export function createPkce() {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function normalizeRequestedScopes(scopes) {
  const values = Array.isArray(scopes) ? scopes : String(scopes ?? '').split(/[\s,]+/);
  const normalized = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
  if (!normalized.length) return [...DEFAULT_SCOPES];
  const unsupported = normalized.filter((scope) => !DEFAULT_SCOPES.includes(scope));
  if (unsupported.length) throw new Error(`Unsupported Pearl CLI scope: ${unsupported.join(', ')}`);
  return DEFAULT_SCOPES.filter((scope) => normalized.includes(scope));
}

function parseReturnedScopes(scope) {
  if (typeof scope !== 'string') throw new Error('Pearl OAuth returned an invalid token scope.');
  const values = scope.split(/\s+/).map((value) => value.trim()).filter(Boolean);
  if (!values.length || new Set(values).size !== values.length) {
    throw new Error('Pearl OAuth returned an invalid token scope.');
  }
  return values;
}

export function validateTokenResponse(tokens, { allowedScopes }) {
  if (!tokens || typeof tokens !== 'object'
    || String(tokens.token_type).toLowerCase() !== 'bearer'
    || !OPAQUE_ACCESS_TOKEN.test(tokens.access_token)
    || !OPAQUE_REFRESH_TOKEN.test(tokens.refresh_token)
    || !Number.isInteger(tokens.expires_in)
    || tokens.expires_in < 1
    || tokens.expires_in > ACCESS_TOKEN_TTL_SECONDS) {
    throw new Error('Pearl OAuth returned an invalid token response.');
  }
  const allowed = normalizeRequestedScopes(allowedScopes);
  const scopes = parseReturnedScopes(tokens.scope);
  if (scopes.some((scope) => !allowed.includes(scope))) {
    throw new Error('Pearl OAuth returned a token with scopes that were not authorized.');
  }
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    scope: DEFAULT_SCOPES.filter((scope) => scopes.includes(scope)).join(' '),
    expires_in: tokens.expires_in,
  };
}

export function validateOAuthCallback(callbackUrl, { issuer, state }) {
  const url = new URL(callbackUrl);
  const issuers = url.searchParams.getAll('iss');
  if (issuers.length !== 1 || issuers[0] !== issuer) {
    throw new Error('OAuth callback issuer did not match the Pearl authorization server.');
  }
  const states = url.searchParams.getAll('state');
  if (states.length !== 1 || states[0] !== state) throw new Error('OAuth callback state validation failed.');
  const errors = url.searchParams.getAll('error');
  const codes = url.searchParams.getAll('code');
  if (errors.length === 1 && codes.length === 0) throw new Error(errors[0]);
  if (errors.length !== 0 || codes.length !== 1) throw new Error('OAuth callback did not contain one authorization result.');
  return codes[0];
}

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

async function fetchJson(url, options = {}, fetchImpl = fetch, timeoutMs = 20_000) {
  const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || payload.message || payload.error || `OAuth request failed (${response.status})`);
  return payload;
}

async function postForm(url, values, fetchImpl, timeoutMs) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(values),
  }, fetchImpl, timeoutMs);
}

export async function discoverOAuth(server, options = {}) {
  const metadata = await fetchJson(
    `${server}/.well-known/oauth-authorization-server`,
    { headers: { accept: 'application/json' } },
    options.fetchImpl,
    options.timeoutMs,
  );
  if (metadata.issuer !== server
    || metadata.authorization_endpoint !== `${server}/oauth/authorize`
    || metadata.token_endpoint !== `${server}/oauth/token`
    || metadata.revocation_endpoint !== `${server}/oauth/revoke`
    || !metadata.code_challenge_methods_supported?.includes('S256')
    || !metadata.token_endpoint_auth_methods_supported?.includes('none')
    || metadata.authorization_response_iss_parameter_supported !== true) {
    throw new Error('Pearl OAuth discovery returned an unexpected authorization server contract.');
  }
  return metadata;
}

export async function login({
  server,
  scopes = DEFAULT_SCOPES,
  launchBrowser = openBrowser,
  noOpen = false,
  fetchImpl = fetch,
  timeoutMs = 20_000,
  loginTimeoutMs = 5 * 60 * 1000,
  onAuthorizeUrl = (url) => process.stderr.write(`Open this URL to connect Pearl:\n${url}\n`),
}) {
  const requestedScopes = normalizeRequestedScopes(scopes);
  const metadata = await discoverOAuth(server, { fetchImpl, timeoutMs });
  const { verifier, challenge } = createPkce();
  const state = base64Url(randomBytes(24));
  const callback = await new Promise((resolve, reject) => {
    let timeout;
    const finish = (fn, value) => {
      if (timeout) clearTimeout(timeout);
      fn(value);
    };
    const http = createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname !== '/oauth/callback') {
        res.writeHead(404).end('Not found');
        return;
      }
      try {
        const code = validateOAuthCallback(url.toString(), { issuer: metadata.issuer, state });
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<h1>Pearl connected</h1><p>You can return to your terminal.</p>');
        const redirectUri = `http://127.0.0.1:${http.address().port}/oauth/callback`;
        http.close();
        finish(resolve, { code, redirectUri });
      } catch (error) {
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<h1>Pearl connection failed</h1><p>You can close this window.</p>');
        http.close();
        finish(reject, error);
      }
    });
    http.on('error', (error) => finish(reject, error));
    http.listen(0, '127.0.0.1', () => {
      const redirectUri = `http://127.0.0.1:${http.address().port}/oauth/callback`;
      const authorize = new URL(metadata.authorization_endpoint);
      authorize.search = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        scope: requestedScopes.join(' '),
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        resource: `${server}/mcp`,
      }).toString();
      onAuthorizeUrl(authorize.toString());
      if (!noOpen) launchBrowser(authorize.toString());
    });
    timeout = setTimeout(() => {
      http.close();
      reject(new Error('Pearl login timed out.'));
    }, loginTimeoutMs);
    timeout.unref();
  });

  const tokens = validateTokenResponse(await postForm(metadata.token_endpoint, {
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code: callback.code,
    redirect_uri: callback.redirectUri,
    code_verifier: verifier,
    resource: `${server}/mcp`,
  }, fetchImpl, timeoutMs), { allowedScopes: requestedScopes });
  return {
    server,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };
}

export async function refresh(session, options = {}) {
  const metadata = await discoverOAuth(session.server, options);
  const currentScopes = normalizeRequestedScopes(parseReturnedScopes(session.scope));
  const tokens = validateTokenResponse(await postForm(metadata.token_endpoint, {
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: session.refresh_token,
    resource: `${session.server}/mcp`,
  }, options.fetchImpl, options.timeoutMs), { allowedScopes: currentScopes });
  return {
    ...session,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };
}

export async function revoke(session, options = {}) {
  const metadata = await discoverOAuth(session.server, options);
  await postForm(metadata.revocation_endpoint, {
    client_id: CLIENT_ID,
    token: session.refresh_token || session.access_token,
  }, options.fetchImpl, options.timeoutMs);
}
