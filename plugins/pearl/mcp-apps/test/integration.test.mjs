import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildHtml, digestHtml } from "../scripts/build.mjs";
import { buildFixtureHarness } from "../scripts/render-fixture.mjs";
import {
  createPearlMcpAppResource,
  PEARL_CLAUDE_MCP_APP_DOMAIN,
  PEARL_MCP_APP_COMPATIBILITY_RESOURCE_URIS,
  PEARL_MCP_APP_DOMAIN,
  PEARL_MCP_APP_IMAGE_ORIGIN,
  PEARL_MCP_APP_MAX_RESPONSE_BYTES,
  PEARL_MCP_APP_CSP,
  PEARL_MCP_APP_MIME_TYPE,
  PEARL_MCP_APP_RESOURCE,
  PEARL_MCP_APP_RESOURCES,
  PEARL_MCP_APP_RESOURCE_URI,
  PEARL_MCP_APP_TOOL_NAMES,
  PEARL_MCP_APP_VERSION,
  PEARL_MCP_APP_VISIBILITY,
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
  // The approved image origin is the only permitted network URL reference;
  // the W3C SVG namespace identifier is inert (createElementNS, never fetched).
  assert.doesNotMatch(
    first.replaceAll(PEARL_MCP_APP_IMAGE_ORIGIN, "").replaceAll("http://www.w3.org/2000/svg", ""),
    /https?:\/\//i,
  );
  assert.match(first, /img-src data: https:\/\/agent\.joinpearl\.co;/);
  assert.match(first, /script-src 'sha256-[A-Za-z0-9+/]{43}='/);
  assert.match(first, /style-src 'sha256-[A-Za-z0-9+/]{43}='/);
  assert.doesNotMatch(first, /unsafe-inline|unsafe-eval/);
  assert.ok(Buffer.byteLength(first) < 256 * 1024);
});

test("portable UI metadata is primary and ChatGPT alias is optional", () => {
  const original = { title: "Render", _meta: { existing: true } };
  const portable = withPearlMcpAppMeta(original, { chatgptCompatibility: false });
  assert.equal(portable._meta.ui.resourceUri, PEARL_MCP_APP_RESOURCE_URI);
  assert.deepEqual(portable._meta.ui.visibility, PEARL_MCP_APP_VISIBILITY);
  assert.equal(portable._meta["openai/outputTemplate"], undefined);
  assert.deepEqual(original, { title: "Render", _meta: { existing: true } });

  const compatible = withPearlMcpAppMeta(original);
  assert.equal(compatible._meta.ui.resourceUri, PEARL_MCP_APP_RESOURCE_URI);
  assert.deepEqual(compatible._meta.ui.visibility, ["model", "app"]);
  assert.equal(compatible._meta["openai/outputTemplate"], PEARL_MCP_APP_RESOURCE_URI);
});

test("resource response is versioned, correctly typed, and deny-by-default", async () => {
  const html = await buildHtml();
  const response = createPearlMcpAppResource();
  assert.equal(response.contents.length, 1);
  const content = response.contents[0];
  assert.equal(PEARL_MCP_APP_VERSION, "1.4.0");
  assert.equal(content.uri, "ui://pearl/concierge/v7/index.html");
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
    resourceDomains: [PEARL_MCP_APP_IMAGE_ORIGIN],
    frameDomains: [],
    baseUriDomains: [],
  });
  assert.equal(PEARL_MCP_APP_IMAGE_ORIGIN, "https://agent.joinpearl.co");
  assert.deepEqual(content._meta["openai/widgetCSP"], {
    connect_domains: [],
    resource_domains: [PEARL_MCP_APP_IMAGE_ORIGIN],
    frame_domains: [],
  });
  assert.equal(PEARL_MCP_APP_DOMAIN, "https://agent.joinpearl.co");
  assert.equal(content._meta.ui.domain, PEARL_MCP_APP_DOMAIN);
  assert.equal(content._meta["openai/widgetDomain"], PEARL_MCP_APP_DOMAIN);
  assert.ok(Buffer.byteLength(JSON.stringify(response)) < PEARL_MCP_APP_MAX_RESPONSE_BYTES);
  assert.notEqual(createPearlMcpAppResource(), response);
});

