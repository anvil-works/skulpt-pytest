#!/usr/bin/env node
/**
 * Publishes a canary release of @anvil-works/skulpt-pytest under the `canary` dist-tag.
 *
 * Usage:
 *   pnpm run publish:canary -- --dry-run
 *   pnpm run publish:canary
 *   pnpm run publish:canary -- --version 0.0.1-canary.3
 *   pnpm run publish:canary -- --allow-dirty --dry-run
 *   pnpm run publish:canary -- --skip-tests --dry-run
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const pkgPath = resolve(rootDir, 'package.json');

const rawArgs = process.argv.slice(2);
const cliArgs = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
let parsedArgs;
try {
  parsedArgs = parseArgs({
    args: cliArgs,
    allowPositionals: false,
    strict: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      'allow-dirty': { type: 'boolean', default: false },
      'skip-tests': { type: 'boolean', default: false },
      version: { type: 'string' },
    },
  });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const dryRun = parsedArgs.values['dry-run'];
const allowDirty = parsedArgs.values['allow-dirty'];
const skipTests = parsedArgs.values['skip-tests'];
const requestedVersion = parsedArgs.values.version;

const CANARY_RE = /^(\d+\.\d+\.\d+)-canary\.(0|[1-9]\d*)$/;

function run(cmd, cmdArgs, opts = {}) {
  const res = spawnSync(cmd, cmdArgs, { cwd: rootDir, stdio: 'inherit', ...opts });
  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    const err = new Error();
    err.exitCode = res.status ?? 1;
    throw err;
  }
}

function getPublishedVersions(pkgName) {
  const res = spawnSync('npm', ['view', pkgName, 'versions', '--json'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    const details = `${res.stderr ?? ''}\n${res.stdout ?? ''}`;
    if (/\bE404\b|404 Not Found|is not in this registry/i.test(details)) {
      return [];
    }
    throw new Error(`Failed to query published versions for ${pkgName}:\n${details.trim()}`);
  }
  const out = (res.stdout ?? '').trim();
  if (!out) return [];
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function nextCanaryVersion(pkgName, currentVersion) {
  const baseMatch = /^(\d+\.\d+\.\d+)/.exec(currentVersion);
  const base = baseMatch ? baseMatch[1] : '0.0.1';
  const existing = getPublishedVersions(pkgName);
  let maxN = 0;
  for (const v of existing) {
    const m = CANARY_RE.exec(v);
    if (m && m[1] === base) {
      maxN = Math.max(maxN, Number(m[2]));
    }
  }
  return `${base}-canary.${maxN + 1}`;
}

if (!allowDirty) {
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: rootDir, encoding: 'utf8' }).trim();
  if (status) {
    console.error('Refusing to publish from a dirty working tree. Commit/stash changes or pass --allow-dirty.');
    console.error(status);
    process.exit(1);
  }
}

const originalPkgText = readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(originalPkgText);
let targetVersion;
try {
  targetVersion = requestedVersion ?? nextCanaryVersion(pkg.name, pkg.version);
} catch (err) {
  console.error(err.message ?? err);
  process.exit(1);
}

if (!CANARY_RE.test(targetVersion)) {
  console.error(`Canary releases must match X.Y.Z-canary.N; got "${targetVersion}".`);
  process.exit(1);
}

console.log(`Preparing ${dryRun ? '(dry-run) ' : ''}${pkg.name}@${targetVersion} (dist-tag: canary)...`);

let stageDir;
try {
  run('pnpm', ['run', 'check']);
  run('pnpm', ['run', 'build']);
  if (!skipTests && process.env.SKULPT_DIST) {
    run('pnpm', ['run', 'test']);
    run('pnpm', ['run', 'test:package']);
  } else if (!skipTests) {
    console.log('Note: SKULPT_DIST not set; skipping Skulpt runtime test suite (set SKULPT_DIST to run it before publishing).');
  }

  // Publish from a staging directory so the checkout's package.json is never dirtied, even on SIGINT.
  stageDir = mkdtempSync(join(tmpdir(), 'skulpt-pytest-canary-'));
  const entriesToStage = new Set([...(pkg.files ?? []), 'README.md', 'LICENSE']);
  for (const entry of entriesToStage) {
    const src = resolve(rootDir, entry);
    if (existsSync(src)) {
      cpSync(src, join(stageDir, entry), { recursive: true });
    }
  }
  const updatedPkg = { ...pkg, version: targetVersion };
  writeFileSync(join(stageDir, 'package.json'), JSON.stringify(updatedPkg, null, 2) + '\n', 'utf8');

  const publishArgs = ['publish', '--tag', 'canary', '--access', 'public', '--no-git-checks', '--ignore-scripts'];
  if (dryRun) {
    publishArgs.push('--dry-run');
  }
  run('pnpm', publishArgs, { cwd: stageDir });
} catch (err) {
  if (!err?.exitCode) {
    console.error(err);
  }
  process.exit(err?.exitCode ?? 1);
} finally {
  if (stageDir) {
    rmSync(stageDir, { recursive: true, force: true });
  }
}

console.log(dryRun ? '\nDry-run complete. To consume this canary in Anvil once published:' : '\nDone! To consume this canary in Anvil:');
console.log(`  1. runtime/client/package.json:`);
console.log(`     "${pkg.name}": "${targetVersion}"`);
console.log(`  2. pnpm-workspace.yaml (under minimumReleaseAgeExclude):`);
console.log(`     - "${pkg.name}"`);
