#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deleteCredential, readCredential, withCredentialLock, writeCredential } from './keychain.mjs';
import { DEFAULT_SCOPES, login, refresh, revoke } from './oauth.mjs';

export const VERSION = '1.0.0';
export const DEFAULT_SERVER = 'https://agent.joinpearl.co';

export const EXIT_CODES = Object.freeze({
  success: 0,
  usage: 2,
  unauthenticated: 3,
  insufficientScope: 4,
  network: 5,
  server: 6,
});

const VALUE_FLAGS = new Set(['input', 'input-file', 'scope', 'server', 'timeout']);
const BOOLEAN_FLAGS = new Set([
  'allow-loopback-http', 'authenticated', 'help', 'json', 'no-input', 'no-open', 'version',
]);
const COMMON_FLAGS = new Set(['allow-loopback-http', 'help', 'json', 'no-input', 'server', 'timeout', 'version']);
const COMMAND_FLAGS = new Map([
  ['login', new Set(['no-open', 'scope'])],
  ['doctor', new Set(['authenticated'])],
  ['call', new Set(['input', 'input-file'])],
  ['search', new Set(['input', 'input-file'])],
  ['recommend', new Set(['input', 'input-file'])],
  ['new-openings', new Set(['input', 'input-file'])],
  ['match', new Set(['input', 'input-file'])],
  ['visits', new Set(['input', 'input-file'])],
  ['favorites', new Set(['input', 'input-file'])],
  ['saves', new Set(['input', 'input-file'])],
  ['friend-search', new Set(['input', 'input-file'])],
]);
const MAX_INPUT_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class CliError extends Error {
  constructor(code, message, exitCode = EXIT_CODES.server, options = {}) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.exitCode = exitCode;
    this.retryable = options.retryable === true;
    this.userAction = options.userAction;
    this.requestId = options.requestId;
    this.details = options.details;
  }
}

export function helpText() {
  return `Pearl CLI ${VERSION}

Read-only access to your Pearl profile, places, friends, trips, reservations,
and visits through the same authenticated Pearl Agent service used by MCP.

Usage:
  pearl login [--scope READ_SCOPE,...] [--no-open]
  pearl status
  pearl logout
  pearl doctor [--authenticated]
  pearl tools
  pearl call <tool> [--input JSON | --input-file PATH]
  pearl search <query> [--input JSON]
  pearl recommend [--input JSON]
  pearl new-openings [--input JSON]
  pearl match <JSON-or-file>
  pearl profile [lens]
  pearl visits [--input JSON]
  pearl favorites [--input JSON]
  pearl saves [--input JSON]
  pearl friend-search <query> [--input JSON]
  pearl friends
  pearl trips
  pearl trip <collection-id-or-name>
  pearl reservations
  pearl reservation <user_reservations|member_reservations> <reservation-id>
  pearl mcp-url

Global options:
  --json                 Machine-readable output and errors
  --server URL           Alternate HTTPS Agent issuer
  --timeout MS           Network timeout from 1000 to 120000 ms
  --no-input             Never prompt (currently all commands are non-interactive)
  --allow-loopback-http  Development only; permits an HTTP loopback server
  --help                 Show help
  --version              Show version

Credentials are stored in macOS Keychain or Linux Secret Service. The CLI
discovers the live tool inventory and refuses tools not marked read-only.`;
}

