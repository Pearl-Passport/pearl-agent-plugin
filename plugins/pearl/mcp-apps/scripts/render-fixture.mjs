#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildHtml } from "./build.mjs";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = new Set(["venues", "journeys", "flights"]);
const THEMES = new Set(["light", "dark"]);

export function buildFixtureHarness(appHtml, fixture, theme, { compare = false } = {}) {
  if (typeof appHtml !== "string" || !fixture || typeof fixture !== "object" || !THEMES.has(theme) || typeof compare !== "boolean") {
    throw new TypeError("A built app, fixture object, and light/dark theme are required");
  }
  const appLiteral = JSON.stringify(appHtml).replace(/<\//g, "<\\/");
  const fixtureLiteral = JSON.stringify(fixture).replace(/<\//g, "<\\/");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Pearl MCP App fixture</title>
  <style>
    html,body{margin:0;min-height:100%;background:${theme === "dark" ? "#0e1013" : "#eeece8"}}
    iframe{display:block;width:100%;min-height:100vh;border:0;background:transparent}
  </style>
</head>
<body>
  <iframe id="preview" title="Pearl MCP App fixture preview"></iframe>
  <script>
    const appHtml = ${appLiteral};
    const fixture = ${fixtureLiteral};
    const theme = ${JSON.stringify(theme)};
    const compare = ${JSON.stringify(compare)};
    const frame = document.getElementById("preview");
    window.addEventListener("message", (event) => {
      if (event.source !== frame.contentWindow || event.data?.jsonrpc !== "2.0") return;
      const message = event.data;
      if (message.method === "ui/initialize") {
        event.source.postMessage({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            protocolVersion: "2026-01-26",
            hostInfo: { name: "Pearl fixture host", version: "1.0.0" },
            hostCapabilities: {},
            hostContext: {
              theme,
              displayMode: "inline",
              platform: "web",
              toolInfo: {
                tool: {
                  name: "fixture_read",
                  inputSchema: { type: "object" },
                  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
                }
              }
            }
          }
        }, "*");
      } else if (message.method === "ui/notifications/initialized") {
        event.source.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { arguments: {} } }, "*");
        event.source.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: fixture }, "*");
        if (compare) {
          window.setTimeout(() => {
            const cards = Array.from(frame.contentDocument?.querySelectorAll("button.result-card") || []).slice(0, 2);
            cards.forEach((card) => card.click());
          }, 50);
        }
      } else if (message.method === "ui/notifications/size-changed") {
        const height = Math.max(320, Math.min(2400, Number(message.params?.height) || 0));
        frame.style.height = height + "px";
      }
    });
    frame.srcdoc = appHtml;
  </script>
</body>
</html>
`;
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const fixtureName = value("--fixture");
  const theme = value("--theme") || "light";
  const output = value("--out");
  const compare = args.includes("--compare");
  if (!FIXTURES.has(fixtureName) || !THEMES.has(theme) || !output) {
    throw new Error("Usage: node scripts/render-fixture.mjs --fixture venues|journeys|flights --theme light|dark [--compare] --out /absolute/file.html");
  }
  const fixture = JSON.parse(await readFile(path.join(PACKAGE_ROOT, "test", "fixtures", `${fixtureName}.json`), "utf8"));
  const harness = buildFixtureHarness(await buildHtml(), fixture, theme, { compare });
  const target = path.resolve(output);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, harness, "utf8");
  console.log(`Built ${fixtureName}/${theme} fixture harness at ${target}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
