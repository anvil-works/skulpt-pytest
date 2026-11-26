#!/usr/bin/env node
/**
 * Publishes a canary release of @anvil-works/skulpt-pytest under the `canary` dist-tag.
 *
 * Usage:
 *   pnpm run publish:canary -- --dry-run
 *   pnpm run publish:canary
 *   pnpm run publish:canary -- --version 0.0.1-canary.3
 *   pnpm run publish:canary -- --allow-dirty --dry-run
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const pkgPath = resolve(rootDir, 'package.json');

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const dryRun = args.includes('--dry-run');
const allowDirty = args.includes('--allow-dirty');
const skipTests = args.includes('--skip-tests');
const versionEq = args.find((arg) => arg.startsWith('--version='));
const versionFlagIdx = args.indexOf('--version');
let requestedVersion;
if (versionEq) {
  requestedVersion = versionEq.slice('--version='.length);
} else if (versionFlagIdx !== -1) {
  requestedVersion = args[versionFlagIdx + 1];
  if (!requestedVersion || requestedVersion.startsWith('-')) {
    console.error('--version requires a value (e.g. --version 0.0.1-canary.1).');
    process.exit(1);
  }
}

const CANARY_RE = /^(\d+\.\d+\.\d+)-canary\.(0|[1-9]\d*)$/;

function run(cmd, cmdArgs, opts = {}) {
  const res = spawnSync(cmd, cmdArgs, { cwd: rootDir, stdio: 'inherit', ...opts });
  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    const err = new Error(`${cmd} ${cmdArgs.join(' ')} exited with code ${res.status ?? 1}`);
    err.exitCode = res.status ?? 1;
    throw err;
  }
}

function getPublishedCanaryVersions(pkgName) {
  try {
    const out = execFileSync('npm', ['view', pkgName, 'versions', '--json'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!out) return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // Package not published yet.
    return [];
  }
}

function nextCanaryVersion(pkgName, currentVersion) {
  const baseMatch = /^(\d+\.\d+\.\d+)/.exec(currentVersion);
  const base = baseMatch ? baseMatch[1] : '0.0.1';
  const existing = getPublishedCanaryVersions(pkgName);
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
const targetVersion = requestedVersion ?? nextCanaryVersion(pkg.name, pkg.version);

if (!CANARY_RE.test(targetVersion)) {
  console.error(`Canary releases must match X.Y.Z-canary.N; got "${targetVersion}".`);
  process.exit(1);
}

console.log(`Preparing ${dryRun ? '(dry-run) ' : ''}${pkg.name}@${targetVersion} (dist-tag: canary)...`);

try {
  run('pnpm', ['run', 'check']);
  run('pnpm', ['run', 'build']);
  if (!skipTests && process.env.SKULPT_DIST) {
    run('pnpm', ['run', 'test']);
    run('pnpm', ['run', 'test:package']);
  } else if (!skipTests) {
    console.log('Note: SKULPT_DIST not set; skipping Skulpt runtime test suite (set SKULPT_DIST to run it before publishing).');
  }

  const updatedPkg = { ...pkg, version: targetVersion };
  writeFileSync(pkgPath, JSON.stringify(updatedPkg, null, 2) + '\n', 'utf8');

  try {
    const publishArgs = ['publish', '--tag', 'canary', '--access', 'public', '--no-git-checks'];
    if (dryRun) {
      publishArgs.push('--dry-run');
    }
    run('pnpm', publishArgs);
  } finally {
    // Keep canary versions ephemeral rather than dirtying the branch.
    writeFileSync(pkgPath, originalPkgText, 'utf8');
  }
} catch (err) {
  if (!err?.exitCode) {
    console.error(err);
  }
  process.exit(err?.exitCode ?? 1);
}

console.log(dryRun ? '\nDry-run complete. To consume this canary in Anvil once published:' : '\nDone! To consume this canary in Anvil:');
console.log(`  1. runtime/client/package.json:`);
console.log(`     "${pkg.name}": "${targetVersion}"`);
console.log(`  2. pnpm-workspace.yaml (under minimumReleaseAgeExclude):`);
console.log(`     - "${pkg.name}"`);
