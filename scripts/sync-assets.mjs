#!/usr/bin/env node
/**
 * Copies the authored art in `game_assets/` into `public/assets/` so Next can serve it.
 *
 * `game_assets/` stays the source of truth in version control (that is where the user drops
 * new art); `public/assets/` is generated and gitignored. Runs automatically before `dev`
 * and `build`, and on demand via `npm run assets:sync`.
 *
 * Phase 0 scope: a faithful copy plus a manifest of what landed. The typed art-override
 * manifest and responsive background variants arrive with the asset pipeline proper
 * (docs/tech/asset-pipeline.md §3–4).
 */

import { cp, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(root, 'game_assets');
const targetRoot = join(root, 'public', 'assets');

/**
 * source (relative to game_assets) → target (relative to public/assets)
 *
 * `transcode` groups are re-encoded to WebP at display size instead of copied. The authored PNGs
 * stay in `game_assets/` at full resolution — that is the archive, and nothing here touches it.
 */
const MAPPINGS = [
  { from: 'UI/Backgrounds', to: 'backgrounds', transcode: 1920 },
  { from: 'UI/Classes', to: 'classes', transcode: 768 },
  { from: 'UI/Kenney_FantasyUIAssets', to: 'ui/kenney-fantasy' },
  { from: 'VFX/Kenney_VFXParticles', to: 'vfx/kenney-particles' },
];

/**
 * `[TUNE]` WebP quality. 78 is where these paintings stop losing anything visible.
 *
 * The Phase 17 performance pass found the reason this step exists: the authored backdrops are
 * 2730×1536 PNGs at 4–5 MB each, 56 MB across the fourteen rooms, and the game was serving them
 * *as they were authored*. Lighthouse measured **LCP at 21.5 seconds** on a first-contentful-paint
 * of 0.3 — the room painted immediately and then waited twenty seconds for its own wallpaper.
 * A faithful copy was the right Phase 0 behaviour and the wrong thing to ship.
 */
const WEBP_QUALITY = 78;

/**
 * Re-encode every raster in a tree to WebP, capped at `width`, preserving the folder shape.
 *
 * Never *up*scales: `withoutEnlargement` means a small overlay stays its own size rather than
 * being blown up to the cap and losing to its own interpolation.
 */
async function transcodeTree(source, target, width) {
  await mkdir(target, { recursive: true });
  let files = 0;
  let before = 0;
  let after = 0;

  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    if (entry.isDirectory()) {
      const nested = await transcodeTree(from, join(target, entry.name), width);
      files += nested.files;
      before += nested.before;
      after += nested.after;
      continue;
    }

    if (!/\.(png|jpe?g|webp)$/i.test(entry.name)) {
      await cp(from, join(target, entry.name), { force: true });
      files += 1;
      continue;
    }

    const to = join(target, `${basename(entry.name, extname(entry.name))}.webp`);
    await sharp(from)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(to);

    before += (await stat(from)).size;
    after += (await stat(to)).size;
    files += 1;
  }

  return { files, before, after };
}

async function countFiles(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    total += entry.isDirectory() ? await countFiles(join(dir, entry.name)) : 1;
  }
  return total;
}

async function main() {
  if (!existsSync(sourceRoot)) {
    console.warn(`[assets] no game_assets/ directory at ${sourceRoot} — nothing to sync.`);
    return;
  }

  await mkdir(targetRoot, { recursive: true });
  const summary = [];

  for (const { from, to, transcode } of MAPPINGS) {
    const source = join(sourceRoot, from);
    const target = join(targetRoot, to);

    if (!existsSync(source)) {
      console.warn(`[assets] skipping missing source: ${relative(root, source)}`);
      continue;
    }

    if (transcode) {
      const result = await transcodeTree(source, target, transcode);
      const saved = result.before === 0 ? 0 : 1 - result.after / result.before;
      summary.push({
        source: from,
        served: `/assets/${to}`,
        files: result.files,
        format: 'webp',
        maxWidth: transcode,
        note: `${(result.before / 1e6).toFixed(1)} MB → ${(result.after / 1e6).toFixed(1)} MB (−${Math.round(saved * 100)}%)`,
      });
      continue;
    }

    await cp(source, target, { recursive: true, force: true });
    summary.push({ source: from, served: `/assets/${to}`, files: await countFiles(target) });
  }

  // The optional player-supplied soundtrack lives here (USER_QUESTIONS Q13).
  const audioDir = join(targetRoot, 'audio');
  await mkdir(audioDir, { recursive: true });
  await writeFile(
    join(audioDir, 'README.txt'),
    [
      'Optional background music.',
      '',
      'Drop an MP3 named exactly `bgm.mp3` into this folder and the game will loop it as',
      'background music, with its own toggle and volume slider in Settings. Remove the file',
      'and the game is silent again — no code changes either way.',
      '',
      'This folder is generated by scripts/sync-assets.mjs; bgm.mp3 itself is gitignored.',
      '',
    ].join('\n'),
    'utf8',
  );

  const manifest = {
    generatedBy: 'scripts/sync-assets.mjs',
    note: 'Generated file — edit game_assets/ instead. See docs/tech/asset-pipeline.md.',
    groups: summary,
  };
  await writeFile(
    join(targetRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  const total = summary.reduce((sum, group) => sum + group.files, 0);
  console.log(`[assets] synced ${total} files into public/assets/`);
  for (const group of summary) {
    console.log(
      `[assets]   ${group.served.padEnd(26)} ${String(group.files).padStart(4)} files` +
        (group.note ? `  ${group.note}` : ''),
    );
  }
}

main().catch((error) => {
  console.error('[assets] sync failed:', error);
  process.exitCode = 1;
});