export function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  let positionalOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (positionalOnly) {
      positionals.push(token);
      continue;
    }
    if (token === '--') {
      positionalOnly = true;
      continue;
    }
    if (token === '-h') {
      if (flags.help !== undefined) throw new CliError('duplicate_option', '--help was supplied more than once.', EXIT_CODES.usage);
      flags.help = true;
      continue;
    }
    if (token === '-V') {
      if (flags.version !== undefined) throw new CliError('duplicate_option', '--version was supplied more than once.', EXIT_CODES.usage);
      flags.version = true;
      continue;
    }
    if (!token.startsWith('--')) {
      if (token.startsWith('-')) throw new CliError('unknown_option', `Unknown option: ${token}`, EXIT_CODES.usage);
      positionals.push(token);
      continue;
    }
    const separator = token.indexOf('=');
    const name = token.slice(2, separator === -1 ? undefined : separator);
    const inline = separator === -1 ? undefined : token.slice(separator + 1);
    if (!VALUE_FLAGS.has(name) && !BOOLEAN_FLAGS.has(name)) {
      throw new CliError('unknown_option', `Unknown option: --${name}`, EXIT_CODES.usage);
    }
    if (Object.hasOwn(flags, name)) {
      throw new CliError('duplicate_option', `--${name} was supplied more than once.`, EXIT_CODES.usage);
    }
    if (BOOLEAN_FLAGS.has(name)) {
      if (inline !== undefined) throw new CliError('invalid_option', `--${name} does not take a value.`, EXIT_CODES.usage);
      flags[name] = true;
      continue;
    }
    const value = inline ?? argv[++index];
    if (value === undefined || value.startsWith('--')) {
      throw new CliError('missing_option_value', `--${name} requires a value.`, EXIT_CODES.usage);
    }
    flags[name] = value;
  }
  return { positionals, flags };
}

export function validateCommandFlags(command, flags) {
  const commandFlags = COMMAND_FLAGS.get(command) ?? new Set();
  for (const name of Object.keys(flags)) {
    if (!COMMON_FLAGS.has(name) && !commandFlags.has(name)) {
      throw new CliError('invalid_option', `--${name} is not valid for pearl ${command}.`, EXIT_CODES.usage);
    }
  }
}

export function normalizeServer(value, { allowLoopbackHttp = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new CliError('invalid_server', '--server must be an absolute URL.', EXIT_CODES.usage);
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new CliError('invalid_server', '--server must be an origin without credentials, path, query, or fragment.', EXIT_CODES.usage);
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1';
  if (url.protocol !== 'https:' && !(allowLoopbackHttp && loopback && url.protocol === 'http:')) {
    throw new CliError('invalid_server', '--server must use HTTPS. HTTP is limited to loopback with --allow-loopback-http.', EXIT_CODES.usage);
  }
  return url.origin;
}

export function parseTimeout(value) {
  if (value === undefined) return 20_000;
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 120_000) {
    throw new CliError('invalid_timeout', '--timeout must be an integer from 1000 to 120000.', EXIT_CODES.usage);
  }
  return timeout;
}

function sanitizeText(value) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function assertObject(value, label = 'Input') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CliError('invalid_input', `${label} must be a JSON object.`, EXIT_CODES.usage);
  }
  return value;
}

export function parseJsonObject(text, label = 'Input') {
  if (Buffer.byteLength(text, 'utf8') > MAX_INPUT_BYTES) {
    throw new CliError('input_too_large', `${label} exceeds 256 KiB.`, EXIT_CODES.usage);
  }
  try {
    return assertObject(JSON.parse(text), label);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('invalid_input', `${label} must contain valid JSON.`, EXIT_CODES.usage);
  }
}

async function readInputFile(path, readFileImpl = readFile) {
  let contents;
  try {
    contents = await readFileImpl(path, 'utf8');
  } catch {
    throw new CliError('input_file_unavailable', `Could not read input file: ${path}`, EXIT_CODES.usage);
  }
  return parseJsonObject(contents, `Input file ${path}`);
}

async function optionalInput(flags, positional, readFileImpl = readFile) {
  const sources = [flags.input !== undefined, flags['input-file'] !== undefined, positional !== undefined].filter(Boolean).length;
  if (sources > 1) throw new CliError('ambiguous_input', 'Use only one JSON input source.', EXIT_CODES.usage);
  if (flags.input !== undefined) return parseJsonObject(flags.input);
  if (flags['input-file'] !== undefined) return readInputFile(flags['input-file'], readFileImpl);
  if (positional !== undefined) {
    if (positional.trim().startsWith('{')) return parseJsonObject(positional);
    return readInputFile(positional, readFileImpl);
  }
  return {};
}

function requirePositionals(positionals, count, usage) {
  if (positionals.length !== count) throw new CliError('usage', usage, EXIT_CODES.usage);
}

