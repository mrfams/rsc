/**
 * Ship the newest EAS Android build to the people who install the app.
 *
 *   1. find the newest finished Android build on EAS
 *   2. download its APK
 *   3. attach it to a GitHub release (the EAS artifact URLs expire, release
 *      assets do not)
 *   4. point the install link in `app_config` at the new file, so the
 *      download page, its QR code and the in-app button update immediately
 *
 * Run with: npm run publish:apk
 * Needs: the EAS CLI (logged in), the GitHub CLI (`gh`) and DATABASE_URL.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { setAndroidDownloadUrl } from '../src/lib/download-config';

type EasBuild = {
  id: string;
  platform: string;
  status: string;
  appVersion: string;
  appBuildVersion: string;
  distribution: string;
  buildProfile: string;
  createdAt: string;
  artifacts?: { applicationArchiveUrl?: string; buildUrl?: string };
};

/** Windows needs the `.cmd` shim to spawn npm-installed binaries. */
function bin(command: string): string {
  return process.platform === 'win32' ? `${command}.cmd` : command;
}

function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * `.cmd` shims (npx) cannot be spawned directly on Windows, so those calls go
 * through the shell. Only used for argument lists without spaces.
 */
function runShell(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
}

/** The GitHub repository the release is published to (from the git remote). */
function repoSlug(): string {
  try {
    const remote = run('git', ['remote', 'get-url', 'origin']).trim();
    const match = remote.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/);
    if (match) return match[1];
  } catch {
    // fall through to the default below
  }
  return 'mrfams/rsc';
}

async function latestAndroidBuild(): Promise<EasBuild> {
  const raw = runShell(bin('npx'), [
    '--yes',
    'eas-cli@latest',
    'build:list',
    '--platform',
    'android',
    '--json',
  ]);
  const builds = JSON.parse(raw) as EasBuild[];
  /*
   * Ship a `production` build, because that is the channel OTA updates are
   * published to. Picking a preview build here would install an APK that
   * silently ignores every production update.
   */
  const finished = builds
    .filter(
      (b) =>
        b.status === 'FINISHED' &&
        b.artifacts?.applicationArchiveUrl &&
        b.buildProfile === 'production',
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (finished.length === 0) {
    throw new Error(
      'No finished production Android build found. Run `npm run build:android:production` first.',
    );
  }
  return finished[0];
}

async function download(url: string, target: string): Promise<number> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Could not download the APK (${response.status} ${response.statusText}).`);
  }
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(target));
  const { size } = await stat(target);
  return size;
}

async function main() {
  const build = await latestAndroidBuild();
  const tag = `apk-${build.appVersion}-${build.appBuildVersion}`;
  const repo = repoSlug();
  const url = build.artifacts!.applicationArchiveUrl!;

  console.log(`• build ${build.id} (${build.appVersion} / ${build.appBuildVersion})`);
  console.log(`  artifact: ${url}`);

  const dir = join(tmpdir(), 'emu-apk');
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'app.apk');
  const size = await download(url, file);
  console.log(`✓ downloaded ${(size / 1048576).toFixed(1)} MB`);

  // Create the release if it is missing, otherwise replace the asset in it.
  let releaseExists = true;
  try {
    run('gh', ['release', 'view', tag, '--repo', repo]);
  } catch {
    releaseExists = false;
  }
  if (releaseExists) {
    run('gh', ['release', 'upload', tag, `${file}#app.apk`, '--clobber', '--repo', repo]);
  } else {
    run('gh', [
      'release',
      'create',
      tag,
      `${file}#app.apk`,
      '--repo',
      repo,
      '--title',
      `EMU Bin Tracker ${build.appVersion} (${build.appBuildVersion})`,
      '--notes',
      `Android install file for EAS build ${build.id}.\n\nThis build follows the \`production\` EAS Update channel, so it receives UI fixes over the air.`,
      '--latest',
    ]);
  }
  // Keep "latest" pointing at the APK release so
  // /releases/latest/download/app.apk always resolves to the newest build.
  run('gh', ['release', 'edit', tag, '--latest', '--repo', repo]);

  const downloadUrl = `https://github.com/${repo}/releases/download/${tag}/app.apk`;
  await setAndroidDownloadUrl(downloadUrl);
  console.log(`✓ release ${tag} → ${downloadUrl}`);
  console.log('✓ install link updated (app_config) — the download page is live already');

  await rm(dir, { recursive: true, force: true });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Publish failed:', err);
    process.exit(1);
  });
