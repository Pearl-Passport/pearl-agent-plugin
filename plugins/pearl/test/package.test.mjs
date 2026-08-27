import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_PUBLIC_REPOSITORY_FILES,
  hasExactHttpUrl,
  validatePackage,
  validatePublicCommitEmails,
  validatePublicFileInventory,
  validatePublicText
} from "../scripts/validate.mjs";
import { validateRegistryManifest } from "../scripts/validate-registry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = path.resolve(ROOT, "..", "..");
const EXPORTED_REPOSITORY_LAYOUT = existsSync(path.join(REPOSITORY_ROOT, "server.json"));
const PUBLIC_REPOSITORY_ROOT = EXPORTED_REPOSITORY_LAYOUT ? REPOSITORY_ROOT : path.join(ROOT, "public");
const REGISTRY_MANIFEST = path.join(EXPORTED_REPOSITORY_LAYOUT ? REPOSITORY_ROOT : ROOT, "server.json");

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

test("the canonical portable package validates", async () => {
  assert.deepEqual(await validatePackage(), []);
});

test("public repository validation rejects inventory drift and private metadata", () => {
  assert.deepEqual(validatePublicFileInventory(EXPECTED_PUBLIC_REPOSITORY_FILES), []);
  assert.match(
    validatePublicFileInventory([...EXPECTED_PUBLIC_REPOSITORY_FILES, "UNEXPECTED_INTERNAL_FILE.md"])[0],
    /Unexpected public distribution files/
  );
  const nonPublicEmail = ["reviewer", "example.com"].join("@");
  const localPath = ["", "Users", "reviewer", "secret.txt"].join("/");
  const internalTicket = ["AGENT", "99"].join("-");
  const privateRepository = ["Pearl-Passport", "pearl-app"].join("/");
  assert.match(validatePublicText("README.md", `Contact ${nonPublicEmail}`)[0], /non-public contact email/);
  assert.match(validatePublicText("README.md", `Path ${localPath}`)[0], /local user path/);
  assert.match(validatePublicText("README.md", `Ticket ${internalTicket}`)[0], /internal ticket identifier/);
  assert.match(validatePublicText("README.md", `Repository ${privateRepository}`)[0], /private source repository/);
  const privateNoreply = ["84434824+adxburgess", "users.noreply.github.com"].join("@");
  assert.deepEqual(validatePublicCommitEmails([privateNoreply, "hello@joinpearl.co"]), []);
  assert.match(validatePublicCommitEmails([nonPublicEmail])[0], /non-public commit email/);
});

test("exact URL validation rejects prefixed, suffixed, and look-alike hosts", () => {
  const callback = "https://claude.ai/api/mcp/auth_callback";
  assert.equal(hasExactHttpUrl(`Callback: \`${callback}\`.`, callback), true);
  assert.equal(hasExactHttpUrl(`https://attacker.example/${callback}`, callback), false);
  assert.equal(hasExactHttpUrl(`${callback}.attacker.example`, callback), false);
  assert.equal(hasExactHttpUrl("https://claude.ai.attacker.example/api/mcp/auth_callback", callback), false);
});

test("the three host manifests share one logical MCP endpoint", async () => {
  const codex = await json(".codex-plugin/plugin.json");
  const claude = await json(".claude-plugin/plugin.json");
  const cursor = await json("cursor/.cursor-plugin/plugin.json");
  assert.equal(codex.version, claude.version);
  assert.equal(cursor.version, codex.version);
  assert.equal(codex.mcpServers, "./.mcp.json");
  assert.equal(claude.mcpServers, codex.mcpServers);
  assert.equal(cursor.mcpServers["pearl-cursor"].url, "https://agent.joinpearl.co/mcp");
  assert.equal(claude.repository, "https://github.com/Pearl-Passport/pearl-agent-plugin");
  assert.equal(cursor.repository, claude.repository);
});