export async function aliasRequest(command, positionals, flags, readFileImpl = readFile) {
  if (command === 'search') {
    if (positionals.length > 1) throw new CliError('usage', 'Usage: pearl search <query> [--input JSON]', EXIT_CODES.usage);
    const input = await optionalInput(flags, undefined, readFileImpl);
    const query = positionals[0] ?? input.query;
    if (typeof query !== 'string' || !query.trim()) throw new CliError('usage', 'pearl search requires a query.', EXIT_CODES.usage);
    return { capability: 'venues_search', arguments: { ...input, query } };
  }
  if (command === 'recommend' || command === 'new-openings' || command === 'visits' || command === 'favorites' || command === 'saves') {
    if (positionals.length > 1) throw new CliError('usage', `Usage: pearl ${command} [--input JSON]`, EXIT_CODES.usage);
    const input = await optionalInput(flags, positionals[0], readFileImpl);
    const capability = {
      recommend: 'venues_recommend',
      'new-openings': 'venues_new_openings',
      visits: 'visits_list',
      favorites: 'visits_list',
      saves: 'saves_list',
    }[command];
    return { capability, arguments: command === 'favorites' ? { ...input, sort: 'score' } : input };
  }
  if (command === 'match') {
    if (positionals.length > 1) throw new CliError('usage', 'Usage: pearl match <JSON-or-file>', EXIT_CODES.usage);
    const input = await optionalInput(flags, positionals[0], readFileImpl);
    if (!Array.isArray(input.items) || !input.items.length) throw new CliError('invalid_input', 'pearl match requires a non-empty items array.', EXIT_CODES.usage);
    return { capability: 'places_match', arguments: input };
  }
  if (command === 'profile') {
    if (Object.hasOwn(flags, 'input') || Object.hasOwn(flags, 'input-file')) throw new CliError('invalid_option', 'pearl profile accepts only an optional lens.', EXIT_CODES.usage);
    if (positionals.length > 1) throw new CliError('usage', 'Usage: pearl profile [lens]', EXIT_CODES.usage);
    return { capability: 'profile_get', arguments: positionals[0] ? { lens: positionals[0] } : {} };
  }
  if (command === 'friend-search') {
    if (positionals.length !== 1) throw new CliError('usage', 'Usage: pearl friend-search <query> [--input JSON]', EXIT_CODES.usage);
    const input = await optionalInput(flags, undefined, readFileImpl);
    return { capability: 'friends_search', arguments: { ...input, query: positionals[0] } };
  }
  if (command === 'friends') {
    requirePositionals(positionals, 0, 'Usage: pearl friends');
    return { capability: 'friends_list', arguments: {} };
  }
  if (command === 'trips') {
    requirePositionals(positionals, 0, 'Usage: pearl trips');
    return { capability: 'trips_list', arguments: {} };
  }
  if (command === 'trip') {
    requirePositionals(positionals, 1, 'Usage: pearl trip <collection-id-or-name>');
    const value = positionals[0];
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    return { capability: 'trip_get', arguments: isUuid ? { collection_id: value } : { collection_name: value } };
  }
  if (command === 'reservations') {
    requirePositionals(positionals, 0, 'Usage: pearl reservations');
    return { capability: 'reservations_list', arguments: {} };
  }
  if (command === 'reservation') {
    requirePositionals(positionals, 2, 'Usage: pearl reservation <source> <reservation-id>');
    if (!['user_reservations', 'member_reservations'].includes(positionals[0])) {
      throw new CliError('invalid_input', 'Reservation source must be user_reservations or member_reservations.', EXIT_CODES.usage);
    }
    return { capability: 'reservation_get', arguments: { source: positionals[0], reservation_id: positionals[1] } };
  }
  throw new CliError('unknown_command', `Unknown command: ${command}`, EXIT_CODES.usage);
}

