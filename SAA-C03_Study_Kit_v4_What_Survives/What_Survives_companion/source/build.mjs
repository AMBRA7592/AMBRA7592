// Build the self-contained companion page and its source map.
//
//   node source/build.mjs          (run from What_Survives_companion/)
//
// Inlines styles.css, model.js, teaching.js, view.js and app.js into
// page.html and writes AWS_What_Survives.html next to this folder. The output
// depends only on the source files, so rebuilding produces identical bytes.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..');
const read = (f) => fs.readFileSync(path.join(here, f), 'utf8');

const parts = {
  STYLES: read('styles.css'),
  MODEL: read('model.js'),
  TEACHING: read('teaching.js'),
  VIEW: read('view.js'),
  APP: read('app.js')
};
for (const [name, text] of Object.entries(parts)) {
  if (/<\/(script|style)/i.test(text)) throw new Error(`${name} contains a closing script/style tag and cannot be inlined`);
}

let html = read('page.html');
const slots = {
  STYLES: '/*__STYLES__*/',
  MODEL: '//__MODEL__',
  TEACHING: '//__TEACHING__',
  VIEW: '//__VIEW__',
  APP: '//__APP__'
};
for (const [name, slot] of Object.entries(slots)) {
  const at = html.indexOf(slot);
  if (at < 0 || html.indexOf(slot, at + 1) >= 0) throw new Error(`slot ${slot} must appear exactly once`);
  html = html.slice(0, at) + parts[name].trimEnd() + html.slice(at + slot.length);
}
if (/\b(src|href)\s*=\s*["']https?:\/\/[^"']+\.(js|css)["']/i.test(html)) throw new Error('external script or stylesheet reference found');

const target = path.join(out, 'AWS_What_Survives.html');
fs.writeFileSync(target, html);

// Source map (Markdown) from the same teaching data the page uses.
const ctx = {};
vm.createContext(ctx);
vm.runInContext(parts.TEACHING, ctx);
const T = ctx.WhatSurvivesTeaching;
const guide = (anchor) => `${T.guideHref}#${anchor}`;
const lines = [];
lines.push('# Source map — AWS — What Survives');
lines.push('');
lines.push('Each teaching claim, the guide section that teaches it, the AWS documentation that supports it, and the date it was checked.');
lines.push('Generated from `source/teaching.js` by `source/build.mjs`; the same table appears under **Sources & assumptions** in the companion.');
lines.push('');
lines.push(`**How the claims were checked.** ${T.sources.method}`);
for (const id of ['photo', 'database', 'payment']) {
  const st = T.studies[id];
  lines.push('');
  lines.push(`## Study ${st.number} · ${st.title}`);
  lines.push('');
  lines.push('| Teaching claim | Guide | AWS documentation | Checked |');
  lines.push('|---|---|---|---|');
  for (const c of T.sources[id]) {
    const g = c.guide.length ? c.guide.map(([a, l]) => `[${l}](${guide(a)})`).join(', ') : '— (companion detail)';
    const a = c.aws.map(([l, u]) => `[${l}](${u})`).join('<br>');
    lines.push(`| ${c.claim} | ${g} | ${a} | ${T.checked} |`);
  }
  lines.push('');
  lines.push('**Teaching assumptions**');
  lines.push('');
  for (const x of st.assumptions) lines.push(`- ${x}`);
  lines.push('');
  lines.push(`**Not modelled:** ${st.notModelled}`);
}
lines.push('');
fs.writeFileSync(path.join(out, 'SOURCE_MAP.md'), lines.join('\n'));

const hash = crypto.createHash('sha256').update(html).digest('hex');
console.log(`wrote ${path.relative(process.cwd(), target)} (${Buffer.byteLength(html)} bytes, sha256 ${hash})`);
console.log(`wrote ${path.relative(process.cwd(), path.join(out, 'SOURCE_MAP.md'))}`);
