import assert from 'node:assert/strict';
import test from 'node:test';
import { runCli, DEFAULT_SERVER, EXIT_CODES } from '../src/index.mjs';

function outputSink() {
  let text = '';
  return { stream: { write(value) { text += value; } }, value: () => text };
}
function response(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function doctorMetadata() {
  return {
    issuer: DEFAULT_SERVER,
    authorization_endpoint: `${DEFAULT_SERVER}/oauth/authorize`,
    token_endpoint: `${DEFAULT_SERVER}/oauth/token`,
    revocation_endpoint: `${DEFAULT_SERVER}/oauth/revoke`,
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    authorization_response_iss_parameter_supported: true,
  };
}

function doctorCredentials(expiresAt = Date.now() + 600_000) {
  return {
    server: DEFAULT_SERVER,
    access_token: ['private', 'access'].join('-'),
    refresh_token: ['private', 'refresh'].join('-'),
    expires_at: expiresAt,
  };
}

async function runDoctor({ authenticated = true, catalogStatus = 200, catalog = { capabilities: [] },
  metadata = doctorMetadata(), credentials = doctorCredentials(),
  healthStatus = 200, health = { ok: true, version: '1.2.3' }, oauthStatus = 200,
  ...overrides } = {}) {
  const stdout = outputSink();
  const stderr = outputSink();
  const calls = [];
  let reads = 0;
  let writes = 0;
  const exitCode = await runCli(['doctor', ...(authenticated ? ['--authenticated'] : []), '--json'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    readCredentialImpl: async () => { reads++; return credentials === null ? null : JSON.stringify(credentials); },
    writeCredentialImpl: async () => { writes++; },
    deleteCredentialImpl: async () => { throw new Error('Doctor must never delete credentials.'); },
    withCredentialLockImpl: async (_account, operation) => operation(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url === `${DEFAULT_SERVER}/health`) return response(healthStatus, health);
      if (url === `${DEFAULT_SERVER}/.well-known/oauth-authorization-server`) return response(oauthStatus, metadata);
      assert.equal(url, `${DEFAULT_SERVER}/api/v1/capabilities`);
      return response(catalogStatus, catalog);
    },
    ...overrides,
  });
  assert.equal(stderr.value(), '');
  return { report: JSON.parse(stdout.value()), output: stdout.value(), calls, reads, writes, exitCode };
}

test('doctor is public by default and reports only known workflow availability when authenticated', async () => {
  const publicResult = await runDoctor({ authenticated: false });
  assert.equal(publicResult.exitCode, EXIT_CODES.success);
  assert.equal(publicResult.reads, 0);
  assert.equal(publicResult.calls.length, 2);
  const result = await runDoctor({ catalog: { capabilities: [
    { name: 'venues_search', annotations: { readOnlyHint: true } },
    { name: 'private-tool-name', description: 'private-description', annotations: { readOnlyHint: true } },
    { name: 'private-write-tool', annotations: { readOnlyHint: false } },
  ] } });
  assert.equal(result.exitCode, EXIT_CODES.success);
  assert.equal(result.report.ok, true);
  assert.equal(result.report.checks[2].read_tool_count, 2);
  assert.equal(result.report.checks[3].available.search, true);
  assert.equal(result.report.checks[3].available.trips, false);
  assert.equal(result.calls.length, 3);
  assert(result.calls.every(({ options }) => options.method === 'GET'));
  assert.equal(result.writes, 0);
  assert(!result.output.includes('private-'));
});

test('doctor preserves checks and exit codes while classifying structured connection failures', async () => {
  for (const [status, code, state, exitCode] of [
    [401, 'invalid_token', 'reconnect_required', EXIT_CODES.unauthenticated],
    [403, 'insufficient_scope', 'permission_required', EXIT_CODES.insufficientScope],
    [403, 'elite_required', 'membership_required', EXIT_CODES.server],
    [403, 'active_membership_required', 'membership_required', EXIT_CODES.server],
    [400, 'unauthorized_client', 'client_unavailable', EXIT_CODES.server],
    [403, 'private-unknown-code', 'access_not_established', EXIT_CODES.server],
    [503, 'membership_check_failed', 'temporarily_unavailable', EXIT_CODES.server],
    [429, 'rate_limit_exceeded', 'temporarily_unavailable', EXIT_CODES.server],
    [400, 'private-unknown-code', 'not_established', EXIT_CODES.server],
  ]) {
    const result = await runDoctor({ catalogStatus: status, catalog: { error: {
      code, message: 'private-member-email', request_id: 'private-request-id', user_action: 'private-action',
      details: { access_token: ['private', 'token'].join('-'), member_id: 'private-member' },
    } } });
    assert.equal(result.exitCode, exitCode, code);
    assert.equal(result.report.ok, false);
    assert.deepEqual(result.report.checks.map((check) => check.ok), [true, true, false]);
    assert.equal(result.report.checks[2].diagnostic.state, state, code);
    assert(!result.output.includes('private-'), code);
    assert.equal(result.writes, 0);
  }
  const missing = await runDoctor({ credentials: null });
  assert.equal(missing.report.checks[2].diagnostic.state, 'not_connected');
  assert.equal(missing.exitCode, EXIT_CODES.unauthenticated);
  assert.equal(missing.calls.length, 2);
});