function publicError(payload, status) {
  const envelope = payload?.error && typeof payload.error === 'object' ? payload.error : payload;
  const code = sanitizeText(envelope?.code || (typeof payload?.error === 'string' ? payload.error : `http_${status}`));
  const message = sanitizeText(envelope?.message || envelope?.error_description || payload?.message || `Pearl request failed (${status}).`);
  const exitCode = status === 401 ? EXIT_CODES.unauthenticated
    : code === 'insufficient_scope' ? EXIT_CODES.insufficientScope
    : status === 429 || status >= 500 ? EXIT_CODES.server
    : EXIT_CODES.server;
  return new CliError(code, message, exitCode, {
    retryable: envelope?.retryable === true || status === 429 || status >= 500,
    userAction: sanitizeText(envelope?.user_action) || undefined,
    requestId: sanitizeText(envelope?.request_id || payload?.request_id) || undefined,
    details: envelope?.details,
  });
}

async function readBoundedResponseText(response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new CliError('response_too_large', 'Pearl response exceeded the CLI safety limit.', EXIT_CODES.server);
  }
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel('Pearl response exceeded the CLI safety limit.');
      throw new CliError('response_too_large', 'Pearl response exceeded the CLI safety limit.', EXIT_CODES.server);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function requestJson(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response;
  try {
    response = await fetchImpl(url, {
      method: options.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(options.session ? { authorization: `Bearer ${options.session.access_token}` } : {}),
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    });
  } catch (error) {
    throw new CliError('network_error', sanitizeText(error?.message || 'Pearl network request failed.'), EXIT_CODES.network, { retryable: true, userAction: 'retry' });
  }
  const text = await readBoundedResponseText(response);
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new CliError('invalid_response', 'Pearl returned a non-JSON response.', EXIT_CODES.server);
  }
  if (!response.ok) throw publicError(payload, response.status);
  return payload;
}

export async function runtimeCapabilities({ server, session, fetchImpl = fetch, timeoutMs = 20_000 }) {
  const payload = await requestJson(`${server}/api/v1/capabilities`, { session, fetchImpl, timeoutMs });
  if (!Array.isArray(payload.capabilities)) throw new CliError('invalid_response', 'Pearl returned an invalid capability catalog.', EXIT_CODES.server);
  return payload;
}

export async function executeReadCapability({ server, session, capability, arguments: args, fetchImpl = fetch, timeoutMs = 20_000 }) {
  const catalog = await runtimeCapabilities({ server, session, fetchImpl, timeoutMs });
  const definition = catalog.capabilities.find((item) => item?.name === capability);
  if (!definition) throw new CliError('capability_unavailable', `Pearl did not advertise the requested tool: ${capability}`, EXIT_CODES.server);
  if (definition.annotations?.readOnlyHint !== true) {
    throw new CliError('write_tool_refused', 'Pearl CLI only executes runtime-advertised read-only tools.', EXIT_CODES.usage);
  }
  return requestJson(`${server}/api/v1/execute`, {
    method: 'POST',
    body: { capability, arguments: assertObject(args, 'Tool input') },
    session,
    fetchImpl,
    timeoutMs,
  });
}

function validateSession(value, server) {
  if (!value || typeof value !== 'object' || value.server !== server
    || typeof value.access_token !== 'string' || typeof value.refresh_token !== 'string'
    || !Number.isFinite(value.expires_at)) {
    throw new CliError('invalid_credentials', 'Stored Pearl credentials are invalid. Run pearl logout, then pearl login.', EXIT_CODES.unauthenticated, { userAction: 'reconnect' });
  }
  return value;
}

function credentialAccount(server) {
  // Compatibility with the original internal CLI credential account key.
  return new URL(server).host;
}