test("Claude receives its connector-derived sandbox domain without changing the OpenAI alias", () => {
  const expectedClaudeDomain = `${createHash("sha256")
    .update("https://agent.joinpearl.co/mcp")
    .digest("hex")
    .slice(0, 32)}.claudemcpcontent.com`;
  assert.equal(PEARL_CLAUDE_MCP_APP_DOMAIN, expectedClaudeDomain);
  const content = createPearlMcpAppResource(
    PEARL_MCP_APP_RESOURCE_URI,
    { uiDomain: PEARL_CLAUDE_MCP_APP_DOMAIN },
  ).contents[0];
  assert.equal(content._meta.ui.domain, expectedClaudeDomain);
  assert.equal(content._meta["openai/widgetDomain"], PEARL_MCP_APP_DOMAIN);
  assert.throws(
    () => createPearlMcpAppResource(PEARL_MCP_APP_RESOURCE_URI, { uiDomain: "untrusted.example" }),
    /Unsupported Pearl MCP App UI domain/,
  );
  for (const lookalike of [
    `attacker.example/${PEARL_MCP_APP_DOMAIN}`,
    `${PEARL_MCP_APP_DOMAIN}.attacker.example`,
    `attacker.${PEARL_CLAUDE_MCP_APP_DOMAIN}`,
  ]) {
    assert.throws(
      () => createPearlMcpAppResource(PEARL_MCP_APP_RESOURCE_URI, { uiDomain: lookalike }),
      /Unsupported Pearl MCP App UI domain/,
    );
  }
});

test("bounded previous card URIs serve the current reviewed artifact", () => {
  assert.deepEqual(PEARL_MCP_APP_COMPATIBILITY_RESOURCE_URIS, [
    "ui://pearl/concierge/v6/index.html",
    "ui://pearl/concierge/v5/index.html",
  ]);
  assert.deepEqual(
    PEARL_MCP_APP_RESOURCES.map((resource) => resource.descriptor.uri),
    [PEARL_MCP_APP_RESOURCE_URI, ...PEARL_MCP_APP_COMPATIBILITY_RESOURCE_URIS],
  );
  for (const uri of PEARL_MCP_APP_COMPATIBILITY_RESOURCE_URIS) {
    const compatibility = createPearlMcpAppResource(uri);
    assert.equal(compatibility.contents[0].uri, uri);
    assert.equal(compatibility.contents[0].text, PEARL_MCP_APP_ARTIFACT_HTML);
    assert.equal(compatibility.contents[0]._meta["pearl/artifactSha256"], PEARL_MCP_APP_ARTIFACT_SHA256);
    assert.equal(compatibility.contents[0]._meta.ui.domain, PEARL_MCP_APP_DOMAIN);
    assert.equal(compatibility.contents[0]._meta["openai/widgetDomain"], PEARL_MCP_APP_DOMAIN);
  }
  assert.throws(
    () => createPearlMcpAppResource("ui://pearl/concierge/v999/index.html"),
    /Unsupported Pearl MCP App resource URI/,
  );
});

