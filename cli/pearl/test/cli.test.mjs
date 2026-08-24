import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aliasRequest,
  DEFAULT_SERVER,
  executeReadCapability,
  EXIT_CODES,
  normalizeServer,
  parseArgs,
  parseJsonObject,
  parseTimeout,
  runCli,
  VERSION,
} from '../src/index.mjs';
import { credentialWriteSpec, writeCredential } from '../src/keychain.mjs';
import {
  DEFAULT_SCOPES,
  discoverOAuth,
  normalizeRequestedScopes,
  validateOAuthCallback,
  validateTokenResponse,
} from '../src/oauth.mjs';

function response(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function outputSink() {
  let value = '';
  return { stream: { write: (chunk) => { value += chunk; } }, value: () => value };
}

test('CLI version and canonical endpoint are stable', () => {
  assert.equal(VERSION, '1.0.0');
  assert.equal(DEFAULT_SERVER, 'https://agent.joinpearl.co');
});

test('strict parser separates values, JSON, and boolean flags', () => {
  assert.deepEqual(parseArgs([
    'call', 'venues_search', '--input', '{"query":"Paris"}', '--json', '--timeout=5000',
  ]), {
    positionals: ['call', 'venues_search'],
    flags: { input: '{"query":"Paris"}', json: true, timeout: '5000' },
  });
  assert.throws(() => parseArgs(['tools', '--unknown']), /Unknown option/);
  assert.throws(() => parseArgs(['tools', '--json=true']), /does not take a value/);
  assert.throws(() => parseArgs(['tools', '--timeout']), /requires a value/);
  assert.throws(() => parseArgs(['tools', '--json', '--json']), /more than once/);
});

test('server validation is HTTPS-only except explicit exact loopback development', () => {
  assert.equal(normalizeServer('https://agent.joinpearl.co/'), DEFAULT_SERVER);
  assert.equal(normalizeServer('http://127.0.0.1:54321', { allowLoopbackHttp: true }), 'http://127.0.0.1:54321');
  assert.throws(() => normalizeServer('http://127.0.0.1:54321'), /must use HTTPS/);
  assert.throws(() => normalizeServer('http://localhost.attacker.example', { allowLoopbackHttp: true }), /must use HTTPS/);
  assert.throws(() => normalizeServer(`https://user:password${'@'}agent.joinpearl.co`), /without credentials/);
  assert.throws(() => normalizeServer('https://agent.joinpearl.co/mcp'), /without credentials/);
});

test('timeouts and JSON inputs are conservatively bounded', () => {
  assert.equal(parseTimeout(undefined), 20_000);
  assert.equal(parseTimeout('120000'), 120_000);
  assert.throws(() => parseTimeout('999'), /1000 to 120000/);
  assert.deepEqual(parseJsonObject('{"query":"Paris"}'), { query: 'Paris' });
  assert.throws(() => parseJsonObject('[]'), /JSON object/);
  assert.throws(() => parseJsonObject('{'), /valid JSON/);
});

test('aliases map only the current public read workflows', async () => {
  assert.deepEqual(await aliasRequest('search', ['wine bar'], {}), {
    capability: 'venues_search', arguments: { query: 'wine bar' },
  });
  assert.deepEqual(await aliasRequest('recommend', [], { input: '{"city":"Paris"}' }), {
    capability: 'venues_recommend', arguments: { city: 'Paris' },
  });
  assert.deepEqual(await aliasRequest('new-openings', [], {}), {
    capability: 'venues_new_openings', arguments: {},
  });
  assert.deepEqual(await aliasRequest('match', ['places.json'], {}, async () => '{"items":[{"name":"Pearl"}]}'), {
    capability: 'places_match', arguments: { items: [{ name: 'Pearl' }] },
  });
  assert.deepEqual(await aliasRequest('profile', ['cuisines'], {}), {
    capability: 'profile_get', arguments: { lens: 'cuisines' },
  });
  assert.deepEqual(await aliasRequest('favorites', [], { input: '{"city":"Rome","sort":"recent"}' }), {
    capability: 'visits_list', arguments: { city: 'Rome', sort: 'score' },
  });
  assert.deepEqual(await aliasRequest('saves', [], {}), { capability: 'saves_list', arguments: {} });
  assert.deepEqual(await aliasRequest('friend-search', ['Austin'], {}), {
    capability: 'friends_search', arguments: { query: 'Austin' },
  });
  assert.deepEqual(await aliasRequest('friends', [], {}), { capability: 'friends_list', arguments: {} });
  assert.deepEqual(await aliasRequest('trips', [], {}), { capability: 'trips_list', arguments: {} });
  assert.deepEqual(await aliasRequest('trip', ['Japan'], {}), {
    capability: 'trip_get', arguments: { collection_name: 'Japan' },
  });
  assert.deepEqual(await aliasRequest('reservations', [], {}), {
    capability: 'reservations_list', arguments: {},
  });
  assert.deepEqual(await aliasRequest('reservation', ['member_reservations', 'id'], {}), {
    capability: 'reservation_get', arguments: { source: 'member_reservations', reservation_id: 'id' },
  });
});

test('public OAuth scopes cannot be widened by command-line input', () => {
  assert.deepEqual(normalizeRequestedScopes([]), [...DEFAULT_SCOPES]);
  assert.deepEqual(normalizeRequestedScopes('venues:read,profile:read,venues:read'), ['profile:read', 'venues:read']);
  assert.throws(() => normalizeRequestedScopes(`venues:read,reservations:${'write'}`), /Unsupported Pearl CLI scope/);
});

test('OAuth callback requires exactly one matching RFC 9207 issuer and state', () => {
  const issuer = DEFAULT_SERVER;
  const state = 'state-123';
  assert.equal(validateOAuthCallback(
    `http://127.0.0.1:49152/oauth/callback?code=pac_test&state=${state}&iss=${encodeURIComponent(issuer)}`,
    { issuer, state },
  ), 'pac_test');
  assert.throws(() => validateOAuthCallback(
    `http://127.0.0.1:49152/oauth/callback?code=pac_test&state=${state}`,
    { issuer, state },
  ), /issuer/);
  assert.throws(() => validateOAuthCallback(
    `http://127.0.0.1:49152/oauth/callback?code=pac_test&state=${state}&iss=https%3A%2F%2Fevil.example`,
    { issuer, state },
  ), /issuer/);
  assert.throws(() => validateOAuthCallback(
    `http://127.0.0.1:49152/oauth/callback?code=pac_test&state=wrong&iss=${encodeURIComponent(issuer)}`,
    { issuer, state },
  ), /state/);
});

test('OAuth discovery requires the exact issuer, public PKCE, and response issuer support', async () => {
  const metadata = {
    issuer: DEFAULT_SERVER,
    authorization_endpoint: `${DEFAULT_SERVER}/oauth/authorize`,
    token_endpoint: `${DEFAULT_SERVER}/oauth/token`,
    revocation_endpoint: `${DEFAULT_SERVER}/oauth/revoke`,
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    authorization_response_iss_parameter_supported: true,
  };
  assert.equal((await discoverOAuth(DEFAULT_SERVER, {
    fetchImpl: async () => response(200, metadata),
  })).issuer, DEFAULT_SERVER);
  await assert.rejects(discoverOAuth(DEFAULT_SERVER, {
    fetchImpl: async () => response(200, { ...metadata, authorization_response_iss_parameter_supported: false }),
  }), /unexpected authorization server contract/);
  await assert.rejects(discoverOAuth(DEFAULT_SERVER, {
    fetchImpl: async () => response(200, { ...metadata, revocation_endpoint: 'https://evil.example/revoke' }),
  }), /unexpected authorization server contract/);
});

test('OAuth token responses are exact Bearer credentials and cannot widen scopes', () => {
  const valid = {
    access_token: `pat_${'a'.repeat(43)}`,
    refresh_token: `prt_${'b'.repeat(43)}`,
    token_type: 'Bearer',
    expires_in: 600,
    scope: 'profile:read venues:read',
  };
  assert.deepEqual(validateTokenResponse(valid, { allowedScopes: ['profile:read', 'venues:read'] }), {
    access_token: valid.access_token,
    refresh_token: valid.refresh_token,
    scope: 'profile:read venues:read',
    expires_in: 600,
  });
  assert.throws(() => validateTokenResponse({ ...valid, token_type: 'DPoP' }, { allowedScopes: DEFAULT_SCOPES }), /invalid token response/);
  assert.throws(() => validateTokenResponse({ ...valid, expires_in: 601 }, { allowedScopes: DEFAULT_SCOPES }), /invalid token response/);
  assert.throws(() => validateTokenResponse({ ...valid, refresh_token: '' }, { allowedScopes: DEFAULT_SCOPES }), /invalid token response/);
  assert.throws(() => validateTokenResponse({ ...valid, scope: 'profile:read friends:read' }, { allowedScopes: ['profile:read'] }), /not authorized/);
});

test('macOS credential writes keep token material out of argv and errors', async () => {
  const secret = ['pat', 'secret-material'].join('_');
  const spec = credentialWriteSpec('darwin', DEFAULT_SERVER, secret);
  assert.equal(spec.command, 'security');
  assert.equal(spec.args.at(-1), '-w');
  assert.equal(spec.args.some((argument) => argument.includes(secret)), false);
  assert.equal(spec.input.includes(secret), true);

  let observed;
  await writeCredential(DEFAULT_SERVER, secret, {
    platform: 'darwin',
    runCommand: async (command, args, input) => { observed = { command, args, input }; },
  });
  assert.equal(observed.args.some((argument) => argument.includes(secret)), false);
  assert.equal(observed.input, `${secret}\n`);
  await assert.rejects(writeCredential(DEFAULT_SERVER, secret, {
    platform: 'darwin',
    runCommand: async () => { throw new Error(`helper echoed ${secret}`); },
  }), (error) => !error.message.includes(secret));
});

test('CLI keeps the original credential service and host account namespace', async () => {
  let observed;
  await runCli(['status'], {
    readCredentialImpl: async (account) => { observed = account; return null; },
    stdout: outputSink().stream,
    stderr: outputSink().stream,
  });
  assert.equal(observed, 'agent.joinpearl.co');
  const spec = credentialWriteSpec('darwin', observed, 'value');
  assert.deepEqual(spec.args.slice(0, 5), ['add-generic-password', '-a', observed, '-s', 'com.pearl.agent-cli']);
});

test('generic execution consults runtime inventory and calls only a read-only tool', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/v1/capabilities')) return response(200, {
      capabilities: [{ name: 'venues_search', annotations: { readOnlyHint: true } }],
    });
    return response(200, { result: { venues: [] }, request_id: 'request-1' });
  };
  const accessKey = ['access', 'token'].join('_');
  const result = await executeReadCapability({
    server: DEFAULT_SERVER,
    session: { [accessKey]: ['pat', 'test'].join('_') },
    capability: 'venues_search',
    arguments: { query: 'Paris' },
    fetchImpl,
  });
  assert.deepEqual(result.result, { venues: [] });
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    capability: 'venues_search', arguments: { query: 'Paris' },
  });
});

