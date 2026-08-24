#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

assert.equal(manifest.name, '@joinpearl/cli');
assert.equal(manifest.version, '1.0.0');
assert.equal(manifest.license, 'MIT');
assert.equal(manifest.private, undefined);
assert.deepEqual(manifest.os, ['darwin', 'linux']);
assert.deepEqual(manifest.bin, { pearl: './src/index.mjs' });
assert.equal(manifest.publishConfig.access, 'public');
assert.equal(manifest.publishConfig.provenance, true);

const packed = JSON.parse(execFileSync('npm', [
  'pack', '--dry-run', '--json', '--ignore-scripts',
], { cwd: root, encoding: 'utf8' }))[0];
const expected = [
  'LICENSE',
  'README.md',
  'package.json',
  'src/index.mjs',
  'src/keychain.mjs',
  'src/oauth.mjs',
];
assert.deepEqual(packed.files.map((file) => file.path).sort(), expected.sort());
assert.equal(packed.bundled.length, 0);

const publicSources = ['README.md', 'src/index.mjs', 'src/keychain.mjs', 'src/oauth.mjs']
  .map((relative) => readFileSync(resolve(root, relative), 'utf8'))
  .join('\n');
assert.doesNotMatch(publicSources, /\b[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*_(?:prepare|commit)\b/);
assert.doesNotMatch(publicSources, /\b[a-z-]+:write\b/);
assert.doesNotMatch(publicSources, /\bvisits?_photos?\b/i);
assert.equal((publicSources.match(/https:\/\/agent\.joinpearl\.co\/mcp/g) ?? []).length >= 1, true);

process.stdout.write('Pearl CLI package validation passed.\n');
