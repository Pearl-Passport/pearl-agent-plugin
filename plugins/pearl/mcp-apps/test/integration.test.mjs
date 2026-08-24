import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildHtml, digestHtml } from "../scripts/build.mjs";
import { buildFixtureHarness } from "../scripts/render-fixture.mjs";
import {
  createPearlMcpAppResource,
  PEARL_MCP_APP_MAX_RESPONSE_BYTES,
  PEARL_MCP_APP_CSP,
  PEARL_MCP_APP_MIME_TYPE,
  PEARL_MCP_APP_RESOURCE,
  PEARL_MCP_APP_RESOURCE_URI,
  PEARL_MCP_APP_TOOL_NAMES,
  pearlMcpAppSupportsTool,
  withPearlMcpAppMeta,
} from "../src/integration.mjs";
import {
  PEARL_MCP_APP_ARTIFACT_BYTES,
  PEARL_MCP_APP_ARTIFACT_HTML,
  PEARL_MCP_APP_ARTIFACT_SHA256,
} from "../src/artifact.generated.mjs";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("build is deterministic and self-contained", async () => {
  const first = await buildHtml();
  const second = await buildHtml();
  assert.equal(first, second);
  assert.match(digestHtml(first), /^[a-f0-9]{64}$/);
  assert.match(first, /^<!doctype html>/i);
  assert.match(first, /ui\/initialize/);
  assert.match(first, /ui\/notifications\/initialized/);
  assert.match(first, /ui\/notifications\/tool-result/);
  assert.match(first, /ui\/notifications\/size-changed/);
  assert.doesNotMatch(first, /<link\b|<iframe\b|<form\b/i);
  assert.doesNotMatch(first, /https?:\/\//i);
  assert.ok(Buffer.byteLength(first) < 256 * 1024);
});

test("portable UI metadata is primary and ChatGPT alias is optional", () => {
  const original = { title: "Render", _meta: { existing: true } };
  const portable = withPearlMcpAppMeta(original, { chatgptCompatibility: false });
  assert.equal(portable._meta.ui.resourceUri, PEARL_MCP_APP_RESOURCE_URI);
  assert.equal(portable._meta["openai/outputTemplate"], undefined);
  assert.deepEqual(original, { title: "Render", _meta: { existing: true } });

  const compatible = withPearlMcpAppMeta(original);
  assert.equal(compatible._meta.ui.resourceUri, PEARL_MCP_APP_RESOURCE_URI);
  assert.equal(compatible._meta["openai/outputTemplate"], PEARL_MCP_APP_RESOURCE_URI);
});

test("resource response is versioned, correctly typed, and deny-by-default", async () => {
  const html = await buildHtml();
  const response = createPearlMcpAppResource();
  assert.equal(response.contents.length, 1);
  const content = response.contents[0];
  assert.equal(content.uri, "ui://pearl/concierge/v1/index.html");
  assert.equal(content.mimeType, PEARL_MCP_APP_MIME_TYPE);
  assert.equal(content.text, html);
  assert.equal(content.text, PEARL_MCP_APP_ARTIFACT_HTML);
  assert.equal(Buffer.byteLength(content.text), PEARL_MCP_APP_ARTIFACT_BYTES);
  assert.equal(digestHtml(content.text), PEARL_MCP_APP_ARTIFACT_SHA256);
  assert.equal(content._meta["pearl/artifactSha256"], PEARL_MCP_APP_ARTIFACT_SHA256);
  assert.equal(PEARL_MCP_APP_RESOURCE.descriptor._meta["pearl/artifactSha256"], PEARL_MCP_APP_ARTIFACT_SHA256);
  assert.equal(content._meta.ui.prefersBorder, true);
  assert.deepEqual(content._meta.ui.csp, PEARL_MCP_APP_CSP);
  assert.deepEqual(content._meta.ui.csp, {
    connectDomains: [],
    resourceDomains: [],
    frameDomains: [],
    baseUriDomains: [],
  });
  assert.ok(Buffer.byteLength(JSON.stringify(response)) < PEARL_MCP_APP_MAX_RESPONSE_BYTES);
  assert.notEqual(createPearlMcpAppResource(), response);
});

test("only reviewed read result shapes opt into the UI", () => {
  assert.deepEqual(PEARL_MCP_APP_TOOL_NAMES, [
    "venues_search",
    "venues_recommend",
    "venues_new_openings",
    "trip_get",
    "reservations_list",
  ]);
  for (const name of PEARL_MCP_APP_TOOL_NAMES) assert.equal(pearlMcpAppSupportsTool(name), true);
  const writeTool = ["saves", "change", "prepare"].join("_");
  for (const name of ["places_match", "trips_list", "reservation_get", writeTool, "venue_get"]) {
    assert.equal(pearlMcpAppSupportsTool(name), false);
  }
});

test("fixture harness simulates the standard parent bridge", async () => {
  const harness = buildFixtureHarness(await buildHtml(), { content: [], structuredContent: { venues: [{ name: "One" }] } }, "dark", { compare: true });
  assert.match(harness, /ui\/initialize/);
  assert.match(harness, /ui\/notifications\/initialized/);
  assert.match(harness, /ui\/notifications\/tool-result/);
  assert.match(harness, /readOnlyHint: true/);
  assert.match(harness, /button\.result-card/);
});

test("inline comparison uses system type and has no nested horizontal scroll", async () => {
  const [app, css] = await Promise.all([
    readFile(path.join(PACKAGE_ROOT, "src", "app.mjs"), "utf8"),
    readFile(path.join(PACKAGE_ROOT, "src", "styles.css"), "utf8"),
  ]);
  assert.match(app, /comparison-grid/);
  assert.doesNotMatch(app, /comparison-scroll|Scrollable venue comparison/);
  assert.match(css, /-apple-system/);
  assert.match(css, /BlinkMacSystemFont/);
  assert.doesNotMatch(css, /overflow-x\s*:\s*(?:auto|scroll)/i);
  assert.doesNotMatch(css, /Geist|Iowan Old Style/);
});
