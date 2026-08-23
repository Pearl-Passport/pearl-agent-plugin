#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_VERSION = "0.8.4";
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

async function validateMarkdownLinks(file, errors) {
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
      errors.push(`Broken Markdown link: ${path.relative(PLUGIN_ROOT, file)} -> ${destination}`);
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

  const publicFiles = [];
  for (const relative of PUBLIC_PACKAGE_PATHS) publicFiles.push(...await filesUnder(path.join(PLUGIN_ROOT, relative)));
  for (const file of publicFiles) {
    const relative = path.relative(PLUGIN_ROOT, file);
    const mode = (await stat(file)).mode;
    check((mode & 0o111) === 0, `Distribution file must not be executable: ${relative}`, errors);
    if (/\.md$/.test(file)) await validateMarkdownLinks(file, errors);
    if (!/\.(?:json|md|mjs|ya?ml)$/.test(file)) continue;
    const contents = await readFile(file, "utf8");
    const pearlEmails = [...contents.matchAll(/[A-Z0-9._%+-]+@joinpearl\.co/gi)].map((match) => match[0].toLowerCase());
    check(pearlEmails.every((email) => email === PUBLIC_CONTACT_EMAIL), `${relative} contains an unsupported Pearl contact mailbox`, errors);
    check(!/\b(?:pat|prt)_[A-Za-z0-9_-]{12,}\b/.test(contents), `${relative} appears to contain a personal token`, errors);
    check(!/Bearer\s+[A-Za-z0-9._~-]{16,}/i.test(contents), `${relative} appears to contain a bearer token`, errors);
    check(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(contents), `${relative} appears to contain a private key`, errors);
    check(!/@gmail\.com/i.test(contents), `${relative} contains a personal Gmail address`, errors);
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
