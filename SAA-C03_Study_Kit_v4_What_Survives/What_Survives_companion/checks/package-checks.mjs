// Package checks for AWS — What Survives.
//
//   node checks/package-checks.mjs      (run from What_Survives_companion/)
//
// 1. The original guide package is byte-for-byte unchanged (EDITION.json).
// 2. MANIFEST.json lists every file with its current SHA-256.
// 3. Rebuilding from source/ reproduces the shipped page and source map.
// 4. The page is a single offline file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const companion = path.resolve(here, '..');
const pkg = path.resolve(companion, '..');
const guideDir = path.join(pkg, 'SAA-C03_One-Guide_Study_Kit_v4');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failures.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); }
}

check('the original guide files match the sizes and SHA-256 hashes in EDITION.json', () => {
  const edition = JSON.parse(fs.readFileSync(path.join(guideDir, 'EDITION.json'), 'utf8'));
  for (const rec of edition.files) {
    const buf = fs.readFileSync(path.join(guideDir, rec.file));
    assert.equal(buf.length, rec.bytes, rec.file);
    assert.equal(sha(buf), rec.sha256, rec.file);
  }
});
check('EDITION.json itself is the frozen release record', () => {
  // SHA-256 of EDITION.json as received in SAA-C03_One-Guide_Study_Kit_v4.zip
  assert.equal(sha(fs.readFileSync(path.join(guideDir, 'EDITION.json'))), '3234c5796056a9b34f8bca19a4ab73287d1f72d945a4c02a717f1459cbdd23ec');
});
check('the guide folder contains only the original five files', () => {
  assert.deepEqual(fs.readdirSync(guideDir).sort(), ['EDITION.json', 'MY_STUDY_LOG.txt', 'SAA-C03_Beginner_Guide_2026-10-06_v4.html', 'SAA-C03_Beginner_Guide_2026-10-06_v4.md', 'START_HERE.txt']);
});
check('MANIFEST.json lists every package file with its current hash', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(pkg, 'MANIFEST.json'), 'utf8'));
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (d.name === 'node_modules' || d.name.startsWith('.')) return [];
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [path.relative(pkg, p).split(path.sep).join('/')];
  });
  const onDisk = walk(pkg).filter((f) => f !== 'MANIFEST.json').sort();
  assert.deepEqual(manifest.files.map((f) => f.file), onDisk);
  for (const f of manifest.files) assert.equal(sha(fs.readFileSync(path.join(pkg, f.file))), f.sha256, f.file);
  assert.equal(manifest.companionTo.guideFilesUnchanged, true);
});
check('rebuilding from source reproduces the shipped page and source map', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'what-survives-'));
  const copy = path.join(tmp, 'What_Survives_companion');
  fs.mkdirSync(copy);
  fs.cpSync(path.join(companion, 'source'), path.join(copy, 'source'), { recursive: true });
  execFileSync(process.execPath, [path.join(copy, 'source', 'build.mjs')], { cwd: copy, stdio: 'ignore' });
  for (const f of ['AWS_What_Survives.html', 'SOURCE_MAP.md']) {
    assert.equal(sha(fs.readFileSync(path.join(copy, f))), sha(fs.readFileSync(path.join(companion, f))), f);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});
check('the companion is one offline file: no external scripts, styles, fonts or images', () => {
  const html = fs.readFileSync(path.join(companion, 'AWS_What_Survives.html'), 'utf8');
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+(stylesheet|preload|icon)/i);
  assert.doesNotMatch(html, /<img[^>]+src=["']?https?:/i);
  assert.doesNotMatch(html, /url\(\s*["']?https?:/i);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/);
});
check('the three representative screenshots are present', () => {
  const shots = fs.readdirSync(path.join(companion, 'screenshots')).filter((f) => f.endsWith('.png'));
  assert.equal(shots.length, 3, shots.join(', '));
  for (const s of shots) assert.equal(fs.readFileSync(path.join(companion, 'screenshots', s)).subarray(1, 4).toString(), 'PNG');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