export async function loadSession(server, options = {}) {
  const read = options.readCredentialImpl ?? readCredential;
  const write = options.writeCredentialImpl ?? writeCredential;
  const refreshImpl = options.refreshImpl ?? refresh;
  const lock = options.withCredentialLockImpl ?? withCredentialLock;
  const account = credentialAccount(server);
  const raw = await read(account);
  if (!raw) throw new CliError('not_connected', 'Pearl CLI is not connected. Run pearl login.', EXIT_CODES.unauthenticated, { userAction: 'reconnect' });
  let session;
  try {
    session = validateSession(JSON.parse(raw), server);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('invalid_credentials', 'Stored Pearl credentials are invalid. Run pearl logout, then pearl login.', EXIT_CODES.unauthenticated, { userAction: 'reconnect' });
  }
  if (session.expires_at > Date.now() + 30_000) return session;
  return lock(account, async () => {
    const currentRaw = await read(account);
    if (!currentRaw) throw new CliError('not_connected', 'Pearl CLI is not connected. Run pearl login.', EXIT_CODES.unauthenticated);
    const current = validateSession(JSON.parse(currentRaw), server);
    if (current.expires_at > Date.now() + 30_000) return current;
    let next;
    try {
      next = await refreshImpl(current, { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs });
    } catch {
      throw new CliError('refresh_failed', 'Pearl credentials expired. Run pearl login again.', EXIT_CODES.unauthenticated, { userAction: 'reconnect' });
    }
    await write(account, JSON.stringify(next));
    return next;
  });
}

async function doctor({ server, authenticated, fetchImpl, timeoutMs, sessionLoader }) {
  const checks = [];
  const health = await requestJson(`${server}/health`, { fetchImpl, timeoutMs });
  checks.push({ name: 'gateway', ok: health.ok === true, version: health.version });
  const oauth = await requestJson(`${server}/.well-known/oauth-authorization-server`, { fetchImpl, timeoutMs });
  checks.push({
    name: 'oauth',
    ok: oauth.issuer === server
      && oauth.code_challenge_methods_supported?.includes('S256')
      && oauth.token_endpoint_auth_methods_supported?.includes('none')
      && oauth.authorization_response_iss_parameter_supported === true,
    issuer: oauth.issuer,
  });
  if (authenticated) {
    const session = await sessionLoader();
    const catalog = await runtimeCapabilities({ server, session, fetchImpl, timeoutMs });
    checks.push({ name: 'authenticated_catalog', ok: true, read_tool_count: catalog.capabilities.filter((item) => item.annotations?.readOnlyHint === true).length });
  }
  return { ok: checks.every((check) => check.ok), server, checks };
}

function printOutput(value, json, stdout = process.stdout) {
  if (typeof value === 'string' && !json) stdout.write(`${value}\n`);
  else stdout.write(`${JSON.stringify(value, null, json ? 0 : 2)}\n`);
}

function printError(error, json, stderr = process.stderr) {
  const known = error instanceof CliError
    ? error
    : new CliError('unexpected_error', sanitizeText(error?.message || error), EXIT_CODES.server);
  const envelope = {
    code: known.code,
    message: sanitizeText(known.message),
    retryable: known.retryable,
    ...(known.userAction ? { user_action: known.userAction } : {}),
    ...(known.requestId ? { request_id: known.requestId } : {}),
    ...(known.details !== undefined ? { details: known.details } : {}),
  };
  if (json) stderr.write(`${JSON.stringify({ error: envelope })}\n`);
  else stderr.write(`Pearl error [${envelope.code}]: ${envelope.message}${envelope.request_id ? ` (request ${envelope.request_id})` : ''}\n`);
  return known.exitCode;
}