test("host marketplaces and submission use their current namespaces and schemas", async () => {
  const codexMarketplace = JSON.parse(await readFile(path.join(REPOSITORY_ROOT, ".agents", "plugins", "marketplace.json"), "utf8"));
  const cursorMarketplace = JSON.parse(await readFile(path.join(REPOSITORY_ROOT, ".cursor-plugin", "marketplace.json"), "utf8"));
  const submission = JSON.parse(await readFile(path.join(REPOSITORY_ROOT, "chatgpt-app-submission.json"), "utf8"));
  assert.equal(codexMarketplace.name, "pearl-integrations");
  assert.equal(cursorMarketplace.name, "pearl-integrations");
  assert.equal(cursorMarketplace.plugins[0].name, "pearl-cursor");
  assert.equal(cursorMarketplace.plugins[0].source, "plugins/pearl/cursor");
  assert.equal(submission.$schema, "https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json");
});

test("Cursor uses collision-resistant plugin and MCP identifiers with a secretless public client", async () => {
  const cursor = await json("cursor/.cursor-plugin/plugin.json");
  const claude = await json(".claude-plugin/plugin.json");
  assert.equal(cursor.name, "pearl-cursor");
  assert.notEqual(cursor.name, claude.name);
  assert.deepEqual(Object.keys(cursor.mcpServers), ["pearl-cursor"]);
  assert.deepEqual(cursor.mcpServers["pearl-cursor"].auth, {
    CLIENT_ID: "pearl-cursor",
    scopes: [
      "venues:read",
      "profile:read",
      "visits:read",
      "saves:read",
      "friends:read",
      "trips:read",
      "reservations:read"
    ]
  });
  assert.equal(JSON.stringify(cursor).includes("CLIENT_SECRET"), false);
});

test("the shared MCP connector contains no static credentials or tool allowlist", async () => {
  const mcp = await json(".mcp.json");
  assert.deepEqual(mcp, {
    mcpServers: {
      pearl: {
        type: "http",
        url: "https://agent.joinpearl.co/mcp"
      }
    }
  });
});

test("the MCP Registry entry is a remote-only projection of the canonical package", async () => {
  const registry = JSON.parse(await readFile(REGISTRY_MANIFEST, "utf8"));
  const pkg = await json("package.json");
  assert.deepEqual(validateRegistryManifest(registry, { expectedVersion: pkg.version }), []);
  assert.equal(registry.$schema, "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json");
  assert.equal(registry.name, "io.github.Pearl-Passport/pearl-agent-plugin");
  assert.deepEqual(registry.repository, {
    url: "https://github.com/Pearl-Passport/pearl-agent-plugin",
    source: "github",
    id: "1343507179",
    subfolder: "plugins/pearl"
  });
  assert.deepEqual(registry.remotes, [{ type: "streamable-http", url: "https://agent.joinpearl.co/mcp" }]);
  assert.equal("packages" in registry, false);
  assert.equal(JSON.stringify(registry).includes("headers"), false);

  const withHeader = structuredClone(registry);
  withHeader.remotes[0].headers = [{ name: "Authorization", value: "Bearer example" }];
  assert.match(validateRegistryManifest(withHeader, { expectedVersion: pkg.version }).join("; "), /only type and url|credentials/);
  const withWrongRepository = structuredClone(registry);
  withWrongRepository.repository.url = "https://github.com/example/lookalike";
  assert.match(validateRegistryManifest(withWrongRepository, { expectedVersion: pkg.version }).join("; "), /repository must be/);
  const withWrongUrl = structuredClone(registry);
  withWrongUrl.remotes[0].url = "https://agent.joinpearl.co/mcp/other";
  assert.match(validateRegistryManifest(withWrongUrl, { expectedVersion: pkg.version }).join("; "), /registry remote must be/i);
});

