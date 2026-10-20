/*
 * Full build: icons -> Vite frontend (build/public) -> Worker bundle
 * (build/worker.js) -> deploy manifest (build/manifest.json).
 */
import { execFileSync } from 'node:child_process';
import { build as esbuild } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPAT_DATE = '2026-09-15';

console.log('> icons');
execFileSync(process.execPath, [join(root, 'scripts/gen-icons.mjs')], { stdio: 'inherit' });

console.log('> vite build');
const { build: viteBuild } = await import('vite');
await viteBuild({ root, logLevel: 'info' });

console.log('> worker bundle');
mkdirSync(join(root, 'build'), { recursive: true });
await esbuild({
  entryPoints: [join(root, 'worker/index.ts')],
  outfile: join(root, 'build/worker.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  minify: false,
  sourcemap: false,
  legalComments: 'none',
});

console.log('> manifest');
const manifest = {
  entrypoint: 'index.js',
  compatibilityDate: COMPAT_DATE,
  modules: [{ name: 'index.js', type: 'esm', path: './worker.js' }],
  assetsDirectory: './public',
  spa: true,
};
writeFileSync(join(root, 'build/manifest.json'), JSON.stringify(manifest, null, 2));
console.log('done: build/manifest.json, build/worker.js, build/public/');