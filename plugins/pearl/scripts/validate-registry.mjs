#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = path.resolve(PLUGIN_ROOT, "..", "..");
const SCHEMA_URL = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
const MCP_URL = "https://agent.joinpearl.co/mcp";
const MCP_ORIGIN = "https://agent.joinpearl.co";
const RESOURCE_METADATA_URL = `${MCP_ORIGIN}/.well-known/oauth-protected-resource/mcp`;
const REGISTRY_NAME = "io.github.Pearl-Passport/pearl-agent-plugin";
const PUBLIC_REPOSITORY = "https://github.com/Pearl-Passport/pearl-agent-plugin";
const PUBLIC_REPOSITORY_ID = "1343507179";
const PUBLISHER_VERSION = "v1.8.1";
const PUBLISHER_CHECKSUMS = new Map([
  ["darwin-amd64", "88126981225e7714fcc6b7a10cdba4a80ae5901e9740a8c06d0d5195c8bc294c"],
  ["darwin-arm64", "e45e520892460732a4bdf37255576415d4a53ec171f8b913faf15bb1aef7cb77"],
  ["linux-amd64", "a06c9096dcb9727c13555b6be26c7effa707b01f06a4c561ba7a3635443cf2cc"],
  ["linux-arm64", "8dd75a6cf6845688b5d4e46df58d3ca26d5c8d233bb0626606e1db82c5e883e4"]
]);

function check(condition, message, errors) {
  if (!condition) errors.push(message);
}

function keys(value) {
  return Object.keys(value ?? {}).sort().join(",");
}

function containsSensitiveKey(value) {
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    /^(?:headers?|authorization|client_?secret|access_?token|refresh_?token|api_?key|password|private_?key)$/i.test(key) ||
      containsSensitiveKey(child));
}

export function validateRegistryManifest(server, { expectedVersion } = {}) {
  const errors = [];
  check(server && typeof server === "object" && !Array.isArray(server), "server.json must contain one object", errors);
  check(
    keys(server) === "$schema,description,name,remotes,repository,title,version,websiteUrl",
    "server.json must contain only the reviewed registry fields",
    errors
  );
  check(server?.$schema === SCHEMA_URL, `server.json must use the ${SCHEMA_URL} schema`, errors);
  check(server?.name === REGISTRY_NAME, `server.json name must be ${REGISTRY_NAME}`, errors);
  check(server?.title === "Pearl", "server.json title must be Pearl", errors);
  check(typeof server?.description === "string" && server.description.length > 0 && server.description.length <= 100,
    "server.json description must be between 1 and 100 characters", errors);
  check(/read-only/i.test(server?.description ?? ""), "server.json must disclose the read-only release boundary", errors);
  check(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(server?.version ?? ""), "server.json version must be semantic", errors);
  if (expectedVersion) check(server?.version === expectedVersion, `server.json version must match ${expectedVersion}`, errors);
  check(server?.websiteUrl === "https://joinpearl.co", "server.json must use Pearl's public website", errors);
  check(keys(server?.repository) === "id,source,subfolder,url", "server.json repository metadata must use only reviewed fields", errors);
  check(server?.repository?.url === PUBLIC_REPOSITORY, `server.json repository must be ${PUBLIC_REPOSITORY}`, errors);
  check(server?.repository?.source === "github", "server.json repository source must be github", errors);
  check(server?.repository?.id === PUBLIC_REPOSITORY_ID, "server.json must pin the public GitHub repository ID", errors);
  check(server?.repository?.subfolder === "plugins/pearl", "server.json repository subfolder must be plugins/pearl", errors);
  check(Array.isArray(server?.remotes) && server.remotes.length === 1, "server.json must define exactly one remote", errors);
  check(keys(server?.remotes?.[0]) === "type,url", "The registry remote must contain only type and url", errors);
  check(server?.remotes?.[0]?.type === "streamable-http", "The registry remote must use Streamable HTTP", errors);
  check(server?.remotes?.[0]?.url === MCP_URL, `The registry remote must be ${MCP_URL}`, errors);
  check(!Object.hasOwn(server ?? {}, "packages"), "The remote-only registry entry must not declare a local package", errors);
  check(!containsSensitiveKey(server), "server.json must not contain headers, credentials, tokens, or private keys", errors);
  const serialized = JSON.stringify(server);
  check(!/\b(?:gh[pousr]_|github_pat_|pat_|prt_|sk-(?:proj-)?)[A-Za-z0-9_-]{8,}\b/.test(serialized),
    "server.json must not contain a token or personal access token", errors);
  return errors;
}