export async function runCli(argv = process.argv.slice(2), dependencies = {}) {
  let parsed;
  try {
    parsed = parseArgs(argv);
    const command = parsed.positionals.shift();
    if (parsed.flags.version || command === 'version') {
      printOutput(VERSION, parsed.flags.json, dependencies.stdout);
      return EXIT_CODES.success;
    }
    if (parsed.flags.help || !command || command === 'help') {
      printOutput(helpText(), false, dependencies.stdout);
      return EXIT_CODES.success;
    }
    validateCommandFlags(command, parsed.flags);
    const server = normalizeServer(parsed.flags.server || process.env.PEARL_AGENT_URL || DEFAULT_SERVER, {
      allowLoopbackHttp: parsed.flags['allow-loopback-http'] === true,
    });
    const timeoutMs = parseTimeout(parsed.flags.timeout);
    const fetchImpl = dependencies.fetchImpl ?? fetch;
    const readCredentialImpl = dependencies.readCredentialImpl ?? readCredential;
    const writeCredentialImpl = dependencies.writeCredentialImpl ?? writeCredential;
    const deleteCredentialImpl = dependencies.deleteCredentialImpl ?? deleteCredential;
    const load = () => loadSession(server, {
      readCredentialImpl,
      writeCredentialImpl,
      withCredentialLockImpl: dependencies.withCredentialLockImpl,
      refreshImpl: dependencies.refreshImpl,
      fetchImpl,
      timeoutMs,
    });
    let result;

    if (command === 'login') {
      requirePositionals(parsed.positionals, 0, 'Usage: pearl login [--scope READ_SCOPE,...] [--no-open]');
      const session = await (dependencies.loginImpl ?? login)({
        server,
        scopes: parsed.flags.scope ? parsed.flags.scope.split(',') : DEFAULT_SCOPES,
        noOpen: parsed.flags['no-open'] === true,
        fetchImpl,
        timeoutMs,
      });
      await writeCredentialImpl(credentialAccount(server), JSON.stringify(session));
      result = { connected: true, server, scopes: String(session.scope || '').split(/\s+/).filter(Boolean), expires_at: new Date(session.expires_at).toISOString() };
    } else if (command === 'status') {
      requirePositionals(parsed.positionals, 0, 'Usage: pearl status');
      const raw = await readCredentialImpl(credentialAccount(server));
      if (!raw) result = { connected: false, server };
      else {
        let session;
        try { session = validateSession(JSON.parse(raw), server); }
        catch { throw new CliError('invalid_credentials', 'Stored Pearl credentials are invalid. Run pearl logout, then pearl login.', EXIT_CODES.unauthenticated); }
        result = { connected: true, server, scopes: String(session.scope || '').split(/\s+/).filter(Boolean), expires_at: new Date(session.expires_at).toISOString() };
      }
    } else if (command === 'logout') {
      requirePositionals(parsed.positionals, 0, 'Usage: pearl logout');
      const raw = await readCredentialImpl(credentialAccount(server));
      let remoteRevoked = false;
      let warning;
      if (raw) {
        try {
          await (dependencies.revokeImpl ?? revoke)(validateSession(JSON.parse(raw), server), { fetchImpl, timeoutMs });
          remoteRevoked = true;
        } catch {
          warning = 'Local credentials were removed, but remote revocation could not be confirmed.';
        } finally {
          await deleteCredentialImpl(credentialAccount(server));
        }
      }
      result = { connected: false, remote_revoked: remoteRevoked, ...(warning ? { warning } : {}) };
    } else if (command === 'doctor') {
      requirePositionals(parsed.positionals, 0, 'Usage: pearl doctor [--authenticated]');
      result = await doctor({ server, authenticated: parsed.flags.authenticated === true, fetchImpl, timeoutMs, sessionLoader: load });
    } else if (command === 'mcp-url') {
      requirePositionals(parsed.positionals, 0, 'Usage: pearl mcp-url');
      result = `${server}/mcp`;
    } else if (command === 'tools') {
      requirePositionals(parsed.positionals, 0, 'Usage: pearl tools');
      result = await runtimeCapabilities({ server, session: await load(), fetchImpl, timeoutMs });
    } else {
      let request;
      if (command === 'call') {
        if (parsed.positionals.length < 1 || parsed.positionals.length > 2) {
          throw new CliError('usage', 'Usage: pearl call <tool> [--input JSON | --input-file PATH]', EXIT_CODES.usage);
        }
        const [capability, positionalInput] = parsed.positionals;
        request = { capability, arguments: await optionalInput(parsed.flags, positionalInput, dependencies.readFileImpl) };
      } else {
        request = await aliasRequest(command, parsed.positionals, parsed.flags, dependencies.readFileImpl);
      }
      result = await executeReadCapability({ server, session: await load(), ...request, fetchImpl, timeoutMs });
    }

    printOutput(result, parsed.flags.json === true, dependencies.stdout);
    return command === 'doctor' && result.ok !== true ? EXIT_CODES.server : EXIT_CODES.success;
  } catch (error) {
    return printError(error, parsed?.flags?.json === true, dependencies.stderr);
  }
}

const invokedPath = process.argv[1]
  ? (() => {
    try { return realpathSync(process.argv[1]); } catch { return process.argv[1]; }
  })()
  : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