test("MCP Registry publishing is OIDC-only, checksum-pinned, and release-gated", async () => {
  const workflow = await readFile(path.join(PUBLIC_REPOSITORY_ROOT, ".github", "workflows", "publish-mcp-registry.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /release:\n\s+types: \[published\]/);
  assert.match(workflow, /environment: mcp-registry-publish/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /login github-oidc/);
  assert.match(workflow, /MCP_PUBLISHER_VERSION: v1\.8\.1/);
  assert.match(workflow, /a06c9096dcb9727c13555b6be26c7effa707b01f06a4c561ba7a3635443cf2cc/);
  assert.match(workflow, /test "\$\{RELEASE_TAG\}" = "v\$\{version\}"/);
  assert.match(workflow, /test "\$\{GITHUB_REF\}" = "refs\/tags\/\$\{RELEASE_TAG\}"/);
  assert.match(workflow, /refs\/tags\/\$\{RELEASE_TAG\}\^\{commit\}/);
  assert.match(workflow, /merge-base --is-ancestor/);
  assert.doesNotMatch(workflow, /MCP_GITHUB_TOKEN|github_pat_|gh[pousr]_/);
  assert.doesNotMatch(workflow, /uses:\s+[^#\n]+@v\d+/i);
});

test("exported GitHub workflows are valid YAML", () => {
  const workflows = [
    path.join(PUBLIC_REPOSITORY_ROOT, ".github", "workflows", "publish-cli.yml"),
    path.join(PUBLIC_REPOSITORY_ROOT, ".github", "workflows", "publish-mcp-registry.yml"),
    path.join(PUBLIC_REPOSITORY_ROOT, ".github", "workflows", "validate.yml")
  ];
  const parsed = spawnSync(
    "ruby",
    ["-e", "require 'yaml'; ARGV.each { |file| YAML.parse_file(file) }", ...workflows],
    { encoding: "utf8" }
  );
  assert.equal(parsed.status, 0, parsed.stderr || parsed.error?.message || "Ruby YAML parser failed");
});

test("the public CLI is a read-only runtime projection with secretless trusted publishing", async () => {
  const cliRoot = path.join(REPOSITORY_ROOT, "cli", "pearl");
  const manifest = JSON.parse(await readFile(path.join(cliRoot, "package.json"), "utf8"));
  const source = await readFile(path.join(cliRoot, "src", "index.mjs"), "utf8");
  const oauth = await readFile(path.join(cliRoot, "src", "oauth.mjs"), "utf8");
  const keychain = await readFile(path.join(cliRoot, "src", "keychain.mjs"), "utf8");
  const workflow = await readFile(path.join(PUBLIC_REPOSITORY_ROOT, ".github", "workflows", "publish-cli.yml"), "utf8");
  assert.equal(manifest.name, "@joinpearl/cli");
  assert.equal(manifest.version, "1.0.0");
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.publishConfig.provenance, true);
  assert.match(source, /readOnlyHint !== true/);
  assert.match(source, /api\/v1\/capabilities/);
  assert.doesNotMatch([source, oauth, keychain].join("\n"), /\b[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*_(?:prepare|commit)\b/);
  assert.doesNotMatch(oauth, /\b[a-z-]+:write\b/);
  assert.match(keychain, /'-U', '-w'/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /environment: pearl-cli-publish/);
  assert.match(workflow, /test "\$\{GITHUB_REF\}" = "refs\/tags\/\$\{\{ github\.event\.release\.tag_name \}\}"/);
  assert.match(workflow, /refs\/tags\/\$\{\{ github\.event\.release\.tag_name \}\}\^\{commit\}/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN|npm_[A-Za-z0-9]{20,}/);
});

test("the dated skill snapshot covers the exact 13 public reads", async () => {
  const submission = JSON.parse(await readFile(path.join(REPOSITORY_ROOT, "chatgpt-app-submission.json"), "utf8"));
  const snapshot = await readFile(path.join(ROOT, "skills", "pearl-concierge", "references", "capabilities.md"), "utf8");
  const publicTools = Object.keys(submission.tools);
  assert.equal(publicTools.length, 13);
  assert.deepEqual(
    ["venues_new_openings", "places_match", "friends_search", "friends_list"].filter((name) => publicTools.includes(name)),
    ["venues_new_openings", "places_match", "friends_search", "friends_list"]
  );
  assert.equal(publicTools.includes("reservation_get"), true);
  for (const name of publicTools) assert.equal(snapshot.includes(`\`${name}\``), true);
  assert.equal(publicTools.some((name) => name.endsWith("_prepare") || name.endsWith("_commit")), false);
  assert.doesNotMatch(snapshot, /\b[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*_(?:prepare|commit)\b/);
  assert.doesNotMatch(snapshot, /\b[a-z-]+:write\b/);
});

test("hosted Claude documents the fixed public client and exact read-only scopes", async () => {
  const claude = await json(".claude-plugin/plugin.json");
  const setup = await readFile(path.join(ROOT, "docs", "setup.md"), "utf8");
  const oauth = await readFile(path.join(ROOT, "docs", "oauth.md"), "utf8");
  const liveValidator = await readFile(path.join(ROOT, "scripts", "validate-live.mjs"), "utf8");
  assert.match(claude.description, /Eligible Pearl Access members/);
  for (const document of [setup, oauth]) {
    assert.match(document, /pearl-claude-hosted/);
    assert.match(document, /OAuth Client Secret[^\n]*(?:Leave|leave)[^\n]*empty/);
  }
  assert.match(oauth, /https:\/\/claude\.ai\/api\/mcp\/auth_callback/);
  for (const scope of ["venues:read", "profile:read", "visits:read", "saves:read", "friends:read", "trips:read", "reservations:read"]) {
    assert.equal(oauth.includes(`\`${scope}\``), true);
  }
  assert.doesNotMatch(oauth, /\b[a-z-]+:write\b/);
  assert.match(liveValidator, /register\.status === 404/);
});

test("Claude Code uses trusted CIMD without a static client override", async () => {
  const setup = await readFile(path.join(ROOT, "docs", "setup.md"), "utf8");
  const oauth = await readFile(path.join(ROOT, "docs", "oauth.md"), "utf8");
  const releasing = await readFile(path.join(ROOT, "docs", "releasing.md"), "utf8");
  for (const document of [setup, oauth]) {
    assert.match(document, /Claude Code/);
    assert.match(document, /Anthropic-hosted CIMD/);
    assert.match(document, /localhost/);
    assert.match(document, /127\.0\.0\.1/);
    assert.match(document, /ephemeral (?:loopback )?port/);
  }
  assert.match(setup, /claude mcp login plugin:pearl:pearl/);
  assert.match(setup, /claude mcp get plugin:pearl:pearl/);
  assert.doesNotMatch(setup, /YOUR_PUBLIC_CLIENT_ID|--callback-port|--client-secret/);
  assert.match(oauth, /http:\/\/localhost:8080\/callback/);
  assert.match(oauth, /--callback-port 8080/);
  assert.match(oauth, /Pearl has not published this fallback client/);
  assert.match(oauth, /Do not reuse `pearl-claude-hosted`/);
  assert.match(releasing, /Claude Code CIMD/);
  assert.doesNotMatch(releasing, /Claude Code static public-client/i);
});

test("submission challenge validation requires an untracked expected token", async () => {
  const pkg = await json("package.json");
  const liveValidator = await readFile(path.join(ROOT, "scripts", "validate-live.mjs"), "utf8");
  assert.equal(pkg.scripts["validate:submission-live"], "node scripts/validate-live.mjs --require-openai-challenge");
  assert.match(liveValidator, /PEARL_EXPECTED_OPENAI_APPS_CHALLENGE_TOKEN/);
  try {
    const runbook = await readFile(path.join(ROOT, "submission", "README.md"), "utf8");
    assert.match(runbook, /PEARL_EXPECTED_OPENAI_APPS_CHALLENGE_TOKEN/);
    assert.doesNotMatch(runbook, /PEARL_EXPECTED_OPENAI_APPS_CHALLENGE_TOKEN=[A-Za-z0-9_-]{12,}/);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
});

test("release validation safely probes both static host registrations", async () => {
  const pkg = await json("package.json");
  const liveValidator = await readFile(path.join(ROOT, "scripts", "validate-live.mjs"), "utf8");
  const releasing = await readFile(path.join(ROOT, "docs", "releasing.md"), "utf8");
  assert.equal(pkg.scripts["validate:host-clients-live"], "node scripts/validate-live.mjs --require-static-host-clients");
  assert.match(liveValidator, /pearl-claude-hosted/);
  assert.match(liveValidator, /pearl-cursor/);
  assert.match(liveValidator, /https:\/\/invalid\.example\/mcp/);
  assert.match(liveValidator, /invalid_target/);
  assert.match(liveValidator, /invalid_scope/);
  assert.match(releasing, /validate:host-clients-live/);
});
