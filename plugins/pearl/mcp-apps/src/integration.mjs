import {
  PEARL_MCP_APP_ARTIFACT_BYTES,
  PEARL_MCP_APP_ARTIFACT_HTML,
  PEARL_MCP_APP_ARTIFACT_SHA256,
} from "./artifact.generated.mjs";

export const PEARL_MCP_APP_VERSION = "1.0.0";
export const PEARL_MCP_APP_RESOURCE_URI = "ui://pearl/concierge/v1/index.html";
export const PEARL_MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
export const PEARL_MCP_APP_MAX_RESOURCE_BYTES = 256 * 1024;
export const PEARL_MCP_APP_MAX_RESPONSE_BYTES = 320 * 1024;

export const PEARL_MCP_APP_TOOL_NAMES = Object.freeze([
  "venues_search",
  "venues_recommend",
  "venues_new_openings",
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
      ui: { ...currentUi, resourceUri: PEARL_MCP_APP_RESOURCE_URI },
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

/** The one static resource definition registered by every MCP protocol path. */
export const PEARL_MCP_APP_RESOURCE = deepFreeze({
  descriptor: {
    uri: PEARL_MCP_APP_RESOURCE_URI,
    name: "Pearl Concierge",
    description: "A read-only presentation for supported Pearl venue, trip-stop, and reservation results.",
    mimeType: PEARL_MCP_APP_MIME_TYPE,
    _meta: artifactMeta,
  },
  readResult: {
    contents: [{
      uri: PEARL_MCP_APP_RESOURCE_URI,
      mimeType: PEARL_MCP_APP_MIME_TYPE,
      text: PEARL_MCP_APP_ARTIFACT_HTML,
      _meta: {
        ...artifactMeta,
        ui: {
          prefersBorder: true,
          csp: PEARL_MCP_APP_CSP,
        },
        "openai/widgetPrefersBorder": true,
        "openai/widgetCSP": {
          connect_domains: [],
          resource_domains: [],
          frame_domains: [],
        },
      },
    }],
  },
});

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
const responseBytes = new TextEncoder().encode(JSON.stringify(PEARL_MCP_APP_RESOURCE.readResult)).byteLength;
if (responseBytes > PEARL_MCP_APP_MAX_RESPONSE_BYTES) {
  throw new Error("Generated Pearl MCP App response is outside its byte budget");
}

/** Return a fresh response so request handling remains stateless. */
export function createPearlMcpAppResource() {
  return structuredClone(PEARL_MCP_APP_RESOURCE.readResult);
}
