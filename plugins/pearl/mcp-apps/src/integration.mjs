import {
  PEARL_MCP_APP_ARTIFACT_BYTES,
  PEARL_MCP_APP_ARTIFACT_HTML,
  PEARL_MCP_APP_ARTIFACT_SHA256,
} from "./artifact.generated.mjs";

export const PEARL_MCP_APP_VERSION = "1.2.3";
// Hosts cache UI resources by URI. Change this URI whenever the bundled HTML,
// JavaScript, or CSS changes so clients cannot reuse an obsolete card bundle.
export const PEARL_MCP_APP_RESOURCE_URI = "ui://pearl/concierge/v5/index.html";
// ChatGPT can retain tools/list metadata for an already-open conversation.
// Keep the bounded reviewed resource history readable so those conversations
// load the current artifact instead of silently dropping the card.
export const PEARL_MCP_APP_COMPATIBILITY_RESOURCE_URIS = Object.freeze([
  "ui://pearl/concierge/v4/index.html",
  "ui://pearl/concierge/v3/index.html",
]);
export const PEARL_MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
export const PEARL_MCP_APP_MAX_RESOURCE_BYTES = 256 * 1024;
export const PEARL_MCP_APP_MAX_RESPONSE_BYTES = 320 * 1024;
export const PEARL_MCP_APP_VISIBILITY = Object.freeze(["model", "app"]);
// OpenAI and Claude intentionally use different formats for the same portable
// ui.domain field. OpenAI receives Pearl's verified HTTPS component origin.
// Claude receives the deterministic sandbox host derived from the exact MCP
// connector URL. The deny-by-default CSP below remains authoritative in both.
export const PEARL_MCP_APP_DOMAIN = "https://agent.joinpearl.co";
export const PEARL_CLAUDE_MCP_APP_DOMAIN = "61326a67f094099d1f34519381c01e4a.claudemcpcontent.com";

export const PEARL_MCP_APP_TOOL_NAMES = Object.freeze([
  "venues_search",
  "venues_recommend",
  "venues_new_openings",
  "profile_get",
  "trips_list",
  "trip_get",
  "reservations_list",
]);

export const PEARL_MCP_APP_CSP = Object.freeze({
  connectDomains: Object.freeze([]),
  resourceDomains: Object.freeze([]),
  frameDomains: Object.freeze([]),
  baseUriDomains: Object.freeze([]),
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

/**
 * Attach the portable MCP Apps field first and an optional ChatGPT alias
 * second. This helper does not register, advertise, or enable the tool.
 */
export function withPearlMcpAppMeta(toolDefinition, { chatgptCompatibility = true } = {}) {
  const definition = record(toolDefinition, "toolDefinition");
  const currentMeta = definition._meta === undefined ? {} : record(definition._meta, "toolDefinition._meta");
  const currentUi = currentMeta.ui === undefined ? {} : record(currentMeta.ui, "toolDefinition._meta.ui");
  return {
    ...definition,
    _meta: {
      ...currentMeta,
      ui: {
        ...currentUi,
        resourceUri: PEARL_MCP_APP_RESOURCE_URI,
        visibility: [...PEARL_MCP_APP_VISIBILITY],
      },
      ...(chatgptCompatibility
        ? { "openai/outputTemplate": PEARL_MCP_APP_RESOURCE_URI }
        : {}),
    },
  };
}

export function pearlMcpAppSupportsTool(name) {
  return typeof name === "string" && PEARL_MCP_APP_TOOL_NAMES.includes(name);
}

const artifactMeta = {
  "pearl/artifactSha256": PEARL_MCP_APP_ARTIFACT_SHA256,
  "pearl/artifactBytes": PEARL_MCP_APP_ARTIFACT_BYTES,
};

function createResourceDefinition(uri, compatibility = false) {
  return {
    descriptor: {
      uri,
      name: compatibility ? "Pearl Concierge (compatibility)" : "Pearl Concierge",
      description: "A read-only presentation for supported Pearl venue, taste-profile, trip, and reservation results.",
      mimeType: PEARL_MCP_APP_MIME_TYPE,
      _meta: artifactMeta,
    },
    readResult: {
      contents: [{
        uri,
        mimeType: PEARL_MCP_APP_MIME_TYPE,
        text: PEARL_MCP_APP_ARTIFACT_HTML,
        _meta: {
          ...artifactMeta,
          ui: {
            prefersBorder: true,
            csp: PEARL_MCP_APP_CSP,
            domain: PEARL_MCP_APP_DOMAIN,
          },
          "openai/widgetPrefersBorder": true,
          "openai/widgetDomain": PEARL_MCP_APP_DOMAIN,
          "openai/widgetCSP": {
            connect_domains: [],
            resource_domains: [],
            frame_domains: [],
          },
        },
      }],
    },
  };
}

/** Canonical resource advertised by current tools/list responses. */
export const PEARL_MCP_APP_RESOURCE = deepFreeze(
  createResourceDefinition(PEARL_MCP_APP_RESOURCE_URI),
);

/** Canonical resource plus bounded compatibility aliases for stale hosts. */
export const PEARL_MCP_APP_RESOURCES = deepFreeze([
  PEARL_MCP_APP_RESOURCE,
  ...PEARL_MCP_APP_COMPATIBILITY_RESOURCE_URIS.map((uri) => createResourceDefinition(uri, true)),
]);

const pearlMcpAppResourceByUri = new Map(
  PEARL_MCP_APP_RESOURCES.map((resource) => [resource.descriptor.uri, resource]),
);

const actualArtifactBytes = new TextEncoder().encode(PEARL_MCP_APP_ARTIFACT_HTML).byteLength;
if (actualArtifactBytes !== PEARL_MCP_APP_ARTIFACT_BYTES) {
  throw new Error("Generated Pearl MCP App artifact byte count does not match its manifest");
}
if (actualArtifactBytes < 512 || actualArtifactBytes > PEARL_MCP_APP_MAX_RESOURCE_BYTES) {
  throw new Error("Generated Pearl MCP App resource is outside its byte budget");
}
if (!/^<!doctype html>/i.test(PEARL_MCP_APP_ARTIFACT_HTML.trimStart())) {
  throw new Error("Generated Pearl MCP App resource is not a complete HTML document");
}
for (const resource of PEARL_MCP_APP_RESOURCES) {
  const responseBytes = new TextEncoder().encode(JSON.stringify(resource.readResult)).byteLength;
  if (responseBytes > PEARL_MCP_APP_MAX_RESPONSE_BYTES) {
    throw new Error("Generated Pearl MCP App response is outside its byte budget");
  }
}

/** Return a fresh response so request handling remains stateless. */
export function createPearlMcpAppResource(
  uri = PEARL_MCP_APP_RESOURCE_URI,
  { uiDomain = PEARL_MCP_APP_DOMAIN } = {},
) {
  const resource = pearlMcpAppResourceByUri.get(uri);
  if (!resource) throw new RangeError(`Unsupported Pearl MCP App resource URI: ${uri}`);
  if (![PEARL_MCP_APP_DOMAIN, PEARL_CLAUDE_MCP_APP_DOMAIN].includes(uiDomain)) {
    throw new RangeError(`Unsupported Pearl MCP App UI domain: ${uiDomain}`);
  }
  const response = structuredClone(resource.readResult);
  response.contents[0]._meta.ui.domain = uiDomain;
  return response;
}