test("only reviewed read result shapes opt into the UI", () => {
  assert.deepEqual(PEARL_MCP_APP_TOOL_NAMES, [
    "venues_search",
    "venues_recommend",
    "venues_new_openings",
    "profile_get",
    "trips_list",
    "trip_get",
    "reservations_list",
  ]);
  for (const name of PEARL_MCP_APP_TOOL_NAMES) assert.equal(pearlMcpAppSupportsTool(name), true);
  const writeTool = ["saves", "change", "prepare"].join("_");
  for (const name of ["places_match", "reservation_get", writeTool, "venue_get"]) {
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

test("fixture harness can simulate a retained ChatGPT compatibility result", async () => {
  const harness = buildFixtureHarness(
    await buildHtml(),
    { structuredContent: { venues: [{ name: "One" }] } },
    "light",
    { compatibilityFallback: true },
  );
  assert.match(harness, /compatibilityFallback/);
  assert.match(harness, /event\.source\.openai = \{ toolOutput:/);
});

test("inline comparison uses system type and has no nested horizontal scroll", async () => {
  const [app, css] = await Promise.all([
    readFile(path.join(PACKAGE_ROOT, "src", "app.mjs"), "utf8"),
    readFile(path.join(PACKAGE_ROOT, "src", "styles.css"), "utf8"),
  ]);
  assert.match(app, /comparison-grid/);
  assert.match(app, /grid\.dataset\.count = String\(picked\.length\)/);
  assert.doesNotMatch(app, /comparison-scroll|Scrollable venue comparison/);
  assert.match(css, /-apple-system/);
  assert.match(css, /BlinkMacSystemFont/);
  assert.match(css, /\.comparison-grid\[data-count="3"\]/);
  assert.doesNotMatch(css, /@media \(min-width: 860px\)[\s\S]*?\.comparison-grid\s*\{[^}]*repeat\(3,/);
  assert.doesNotMatch(css, /overflow-x\s*:\s*(?:auto|scroll)/i);
  assert.doesNotMatch(css, /Geist|Iowan Old Style/);
});

test("taste profile UI uses fixed host questions and member-scoped statistics", async () => {
  const [app, css] = await Promise.all([
    readFile(path.join(PACKAGE_ROOT, "src", "app.mjs"), "utf8"),
    readFile(path.join(PACKAGE_ROOT, "src", "styles.css"), "utf8"),
  ]);
  assert.match(app, /Pearl profile statistics/);
  assert.match(app, /Taste evidence/);
  assert.match(app, /Strongest patterns/);
  assert.match(app, /Travel footprint/);
  assert.match(app, /Revisit behavior/);
  assert.match(app, /Exploration style/);
  assert.match(app, /Saves to visits/);
  assert.match(app, /Returned constraints/);
  assert.match(app, /if \(!model\.analytics && model\.allergies\.length\)/);
  assert.match(app, /Ask Pearl about your taste/);
  assert.match(app, /What are the strongest patterns in my Pearl taste profile\?/);
  assert.match(app, /Each question stays scoped to your own Pearl profile\./);
  assert.match(app, /node\.textContent = String\(text\)/);
  assert.doesNotMatch(app, /evidenceSources|authenticated_member_profile_constraints|canonical_committed_visit_history/);
  assert.doesNotMatch(app, /action_handle|access_token|refresh_token/);
  assert.match(css, /\.taste-pattern-grid/);
  assert.match(css, /\.taste-insight-grid/);
  assert.match(css, /\.evidence-summary/);
  assert.match(css, /@media \(min-width: 540px\)[\s\S]*?\.taste-insight-grid/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)[\s\S]*?\.taste-insight-card/);
  assert.match(css, /@media \(prefers-contrast: more\)[\s\S]*?\.taste-pattern-card/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*?\.constraint-item/);
});

test("profile analytics fixture supports light and dark host previews with the text fallback retained", async () => {
  const [html, profile] = await Promise.all([
    buildHtml(),
    readFile(path.join(PACKAGE_ROOT, "test", "fixtures", "profile.json"), "utf8").then(JSON.parse),
  ]);
  profile.content = [{ type: "text", text: "A complete taste summary remains available to text-only hosts." }];
  for (const theme of ["light", "dark"]) {
    const harness = buildFixtureHarness(html, profile, theme);
    assert.match(harness, new RegExp(`const theme = ${JSON.stringify(theme)}`));
    assert.match(harness, /complete taste summary remains available to text-only hosts/);
    assert.match(harness, /ui\/notifications\/tool-result/);
  }
});

test("journey family is host-adaptive, read-only, and accessible", async () => {
  const [app, css] = await Promise.all([
    readFile(path.join(PACKAGE_ROOT, "src", "app.mjs"), "utf8"),
    readFile(path.join(PACKAGE_ROOT, "src", "styles.css"), "utf8"),
  ]);
  assert.match(app, /function journeyCard\(/);
  assert.match(app, /function stopList\(/);
  assert.match(app, /function routeStrip\(/);
  assert.match(app, /Status unknown/);
  assert.match(app, /Read only · confirm fare and availability before booking/);
  assert.match(app, /Source:/);
  assert.match(app, /document\.documentElement\.dataset\.displayMode/);
  assert.match(app, /document\.documentElement\.dataset\.platform/);
  const journeyCardSource = app.slice(app.indexOf("function journeyCard("), app.indexOf("function journeyContent("));
  assert.doesNotMatch(journeyCardSource, /button\(|tools\/call|ui\/message|checkout/i);
  assert.match(css, /\.journey-card/);
  assert.match(css, /\.journey-stops/);
  assert.match(css, /\.route-strip/);
  assert.match(css, /:root\[data-display-mode="fullscreen"\]/);
  assert.match(css, /:root\[data-platform="mobile"\]/);
  assert.doesNotMatch(css, /overflow-x\s*:\s*(?:auto|scroll)/i);
});

test("journey fixtures support light and dark standard bridge previews", async () => {
  const [html, journeys, flights] = await Promise.all([
    buildHtml(),
    readFile(path.join(PACKAGE_ROOT, "test", "fixtures", "journeys.json"), "utf8").then(JSON.parse),
    readFile(path.join(PACKAGE_ROOT, "test", "fixtures", "flights.json"), "utf8").then(JSON.parse),
  ]);
  for (const [fixture, theme] of [[journeys, "light"], [journeys, "dark"], [flights, "light"], [flights, "dark"]]) {
    const harness = buildFixtureHarness(html, fixture, theme);
    assert.match(harness, new RegExp(`const theme = ${JSON.stringify(theme)}`));
    assert.match(harness, /ui\/notifications\/tool-result/);
  }
});
