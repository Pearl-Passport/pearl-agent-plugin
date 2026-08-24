import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Preserve the original credential namespace so upgrading never strands a
// still-valid refresh token in the operating-system credential manager.
const SERVICE = 'com.pearl.agent-cli';
const LOCK_WAIT_MS = 50;
const LOCK_TIMEOUT_MS = 30_000;
const OWNER_WRITE_GRACE_MS = 5_000;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

/** Serialize keychain read/refresh/write across concurrent Pearl CLI processes. */
export async function withCredentialLock(account, operation, options = {}) {
  const timeoutMs = options.timeoutMs ?? LOCK_TIMEOUT_MS;
  const lockName = createHash('sha256').update(`${SERVICE}:${account}`).digest('hex').slice(0, 32);
  const lockDirectory = join(tmpdir(), `pearl-cli-${lockName}.lock`);
  const ownerPath = join(lockDirectory, 'owner.json');
  const owner = { pid: process.pid, nonce: randomBytes(16).toString('hex'), created_at: Date.now() };
  const deadline = Date.now() + timeoutMs;

  while (true) {
    try {
      await mkdir(lockDirectory, { mode: 0o700 });
      await writeFile(ownerPath, JSON.stringify(owner), { encoding: 'utf8', mode: 0o600 });
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let reclaim = false;
      try {
        const current = JSON.parse(await readFile(ownerPath, 'utf8'));
        reclaim = !processIsRunning(current.pid);
      } catch {
        try {
          const details = await stat(lockDirectory);
          reclaim = Date.now() - details.mtimeMs > OWNER_WRITE_GRACE_MS;
        } catch (statError) {
          if (statError?.code === 'ENOENT') continue;
          throw statError;
        }
      }
      if (reclaim) {
        await rm(lockDirectory, { recursive: true, force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error('Timed out waiting for another Pearl CLI command to finish refreshing credentials.');
      }
      await delay(LOCK_WAIT_MS);
    }
  }

  try {
    return await operation();
  } finally {
    try {
      const current = JSON.parse(await readFile(ownerPath, 'utf8'));
      if (current.nonce === owner.nonce) await rm(lockDirectory, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== 'ENOENT') process.stderr.write('Pearl CLI warning: credential lock cleanup failed.\n');
    }
  }
}

export function credentialWriteSpec(platform, account, value) {
  if (platform === 'darwin') {
    return {
      command: 'security',
      args: ['add-generic-password', '-a', account, '-s', SERVICE, '-U', '-w'],
      input: `${value}\n`,
    };
  }
  if (platform === 'linux') {
    return {
      command: 'secret-tool',
      args: ['store', '--label', 'Pearl CLI', 'service', SERVICE, 'account', account],
      input: value,
    };
  }
  throw new Error('Pearl CLI currently supports macOS Keychain and Linux Secret Service.');
}

function run(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0
      ? resolve(stdout.trim())
      : reject(new Error(stderr.trim() || `${command} exited ${code}`)));
    child.stdin.end(input ?? '');
  });
}

export async function readCredential(account, options = {}) {
  const platform = options.platform ?? process.platform;
  const runCommand = options.runCommand ?? run;
  try {
    if (platform === 'darwin') {
      return await runCommand('security', ['find-generic-password', '-a', account, '-s', SERVICE, '-w']);
    }
    if (platform === 'linux') {
      return await runCommand('secret-tool', ['lookup', 'service', SERVICE, 'account', account]);
    }
    throw new Error('Pearl CLI currently supports macOS Keychain and Linux Secret Service.');
  } catch (error) {
    if (/could not be found|not found|exited 1/i.test(error.message)) return null;
    throw error;
  }
}

export async function writeCredential(account, value, options = {}) {
  const spec = credentialWriteSpec(options.platform ?? process.platform, account, value);
  try {
    await (options.runCommand ?? run)(spec.command, spec.args, spec.input);
  } catch {
    // Some credential helpers include submitted input in diagnostic output.
    // Never forward their raw error after token material was sent on stdin.
    throw new Error('Pearl CLI could not store credentials in the operating-system credential manager.');
  }
}

export async function deleteCredential(account, options = {}) {
  const platform = options.platform ?? process.platform;
  const runCommand = options.runCommand ?? run;
  try {
    if (platform === 'darwin') {
      await runCommand('security', ['delete-generic-password', '-a', account, '-s', SERVICE]);
      return;
    }
    if (platform === 'linux') {
      await runCommand('secret-tool', ['clear', 'service', SERVICE, 'account', account]);
      return;
    }
    throw new Error('Pearl CLI currently supports macOS Keychain and Linux Secret Service.');
  } catch (error) {
    if (!/could not be found|not found|exited 1/i.test(error.message)) throw error;
  }
}