test('generic execution refuses unavailable and non-read-only runtime tools', async () => {
  const accessKey = ['access', 'token'].join('_');
  const session = { [accessKey]: ['pat', 'test'].join('_') };
  await assert.rejects(executeReadCapability({
    server: DEFAULT_SERVER,
    session,
    capability: 'missing',
    arguments: {},
    fetchImpl: async () => response(200, { capabilities: [] }),
  }), /did not advertise/);
  await assert.rejects(executeReadCapability({
    server: DEFAULT_SERVER,
    session,
    capability: 'unsafe',
    arguments: {},
    fetchImpl: async () => response(200, { capabilities: [{ name: 'unsafe', annotations: { readOnlyHint: false } }] }),
  }), /only executes.*read-only/);
});

test('machine-readable errors preserve recovery fields without tokens', async () => {
  const stdout = outputSink();
  const stderr = outputSink();
  const accessKey = ['access', 'token'].join('_');
  const refreshKey = ['refresh', 'token'].join('_');
  const accessValue = ['pat', 'never-print'].join('_');
  const refreshValue = ['prt', 'never-print'].join('_');
  const exitCode = await runCli(['tools', '--json'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    readCredentialImpl: async () => JSON.stringify({
      server: DEFAULT_SERVER,
      [accessKey]: accessValue,
      [refreshKey]: refreshValue,
      scope: 'venues:read',
      expires_at: Date.now() + 60_000,
    }),
    fetchImpl: async () => response(403, {
      error: {
        code: 'insufficient_scope',
        message: 'Grant the required scope.\nDo not trust terminal escapes.',
        retryable: false,
        user_action: 'grant_scope',
        request_id: 'request-2',
      },
    }),
  });
  assert.equal(exitCode, EXIT_CODES.insufficientScope);
  const output = stderr.value();
  assert.equal(output.includes(accessValue), false);
  assert.equal(output.includes(refreshValue), false);
  assert.deepEqual(JSON.parse(output).error, {
    code: 'insufficient_scope',
    message: 'Grant the required scope. Do not trust terminal escapes.',
    retryable: false,
    user_action: 'grant_scope',
    request_id: 'request-2',
  });
});