test('doctor retains refresh evidence without exposing it or erasing credentials', async () => {
  for (const [code, status, state, exitCode] of [
    ['invalid_grant', 400, 'reconnect_required', EXIT_CODES.unauthenticated],
    ['active_membership_required', 403, 'membership_required', EXIT_CODES.unauthenticated],
    ['unauthorized_client', 403, 'client_unavailable', EXIT_CODES.unauthenticated],
    ['private-unknown-code', 403, 'access_not_established', EXIT_CODES.unauthenticated],
    ['invalid_scope', 400, 'permission_required', EXIT_CODES.network],
    ['temporarily_unavailable', 503, 'temporarily_unavailable', EXIT_CODES.network],
  ]) {
    const result = await runDoctor({
      credentials: doctorCredentials(0),
      refreshImpl: async () => { throw Object.assign(new Error('private-server-message'), { code, status }); },
    });
    assert.equal(result.report.checks[2].diagnostic.state, state, code);
    assert.equal(result.exitCode, exitCode, code);
    assert.equal(result.writes, 0);
    assert.equal(result.calls.length, 2);
    assert(!result.output.includes('private-'), code);
  }
});

test('doctor rejects incompatible discovery without reading credentials or echoing the endpoint', async () => {
  for (const key of ['issuer', 'authorization_endpoint', 'token_endpoint', 'revocation_endpoint']) {
    const result = await runDoctor({ metadata: { ...doctorMetadata(), [key]: 'https://private-upstream.example/private-token' } });
    assert.equal(result.report.checks[1].diagnostic.state, 'incompatible_server');
    assert.equal(result.exitCode, EXIT_CODES.server);
    assert.equal(result.reads, 0);
    assert.equal(result.calls.length, 2);
    assert(!result.output.includes('private-'));
  }
  for (const [key, value] of [
    ['code_challenge_methods_supported', 'S256'],
    ['token_endpoint_auth_methods_supported', 'none'],
    ['authorization_response_iss_parameter_supported', 'true'],
  ]) {
    const result = await runDoctor({ metadata: { ...doctorMetadata(), [key]: value } });
    assert.equal(result.report.checks[1].diagnostic.state, 'incompatible_server');
    assert.equal(result.reads, 0);
  }
});

test('doctor bounds failed reports and does not print network errors or arbitrary health fields', async () => {
  const network = await runDoctor({ fetchImpl: async () => { throw new Error('private-network-details'); } });
  assert.equal(network.report.checks.length, 1);
  assert.equal(network.report.checks[0].diagnostic.state, 'temporarily_unavailable');
  assert.equal(network.exitCode, EXIT_CODES.network);
  assert(!network.output.includes('private-'));
  const unhealthy = await runDoctor({ fetchImpl: async () => response(200, { ok: false, version: 'private-member', details: 'private-token' }) });
  assert.equal(unhealthy.report.checks.length, 1);
  assert.equal(unhealthy.reads, 0);
  assert.equal(unhealthy.exitCode, EXIT_CODES.server);
  assert(!unhealthy.output.includes('private-'));
  const oversized = await runDoctor({ fetchImpl: async () => response(200, {}, { 'content-length': String(3 * 1024 * 1024) }) });
  assert.equal(oversized.exitCode, EXIT_CODES.server);
  assert.equal(oversized.report.checks.length, 1);
});

test('public doctor failures never diagnose a stored sign-in or membership', async () => {
  for (const stage of ['gateway', 'oauth']) {
    for (const [status, code, state, exitCode] of [
      [401, 'invalid_token', 'not_established', EXIT_CODES.unauthenticated],
      [403, 'elite_required', 'not_established', EXIT_CODES.server],
      [403, 'insufficient_scope', 'not_established', EXIT_CODES.insufficientScope],
      [400, 'invalid_client', 'not_established', EXIT_CODES.server],
      [429, 'rate_limit_exceeded', 'temporarily_unavailable', EXIT_CODES.server],
      [503, 'active_membership_required', 'temporarily_unavailable', EXIT_CODES.server],
    ]) {
      const payload = { error: { code, message: 'private-upstream', details: 'private-details' } };
      const result = await runDoctor(stage === 'gateway'
        ? { healthStatus: status, health: payload }
        : { oauthStatus: status, metadata: payload });
      assert.equal(result.exitCode, exitCode, `${stage} ${code}`);
      assert.equal(result.reads, 0);
      assert.equal(result.writes, 0);
      assert.equal(result.report.checks.at(-1).name, stage);
      assert.equal(result.report.checks.at(-1).diagnostic.state, state, `${stage} ${code}`);
      assert.doesNotMatch(result.output, /membership|pearl login|no longer usable|private-/i);
    }
  }
});
