#!/usr/bin/env node

const ORIGIN = "https://agent.joinpearl.co";
const MCP_URL = `${ORIGIN}/mcp`;
const RESOURCE_METADATA_URL = `${ORIGIN}/.well-known/oauth-protected-resource/mcp`;
const REQUIRE_OPENAI_CHALLENGE = process.argv.includes("--require-openai-challenge");
const REQUIRE_STATIC_HOST_CLIENTS = process.argv.includes("--require-static-host-clients");
const PUBLIC_READ_SCOPES = [
  "venues:read",
  "profile:read",
  "visits:read",
  "saves:read",
  "friends:read",
  "trips:read",
  "reservations:read"
];
const STATIC_HOST_CLIENTS = [
  {
    clientId: "pearl-claude-hosted",
    callbacks: ["https://claude.ai/api/mcp/auth_callback"]
  },
  {
    clientId: "pearl-cursor",
    callbacks: [
      "https://www.cursor.com/agents/mcp/oauth/callback",
      "http://localhost:8787/callback"
    ]
  }
];

async function request(path, init = {}) {
  return fetch(`${ORIGIN}${path}`, { ...init, signal: AbortSignal.timeout(10_000) });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectAuthorizationError(clientId, redirectUri, scopes, expectedError) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: "A".repeat(43),
    code_challenge_method: "S256",
    state: "pearl-package-validator",
    scope: scopes.join(" "),
    // This deliberately invalid resource forces a response before the server
    // can persist an authorization request or display member consent.
    resource: "https://invalid.example/mcp"
  });
  const response = await request(`/oauth/authorize?${params}`, { redirect: "manual" });
  assert(response.status === 302, `${clientId} authorization probe returned ${response.status}`);
  const location = response.headers.get("location");
  assert(location, `${clientId} authorization probe omitted Location`);
  const callback = new URL(location);
  const expectedCallback = new URL(redirectUri);
  assert(callback.origin === expectedCallback.origin && callback.pathname === expectedCallback.pathname,
    `${clientId} authorization probe redirected to an unexpected callback`);
  assert(callback.searchParams.get("error") === expectedError,
    `${clientId} authorization probe returned ${callback.searchParams.get("error") ?? "no OAuth error"}, expected ${expectedError}`);
  assert(callback.searchParams.get("state") === "pearl-package-validator", `${clientId} authorization probe did not preserve state`);
}

const health = await request("/health");
assert(health.status === 200, `health returned ${health.status}`);

const authResponse = await request("/.well-known/oauth-authorization-server");
assert(authResponse.status === 200, `authorization metadata returned ${authResponse.status}`);
const auth = await authResponse.json();
assert(auth.client_id_metadata_document_supported === true, "authorization metadata must advertise CIMD");
assert(!("registration_endpoint" in auth), "authorization metadata must not advertise DCR");
assert(auth.token_endpoint_auth_methods_supported?.includes("none"), "authorization metadata must support public clients");
assert(auth.code_challenge_methods_supported?.includes("S256"), "authorization metadata must require PKCE S256");

const resourceResponse = await request("/.well-known/oauth-protected-resource/mcp");
assert(resourceResponse.status === 200, `protected-resource metadata returned ${resourceResponse.status}`);
const resource = await resourceResponse.json();
assert(resource.resource === MCP_URL, `protected resource must be ${MCP_URL}`);
assert(resource.authorization_servers?.length === 1 && resource.authorization_servers[0] === ORIGIN, "protected resource must use Pearl's one authorization server");

const mcpGet = await request("/mcp");
assert(mcpGet.status === 405, `MCP GET must fail closed with 405, received ${mcpGet.status}`);

const initialize = await request("/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "pearl-package-validator", version: "0.8.8" }
    }
  })
});
assert(initialize.status === 401, `unauthenticated MCP initialize must return 401, received ${initialize.status}`);
const challenge = initialize.headers.get("www-authenticate") ?? "";
assert(challenge.includes(`resource_metadata=\"${RESOURCE_METADATA_URL}\"`), "MCP challenge must point to path-specific protected-resource metadata");

const register = await request("/oauth/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}"
});
assert(register.status === 404, `DCR endpoint must remain unavailable with 404, received ${register.status}`);

if (REQUIRE_OPENAI_CHALLENGE) {
  const expected = process.env.PEARL_EXPECTED_OPENAI_APPS_CHALLENGE_TOKEN?.trim() ?? "";
  assert(expected.length > 0, "PEARL_EXPECTED_OPENAI_APPS_CHALLENGE_TOKEN must be set outside tracked files");
  const challengeResponse = await request("/.well-known/openai-apps-challenge");
  assert(challengeResponse.status === 200, `OpenAI Apps challenge returned ${challengeResponse.status}`);
  assert((await challengeResponse.text()).trim() === expected, "OpenAI Apps challenge body did not exactly match the portal token");
}

if (REQUIRE_STATIC_HOST_CLIENTS) {
  for (const { clientId, callbacks } of STATIC_HOST_CLIENTS) {
    for (const callback of callbacks) {
      await expectAuthorizationError(clientId, callback, PUBLIC_READ_SCOPES, "invalid_target");
    }
    const unsupportedMutationScope = ["validation", "write"].join(":");
    await expectAuthorizationError(clientId, callbacks[0], [...PUBLIC_READ_SCOPES, unsupportedMutationScope], "invalid_scope");
  }
}

const validations = [
  REQUIRE_STATIC_HOST_CLIENTS ? "static host-client registrations" : null,
  REQUIRE_OPENAI_CHALLENGE ? "the OpenAI Apps challenge" : null
].filter(Boolean);
console.log(`Pearl live discovery and unauthenticated MCP validation passed${validations.length ? ` with ${validations.join(" and ")}` : ""}.`);