async function findServerFile() {
  for (const candidate of [path.join(PLUGIN_ROOT, "server.json"), path.join(REPOSITORY_ROOT, "server.json")]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw new Error("Could not locate server.json in the canonical package or public repository root");
}

async function expectedPackageVersion() {
  const manifest = JSON.parse(await readFile(path.join(PLUGIN_ROOT, "package.json"), "utf8"));
  return manifest.version;
}

async function validateOffline(serverFile) {
  const server = JSON.parse(await readFile(serverFile, "utf8"));
  const errors = validateRegistryManifest(server, { expectedVersion: await expectedPackageVersion() });
  if (errors.length) throw new Error(errors.join("; "));
  return server;
}

function publisherPlatform() {
  const platform = process.platform;
  const architecture = process.arch === "x64" ? "amd64" : process.arch;
  const key = `${platform}-${architecture}`;
  const checksum = PUBLISHER_CHECKSUMS.get(key);
  if (!checksum) throw new Error(`Schema validation is unsupported on ${process.platform}/${process.arch}`);
  return { platform, architecture, checksum };
}

async function validateWithOfficialPublisher(serverFile) {
  const { platform, architecture, checksum } = publisherPlatform();
  const artifact = `mcp-publisher_${platform}_${architecture}.tar.gz`;
  const url = `https://github.com/modelcontextprotocol/registry/releases/download/${PUBLISHER_VERSION}/${artifact}`;
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Could not download the pinned MCP publisher: HTTP ${response.status}`);
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize && declaredSize > 20 * 1024 * 1024) throw new Error("Pinned MCP publisher exceeded the download limit");
  const archive = Buffer.from(await response.arrayBuffer());
  if (archive.length > 20 * 1024 * 1024) throw new Error("Pinned MCP publisher exceeded the download limit");
  const actual = createHash("sha256").update(archive).digest("hex");
  if (actual !== checksum) throw new Error(`Pinned MCP publisher checksum mismatch for ${artifact}`);

  const temporary = await mkdtemp(path.join(os.tmpdir(), "pearl-mcp-publisher-"));
  try {
    const archivePath = path.join(temporary, artifact);
    const publisherPath = path.join(temporary, "mcp-publisher");
    await writeFile(archivePath, archive, { mode: 0o600 });
    execFileSync("tar", ["--extract", "--gzip", "--file", archivePath, "--directory", temporary, "mcp-publisher"], {
      stdio: "pipe"
    });
    await chmod(publisherPath, 0o700);
    execFileSync(publisherPath, ["validate", serverFile], { stdio: "inherit" });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function validateLive(server) {
  const remote = new URL(server.remotes[0].url);
  const request = (url, init = {}) => fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(10_000) });
  const metadataResponse = await request(RESOURCE_METADATA_URL);
  if (metadataResponse.status !== 200) throw new Error(`Protected-resource metadata returned ${metadataResponse.status}`);
  const metadata = await metadataResponse.json();
  if (metadata.resource !== MCP_URL) throw new Error(`Protected resource must be ${MCP_URL}`);
  if (JSON.stringify(metadata.authorization_servers) !== JSON.stringify([MCP_ORIGIN])) {
    throw new Error(`Protected resource must use exactly ${MCP_ORIGIN} as its authorization server`);
  }

  const response = await request(remote, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "pearl-registry-validator", version: server.version }
      }
    })
  });
  if (response.status !== 401) throw new Error(`Unauthenticated registry remote returned ${response.status}, expected 401`);
  const challenge = response.headers.get("www-authenticate") ?? "";
  if (!challenge.includes(`resource_metadata=\"${RESOURCE_METADATA_URL}\"`)) {
    throw new Error("Registry remote challenge did not advertise the exact protected-resource metadata URL");
  }
}

async function main() {
  const options = new Set(process.argv.slice(2));
  for (const option of options) {
    if (!["--schema", "--live"].includes(option)) throw new Error(`Unknown option: ${option}`);
  }
  const serverFile = await findServerFile();
  const server = await validateOffline(serverFile);
  if (options.has("--schema")) await validateWithOfficialPublisher(serverFile);
  if (options.has("--live")) await validateLive(server);
  const completed = ["offline", options.has("--schema") ? "official schema" : null, options.has("--live") ? "live remote" : null]
    .filter(Boolean).join(", ");
  console.log(`Pearl MCP Registry validation passed (${completed}).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
