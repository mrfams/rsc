/**
 * Repairs package-lock.json after the disk-space crash that dropped the
 * expo-dev-client entries. Uses `npm view` (tiny metadata fetches) instead of
 * a full npm install crawl. Run: node scripts/fix-lock.cjs
 */
require('dotenv').config();
const { execSync } = require('node:child_process');
const fs = require('node:fs');

const LOCK_PATH = 'package-lock.json';
const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));

function npmView(spec, field) {
  const out = execSync(`npm view ${spec} ${field} --json`, { encoding: 'utf8' });
  return out.trim() ? JSON.parse(out) : undefined;
}

function pick(candidates, range) {
  return Array.isArray(candidates) ? candidates[candidates.length - 1] : candidates;
}

function resolveVersion(name, range) {
  return pick(npmView(`${name}@${range}`, 'version'));
}

function manifest(name, version) {
  const integr = npmView(`${name}@${version}`, 'dist.integrity');
  const resolved = npmView(`${name}@${version}`, 'dist.tarball');
  const deps =
    npmView(`${name}@${version}`, 'dependencies') ?? {};
  return { resolved, integrity: integr, deps: typeof deps === 'string' ? {} : deps };
}

const rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Also patch the root packages[""] entry so npm ci sees a consistent tree.
if (!lock.packages[''].dependencies['expo-dev-client']) {
  lock.packages[''].dependencies['expo-dev-client'] = rootPkg.dependencies['expo-dev-client'];
  console.log('added expo-dev-client to root packages[""].dependencies');
}
const fsCheck = lock.packages[''].dependencies;

const wanted = {
  'expo-dev-client': rootPkg.dependencies['expo-dev-client'],
};

// Queue of { name, range, why } to reconcile.
const queue = Object.entries(wanted).map(([name, range]) => ({ name, range }));
const added = [];
const seen = new Set();

while (queue.length > 0) {
  const { name, range } = queue.shift();
  const key = `node_modules/${name}`;
  const existing = lock.packages[key];
  if (existing && seen.has(name)) continue;
  seen.add(name);

  // If the entry exists and satisfies the range, keep it and recurse into its
  // stored dependencies only when missing.
  if (existing) {
    const deps = { ...(existing.dependencies ?? {}) };
    for (const [dep, depRange] of Object.entries(deps)) {
      if (!lock.packages[`node_modules/${dep}`]) queue.push({ name: dep, range: depRange });
    }
    continue;
  }

  const version = resolveVersion(name, range);
  if (!version) {
    console.error(`Could not resolve ${name}@${range}`);
    process.exit(1);
  }
  const { resolved, integrity, deps } = manifest(name, version);
  lock.packages[key] = { version, resolved, integrity, dependencies: deps };
  added.push(`${name}@${version}`);
  for (const [dep, depRange] of Object.entries(deps)) {
    if (!lock.packages[`node_modules/${dep}`]) queue.push({ name: dep, range: depRange });
  }
}

fs.writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n');
console.log('added entries:', added.join(', ') || '(none)');
