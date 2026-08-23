import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_PUBLIC_REPOSITORY_FILES,
  validatePackage,
  validatePublicCommitEmails,
  validatePublicFileInventory,
  validatePublicText
} from "../scripts/validate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = path.resolve(ROOT, "..", "..");

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
  assert.match(claude.description, /Active Pearl Elite members/);
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
