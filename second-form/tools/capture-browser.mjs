// Captures the browser renderer's converged image at one of the three light
// positions, for the browser-versus-film comparison in out/checks.
//   node tools/capture-browser.mjs <out.png> [preset=arc] [--gpu] [--timeout 900]
// Needs Playwright (npm i playwright, or a global install) and its Chromium. Without
// --gpu the page runs on SwiftShader (software WebGL2), which takes several minutes.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
function playwright() {
  try { return require('playwright'); } catch { /* fall back to a global install */ }
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}

const args = process.argv.slice(2);
const out = args[0];
const preset = args[1] && !args[1].startsWith('--') ? args[1] : 'arc';
const gpu = args.includes('--gpu');
const limit = args.includes('--timeout') ? Number(args[args.indexOf('--timeout') + 1]) : 900;
const page = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'the-second-form.html');

const { chromium } = playwright();
const browser = await chromium.launch({
  args: gpu ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const tab = await browser.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 1 });
tab.on('pageerror', (e) => console.error('[page]', e.message));
// #test: 640-pixel-wide canvas, no film, light placed at the preset
await tab.goto(`${pathToFileURL(page).href}#test:compose:${preset}`);
const t0 = Date.now();
for (;;) {
  await tab.waitForTimeout(10000);
  const st = await tab.evaluate(() => (window.__status ? window.__status() : null)).catch(() => null);
  const s = ((Date.now() - t0) / 1000).toFixed(0);
  console.error(`${s}s ${JSON.stringify(st)}`);
  if (st && st.progress >= 0.999 && st.spp > 96) break;
  if ((Date.now() - t0) / 1000 > limit) { console.error('timed out; saving the current state'); break; }
}
const data = await tab.evaluate(() => window.__snapshot());
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
console.error(`wrote ${out}`);
await browser.close();
