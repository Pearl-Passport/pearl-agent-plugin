#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_VERSION = "0.8.5";
const EXPECTED_MCP_URL = "https://agent.joinpearl.co/mcp";
const PUBLIC_CONTACT_EMAIL = "hello@joinpearl.co";
const CLAUDE_HOSTED_CLIENT_ID = "pearl-claude-hosted";
const CLAUDE_HOSTED_CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const CURSOR_CLIENT_ID = "pearl-cursor";
const CURSOR_HOSTED_CALLBACK = "https://www.cursor.com/agents/mcp/oauth/callback";
const CURSOR_LOOPBACK_CALLBACK = "http://localhost:8787/callback";
const PUBLIC_READ_SCOPES = [
  "venues:read",
  "profile:read",
  "visits:read",
  "saves:read",
  "friends:read",
  "trips:read",
  "reservations:read"
];
const PUBLIC_READ_TOOLS = [
  "venues_search",
  "venues_recommend",
  "venues_new_openings",
  "places_match",
  "profile_get",
  "visits_list",
  "saves_list",
  "friends_search",
  "friends_list",
  "trips_list",
  "trip_get",
  "reservations_list",
  "reservation_get"
];
const EXPECTED_ASSETS = new Map([
  ["assets/icon.png", "77069494537eb1148d68a2c312f66579db895d4d3dacaaa1cdc89706606e0a07"],
  ["assets/logo.png", "d44a653a7e18653c737a966335c28fc58314fb5e4514179a3733a5264e4f565f"],
  ["cursor/assets/logo.png", "d44a653a7e18653c737a966335c28fc58314fb5e4514179a3733a5264e4f565f"]
]);
const FORBIDDEN_PNG_CHUNKS = new Set(["eXIf", "iTXt", "tEXt", "zTXt", "tIME"]);
export const EXPECTED_PUBLIC_REPOSITORY_FILES = [
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
  ".cursor-plugin/marketplace.json",
  ".github/workflows/validate.yml",
  ".gitignore",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "SOURCE.md",
  "TRADEMARKS.md",
  "chatgpt-app-submission.json",
  "plugins/pearl/.claude-plugin/plugin.json",
  "plugins/pearl/.codex-plugin/plugin.json",
  "plugins/pearl/.mcp.json",
  "plugins/pearl/README.md",
  "plugins/pearl/assets/README.md",
  "plugins/pearl/assets/icon.png",
  "plugins/pearl/assets/logo.png",
  "plugins/pearl/cursor/.cursor-plugin/plugin.json",
  "plugins/pearl/cursor/assets/logo.png",
  "plugins/pearl/cursor/skills/pearl-concierge/SKILL.md",
  "plugins/pearl/cursor/skills/pearl-concierge/agents/openai.yaml",
  "plugins/pearl/cursor/skills/pearl-concierge/references/capabilities.md",
  "plugins/pearl/docs/oauth.md",
  "plugins/pearl/docs/releasing.md",
  "plugins/pearl/docs/setup.md",
  "plugins/pearl/docs/submission.md",
  "plugins/pearl/package.json",
  "plugins/pearl/scripts/validate-live.mjs",
  "plugins/pearl/scripts/validate.mjs",
  "plugins/pearl/skills/pearl-concierge/SKILL.md",
  "plugins/pearl/skills/pearl-concierge/agents/openai.yaml",
  "plugins/pearl/skills/pearl-concierge/references/capabilities.md",
  "plugins/pearl/test/package.test.mjs"
].sort();
const PUBLIC_PACKAGE_PATHS = [
  ".codex-plugin",
  ".claude-plugin",
  ".mcp.json",
  "README.md",
  "docs",
  "package.json",
  "scripts/validate-live.mjs",
  "scripts/validate.mjs",
  "assets",
  "cursor",
  "skills",
  "test/package.test.mjs"
];
const SECRET_PATTERNS = [
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["Google API key", /\bAIza[A-Za-z0-9_-]{35}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["Stripe key", /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}\b/],
  ["Supabase key", /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{16,}\b/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ["Bearer token", /Bearer\s+[A-Za-z0-9._~-]{16,}/i],
  ["personal token", /\b(?:pat|prt)_[A-Za-z0-9_-]{12,}\b/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["assigned secret", /\b(?:client_?secret|access_?token|refresh_?token|api_?key|password)\b\s*[:=]\s*["'][^"'${}\s][^"']{7,}["']/i]
];
const PRIVATE_METADATA_PATTERNS = [
  ["local user path", /\/(?:Users|home)\/[A-Za-z0-9._-]+(?:\/|\\)/],
  ["Windows user path", /[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\/],
  ["local temporary path", /\/(?:private\/tmp|var\/folders)\//],
  ["Codex worktree path", /\.codex\/worktrees\//],
  ["Codex system-skill path", /~\/\.codex\/skills\/\.system\//],
  ["internal ticket identifier", /\bAGENT-\d+\b/],
  ["private Notion task link", /app\.notion\.(?:com|so)\/p\/[a-f0-9]{24,}/i],
  ["private source repository", new RegExp(["Pearl-Passport", "pearl-app"].join("/"), "i")],
  ["backend source path", new RegExp(["supabase", "functions"].join("/"), "i")],
  ["private storage vendor detail", new RegExp(`\\b${["Bun", "ny"].join("")}\\b`, "i")],
  ["legacy brand metadata", new RegExp(["En", "Primeur", "Club"].join(" "), "i")],
  ["design-tool identifier", new RegExp(`\\b(?:${[
    ["DAG7", "shwG0Ec"].join(""),
    ["UAG1", "uE8lP_o"].join(""),
    ["BAG1", "uOepooI"].join("")
  ].join("|")})\\b`)],
  ["unreleased tool contract", /\b[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*_(?:prepare|commit)\b/],
  ["unreleased photo contract", /\bvisits?_photos?\b/i],
  ["unreleased OAuth scope", new RegExp(`\\b(?:${["collections", "read"].join(":")}|[a-z-]+:write)\\b`)],
  ["private commit provenance", new RegExp(["private", "source", "commit"].join(" "), "i")]
];

async function findRepositoryRoot(start) {
  let current = start;
  while (true) {
    try {
      await stat(path.join(current, ".agents", "plugins", "marketplace.json"));
      await stat(path.join(current, ".claude-plugin", "marketplace.json"));
      await stat(path.join(current, ".cursor-plugin", "marketplace.json"));
      await stat(path.join(current, "plugins", "pearl"));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`Could not locate repository root above ${start}`);
      current = parent;
    }
  }
}

const REPOSITORY_ROOT = await findRepositoryRoot(PLUGIN_ROOT);

function check(condition, message, errors) {
  if (!condition) errors.push(message);
}

async function readJsonFrom(root, relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

async function readPublicWorkflow() {
  const candidates = [
    path.join(PLUGIN_ROOT, "public/.github/workflows/validate.yml"),
    path.join(REPOSITORY_ROOT, ".github/workflows/validate.yml")
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw new Error("Could not locate the public validation workflow");
}

async function filesUnder(target) {
  const metadata = await lstat(target);
  if (metadata.isSymbolicLink()) throw new Error(`Distribution path must not be a symlink: ${target}`);
  if (!metadata.isDirectory()) return [target];
  const nested = [];
  for (const entry of (await readdir(target)).sort()) nested.push(...await filesUnder(path.join(target, entry)));
  return nested;
}

async function repositoryFilesUnder(root) {
  const nested = [];
  for (const entry of (await readdir(root)).sort()) {
    if (entry === ".git") continue;
    nested.push(...await filesUnder(path.join(root, entry)));
  }
  return nested;
}

function portableRelative(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

export function validatePublicFileInventory(relativeFiles) {
  const actual = [...new Set(relativeFiles.map((relative) => relative.split(path.sep).join("/")))].sort();
  const missing = EXPECTED_PUBLIC_REPOSITORY_FILES.filter((relative) => !actual.includes(relative));
  const unexpected = actual.filter((relative) => !EXPECTED_PUBLIC_REPOSITORY_FILES.includes(relative));
  const errors = [];
  if (missing.length) errors.push(`Missing public distribution files: ${missing.join(", ")}`);
  if (unexpected.length) errors.push(`Unexpected public distribution files: ${unexpected.join(", ")}`);
  return errors;
}

export function isPublicTextFile(relative) {
  return /\.(?:json|md|mjs|ya?ml|txt)$/.test(relative) || [".gitignore", "LICENSE"].includes(path.basename(relative));
}

export function validatePublicText(relative, contents) {
  const errors = [];
  const emails = [...contents.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0].toLowerCase());
  check(emails.every((email) => email === PUBLIC_CONTACT_EMAIL), `${relative} contains a non-public contact email`, errors);
  for (const [kind, pattern] of SECRET_PATTERNS) check(!pattern.test(contents), `${relative} appears to contain a ${kind}`, errors);
  for (const [kind, pattern] of PRIVATE_METADATA_PATTERNS) check(!pattern.test(contents), `${relative} contains a ${kind}`, errors);
  return errors;
}

export function validatePublicCommitEmails(emails) {
  const githubNoreply = ["noreply", "github.com"].join("@");
  return [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))]
    .filter((email) => email !== PUBLIC_CONTACT_EMAIL && email !== githubNoreply && !/@users\.noreply\.github\.com$/.test(email))
    .map((email) => `Public Git history contains a non-public commit email: ${email}`);
}

function secretishJsonKey(value) {
  if (Array.isArray(value)) return value.some(secretishJsonKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    /^(client_?secret|access_?token|refresh_?token|authorization|private_?key)$/i.test(key) || secretishJsonKey(child));
}

function pngInfo(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error("Invalid PNG signature");
  let offset = 8;
  let width;
  let height;
  let sawEnd = false;
  const chunkTypes = [];
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) throw new Error("Truncated PNG chunk");
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) throw new Error("Invalid PNG chunk length");
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    chunkTypes.push(type);
    if (type === "IHDR") {
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
    }
    offset = end;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd || offset !== buffer.length) throw new Error("Invalid PNG structure");
  return { width, height, chunkTypes };
}

async function validateMarkdownLinks(file, relativeRoot, errors) {
  const contents = await readFile(file, "utf8");
  for (const match of contents.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    let destination = match[1].trim();
    if (destination.startsWith("<") && destination.endsWith(">")) destination = destination.slice(1, -1);
    destination = destination.split(/\s+["']/)[0];
    if (/^(?:[a-z]+:|#)/i.test(destination)) continue;
    const decoded = decodeURIComponent(destination.split("#")[0].split("?")[0]);
    if (!decoded) continue;
    const resolved = path.resolve(path.dirname(file), decoded);
    try {
      await stat(resolved);
    } catch {
      errors.push(`Broken Markdown link: ${portableRelative(relativeRoot, file)} -> ${destination}`);
    }
  }
}

export async function validatePackage() {
  const errors = [];
  const codex = await readJsonFrom(PLUGIN_ROOT, ".codex-plugin/plugin.json");
  const claude = await readJsonFrom(PLUGIN_ROOT, ".claude-plugin/plugin.json");
  const cursor = await readJsonFrom(PLUGIN_ROOT, "cursor/.cursor-plugin/plugin.json");
  const mcp = await readJsonFrom(PLUGIN_ROOT, ".mcp.json");
  const pkg = await readJsonFrom(PLUGIN_ROOT, "package.json");
  const codexMarket = await readJsonFrom(REPOSITORY_ROOT, ".agents/plugins/marketplace.json");
  const claudeMarket = await readJsonFrom(REPOSITORY_ROOT, ".claude-plugin/marketplace.json");
  const cursorMarket = await readJsonFrom(REPOSITORY_ROOT, ".cursor-plugin/marketplace.json");
  const submission = await readJsonFrom(REPOSITORY_ROOT, "chatgpt-app-submission.json");

  const versions = [codex.version, claude.version, cursor.version, claudeMarket.plugins?.[0]?.version, cursorMarket.plugins?.[0]?.version, pkg.version];
  check(versions.every((version) => version === EXPECTED_VERSION), `All public versions must be ${EXPECTED_VERSION}: ${versions.join(", ")}`, errors);
  check(pkg.engines?.node === ">=22", "Validation must require a supported Node.js release", errors);
  check(codex.name === "pearl" && claude.name === "pearl", "Codex and Claude plugin manifests must be named pearl", errors);
  check(cursor.name === "pearl-cursor", "Cursor must use the collision-resistant pearl-cursor plugin identifier", errors);
  check([codex, claude, cursor].every((manifest) => manifest.author?.email === PUBLIC_CONTACT_EMAIL), `All host manifests must use ${PUBLIC_CONTACT_EMAIL}`, errors);
  check(codex.mcpServers === "./.mcp.json" && claude.mcpServers === "./.mcp.json", "Codex and Claude must share ./.mcp.json", errors);
  check(!Object.hasOwn(codex, "skills") && claude.skills === "./skills/" && cursor.skills === "./skills/", "Codex must use root skill discovery while Claude and Cursor reference their packaged skill trees", errors);
  check([codex.license, claude.license, cursor.license].every((license) => license === "MIT"), "All host manifests must use the reviewed software license", errors);

  check(Object.keys(mcp.mcpServers ?? {}).join(",") === "pearl", "The shared MCP config must define exactly one server", errors);
  check(mcp.mcpServers?.pearl?.type === "http" && mcp.mcpServers?.pearl?.url === EXPECTED_MCP_URL, "The shared MCP config must use Pearl's production HTTP endpoint", errors);
  check(Object.keys(mcp.mcpServers?.pearl ?? {}).sort().join(",") === "type,url", "The shared MCP config must contain only type and url", errors);
  check(Object.keys(cursor.mcpServers ?? {}).join(",") === "pearl-cursor", "Cursor must define exactly one collision-resistant MCP server", errors);
  const cursorServer = cursor.mcpServers?.["pearl-cursor"];
  check(cursorServer?.url === EXPECTED_MCP_URL, "Cursor must use the same production MCP endpoint", errors);
  check(cursorServer?.auth?.CLIENT_ID === CURSOR_CLIENT_ID, `Cursor must use public client ${CURSOR_CLIENT_ID}`, errors);
  check(JSON.stringify(cursorServer?.auth?.scopes) === JSON.stringify(PUBLIC_READ_SCOPES), "Cursor must request exactly the seven public read scopes", errors);
  check(!Object.hasOwn(cursorServer?.auth ?? {}, "CLIENT_SECRET"), "Cursor must not contain CLIENT_SECRET", errors);
  check(![mcp, codex, claude, cursor].some(secretishJsonKey), "Tracked host manifests must not contain credential fields", errors);

  const codexEntry = codexMarket.plugins?.find((entry) => entry.name === "pearl");
  const claudeEntry = claudeMarket.plugins?.find((entry) => entry.name === "pearl");
  const cursorEntry = cursorMarket.plugins?.find((entry) => entry.name === "pearl-cursor");
  check(codexMarket.name === "pearl-integrations" && codexEntry?.source?.path === "./plugins/pearl", "Codex marketplace must target the canonical package", errors);
  check(claudeEntry?.source === "./plugins/pearl", "Claude marketplace must target the canonical package", errors);
  check(cursorMarket.name === "pearl-integrations" && cursorEntry?.source === "plugins/pearl/cursor", "Cursor marketplace must target its isolated source subtree with the host-specific identifier", errors);
  check(cursorEntry?.name === cursor.name, "Cursor marketplace and plugin identifiers must match", errors);
  check(cursorMarket.owner?.email === PUBLIC_CONTACT_EMAIL && cursorEntry?.author?.email === PUBLIC_CONTACT_EMAIL, `Cursor marketplace contacts must use ${PUBLIC_CONTACT_EMAIL}`, errors);
  check([claudeEntry, codex, claude].every((entry) => !/(?:guarded|gated|write|cleanup|photo)/i.test(entry?.description ?? "")), "Public host descriptions must advertise only current read workflows", errors);
  check(claude.description.includes("Active Pearl Elite members"), "Claude plugin metadata must disclose Pearl Elite eligibility", errors);

  const skill = await readFile(path.join(PLUGIN_ROOT, "skills/pearl-concierge/SKILL.md"), "utf8");
  const capabilitySnapshot = await readFile(path.join(PLUGIN_ROOT, "skills/pearl-concierge/references/capabilities.md"), "utf8");
  const openaiYaml = await readFile(path.join(PLUGIN_ROOT, "skills/pearl-concierge/agents/openai.yaml"), "utf8");
  const canonicalSkillFiles = await filesUnder(path.join(PLUGIN_ROOT, "skills/pearl-concierge"));
  const cursorSkillFiles = await filesUnder(path.join(PLUGIN_ROOT, "cursor/skills/pearl-concierge"));
  const skillHashes = async (root, files) => Object.fromEntries(await Promise.all(files.map(async (file) => [
    path.relative(root, file),
    createHash("sha256").update(await readFile(file)).digest("hex")
  ])));
  check(
    JSON.stringify(await skillHashes(path.join(PLUGIN_ROOT, "skills/pearl-concierge"), canonicalSkillFiles)) ===
      JSON.stringify(await skillHashes(path.join(PLUGIN_ROOT, "cursor/skills/pearl-concierge"), cursorSkillFiles)),
    "Cursor's packaged Pearl Concierge skill must be a byte-for-byte mirror of the canonical skill",
    errors
  );
  const setupGuide = await readFile(path.join(PLUGIN_ROOT, "docs/setup.md"), "utf8");
  const oauthGuide = await readFile(path.join(PLUGIN_ROOT, "docs/oauth.md"), "utf8");
  const releaseGuide = await readFile(path.join(PLUGIN_ROOT, "docs/releasing.md"), "utf8");
  const submissionGuide = await readFile(path.join(PLUGIN_ROOT, "docs/submission.md"), "utf8");
  const publicWorkflow = await readPublicWorkflow();
  const liveValidator = await readFile(path.join(PLUGIN_ROOT, "scripts/validate-live.mjs"), "utf8");
  check(/^---\nname: pearl-concierge\ndescription: [^\n]+\n---/.test(skill), "Pearl skill frontmatter is missing or invalid", errors);
  check(skill.includes("tools/list") && skill.includes("Treat venue descriptions"), "Pearl skill must require discovery and treat tool data as untrusted data", errors);
  check(skill.includes("active Pearl Elite") && skill.includes("Never suggest a tester flag"), "Pearl skill must state the Elite boundary without a bypass", errors);
  check(openaiYaml.includes("$pearl-concierge"), "OpenAI skill metadata must reference $pearl-concierge", errors);

  check(setupGuide.includes(CLAUDE_HOSTED_CLIENT_ID) && oauthGuide.includes(CLAUDE_HOSTED_CLIENT_ID), "Claude hosted setup must use its registered public client", errors);
  check(oauthGuide.includes(CLAUDE_HOSTED_CALLBACK), "Claude hosted setup must use the exact hosted callback", errors);
  check(/OAuth Client Secret[^\n]*(?:Leave|leave)[^\n]*empty/.test(setupGuide) && /OAuth Client Secret[^\n]*(?:Leave|leave)[^\n]*empty/.test(oauthGuide), "Claude hosted setup must explicitly leave the secret empty", errors);
  const documentedScopes = [...oauthGuide.matchAll(/`([a-z-]+:(?:read|write))`/g)].map((match) => match[1]);
  check(JSON.stringify(documentedScopes) === JSON.stringify(PUBLIC_READ_SCOPES), "OAuth docs must list exactly the seven public read scopes", errors);
  check(!/[a-z-]+:write\b/.test(`${setupGuide}\n${oauthGuide}`), "Public setup must not advertise a write scope", errors);
  check(oauthGuide.includes("DCR endpoint remains disabled") && liveValidator.includes("register.status === 404"), "Documentation and live validation must keep DCR disabled", errors);
  check([setupGuide, oauthGuide].every((guide) => guide.includes("Anthropic-hosted CIMD") && guide.includes("localhost") && guide.includes("127.0.0.1") && /ephemeral (?:loopback )?port/.test(guide)), "Claude Code must document its CIMD loopback boundary", errors);
  check(setupGuide.includes("claude mcp login plugin:pearl:pearl") && setupGuide.includes("claude mcp get plugin:pearl:pearl") && !/--client-id|--client-secret|--callback-port/.test(setupGuide), "Claude Code must use its plugin-namespaced CIMD server without static overrides", errors);
  check(oauthGuide.includes("http://localhost:8080/callback") && oauthGuide.includes("--callback-port 8080") && oauthGuide.includes("Pearl has not published this fallback client"), "Claude Code static fallback must use a fixed registered loopback port and remain clearly unavailable", errors);
  check(oauthGuide.includes("Do not reuse `pearl-claude-hosted`") && oauthGuide.includes("do not pass `--client-secret`"), "Claude Code static fallback must not reuse the hosted client or require a secret", errors);
  check(releaseGuide.includes("Claude Code CIMD"), "Release checks must cover Claude Code CIMD", errors);
  check([setupGuide, oauthGuide].every((guide) => guide.includes(CURSOR_CLIENT_ID) && guide.includes(CURSOR_HOSTED_CALLBACK) && guide.includes(CURSOR_LOOPBACK_CALLBACK)), "Cursor docs must include its public client and both callbacks", errors);
  check(submissionGuide.includes("https://cursor.com/marketplace/publish") && submissionGuide.includes("https://platform.claude.com/plugins/submit"), "Submission docs must link to the current host forms", errors);
  check(submissionGuide.includes("Claude Connectors Directory") && submissionGuide.includes("separate review"), "Submission docs must distinguish Claude plugin and connector review", errors);
  check(submissionGuide.includes("public GitHub repository") && submissionGuide.includes("does not make Pearl an official or approved integration"), "Submission docs must require public source without claiming approval", errors);
  check(/node-version:\s*24\b/.test(publicWorkflow), "Public CI must run on the current Node.js LTS", errors);
  check(/permissions:\s*\n\s*contents:\s*read/.test(publicWorkflow) && publicWorkflow.includes("persist-credentials: false"), "Public CI must use read-only permissions without persisting credentials", errors);
  check(!/uses:\s+[^#\n]+@v\d+/i.test(publicWorkflow), "Public CI actions must be pinned by commit SHA", errors);
  check(publicWorkflow.includes("fetch-depth: 0"), "Public CI must fetch complete history for credential scanning", errors);
  check(publicWorkflow.includes("gitleaks_8.30.1_linux_x64.tar.gz") && publicWorkflow.includes("551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"), "Public CI must use the reviewed Gitleaks binary and checksum", errors);

  const publicToolNames = Object.keys(submission.tools ?? {});
  check(submission.$schema === "https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json", "OpenAI submission schema is incorrect", errors);
  check(JSON.stringify(publicToolNames) === JSON.stringify(PUBLIC_READ_TOOLS), `Public submission must contain the exact 13 read tools: ${publicToolNames.join(", ")}`, errors);
  check(publicToolNames.every((name) => capabilitySnapshot.includes(`\`${name}\``)), "The capability snapshot must describe every public read", errors);
  check(Object.values(submission.tools ?? {}).every((tool) => tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint === false), "Every submitted tool must be annotated read-only and non-destructive", errors);
  check(!/\b[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*_(?:prepare|commit)\b/.test(`${skill}\n${capabilitySnapshot}\n${setupGuide}\n${oauthGuide}`), "Public docs must not expose unreleased tool contracts", errors);
  check(!/\b[a-z-]+:write\b/.test(`${skill}\n${capabilitySnapshot}\n${setupGuide}\n${oauthGuide}`), "Public docs must not expose write scopes", errors);

  for (const [relative, expectedHash] of EXPECTED_ASSETS) {
    const contents = await readFile(path.join(PLUGIN_ROOT, relative));
    const info = pngInfo(contents);
    const expectedSize = relative.endsWith("icon.png") ? 256 : 500;
    check(info.width === expectedSize && info.height === expectedSize, `${relative} must be ${expectedSize}x${expectedSize}`, errors);
    check(!info.chunkTypes.some((type) => FORBIDDEN_PNG_CHUNKS.has(type)), `${relative} must not contain metadata chunks`, errors);
    check(createHash("sha256").update(contents).digest("hex") === expectedHash, `${relative} does not match the reviewed Pearl artwork`, errors);
  }

  let publicFiles = [];
  let publicRelativeRoot = PLUGIN_ROOT;
  try {
    await stat(path.join(REPOSITORY_ROOT, "SOURCE.md"));
    publicFiles = await repositoryFilesUnder(REPOSITORY_ROOT);
    publicRelativeRoot = REPOSITORY_ROOT;
    errors.push(...validatePublicFileInventory(publicFiles.map((file) => portableRelative(REPOSITORY_ROOT, file))));
    try {
      const gitEmails = execFileSync("git", ["log", "--format=%ae%n%ce", "--all"], {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }).split("\n");
      errors.push(...validatePublicCommitEmails(gitEmails));
    } catch {
      // A generated export may not be a Git checkout; CI and release clones are.
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    for (const relative of PUBLIC_PACKAGE_PATHS) publicFiles.push(...await filesUnder(path.join(PLUGIN_ROOT, relative)));
  }
  for (const file of publicFiles) {
    const relative = portableRelative(publicRelativeRoot, file);
    const mode = (await stat(file)).mode;
    check((mode & 0o111) === 0, `Distribution file must not be executable: ${relative}`, errors);
    if (/\.md$/.test(file)) await validateMarkdownLinks(file, publicRelativeRoot, errors);
    if (!isPublicTextFile(relative)) continue;
    const contents = await readFile(file, "utf8");
    errors.push(...validatePublicText(relative, contents));
  }

  check(path.relative(REPOSITORY_ROOT, PLUGIN_ROOT) === path.join("plugins", "pearl"), "plugins/pearl must remain the canonical package root", errors);
  const bundleRoots = ["src", "ios", "android"];
  const configFiles = ["vite.config.ts", "capacitor.config.ts", "vercel.json"];
  const bundleCandidates = [];
  for (const root of bundleRoots) {
    try {
      bundleCandidates.push(...await filesUnder(path.join(REPOSITORY_ROOT, root)));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  for (const name of configFiles) {
    try {
      const target = path.join(REPOSITORY_ROOT, name);
      if ((await stat(target)).isFile()) bundleCandidates.push(target);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  for (const file of bundleCandidates.filter((candidate) => /\.(?:[cm]?[jt]sx?|json|swift|kt|gradle|xml)$/.test(candidate))) {
    check(!/plugins[\\/]pearl/.test(await readFile(file, "utf8")), `Application bundle imports distribution artifacts: ${path.relative(REPOSITORY_ROOT, file)}`, errors);
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = await validatePackage();
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Pearl Codex/Claude/Cursor package validation passed.");
  }
}
