// Write MANIFEST.json and the distribution ZIP.
//
//   node source/package.mjs [output.zip]      (run from What_Survives_companion/)
//
// Refuses to package unless every original guide file still matches the
// size and SHA-256 recorded in the guide's own EDITION.json. The ZIP is
// reproducible: sorted entries, fixed timestamps, no extra fields.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const companion = path.resolve(here, '..');
const pkg = path.resolve(companion, '..');
const pkgName = path.basename(pkg);
const guideDir = path.join(pkg, 'SAA-C03_One-Guide_Study_Kit_v4');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// 1. The original package must be byte-for-byte unchanged.
const edition = JSON.parse(fs.readFileSync(path.join(guideDir, 'EDITION.json'), 'utf8'));
const expected = new Map(edition.files.map((f) => [f.file, f]));
const present = fs.readdirSync(guideDir).sort();
const allowed = [...expected.keys(), 'EDITION.json'].sort();
if (JSON.stringify(present) !== JSON.stringify(allowed)) throw new Error(`guide folder must contain exactly ${allowed.join(', ')}; found ${present.join(', ')}`);
for (const [file, rec] of expected) {
  const buf = fs.readFileSync(path.join(guideDir, file));
  if (buf.length !== rec.bytes || sha(buf) !== rec.sha256) throw new Error(`${file} differs from EDITION.json`);
}

// 2. Inventory of the package.
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (d.name === 'node_modules' || d.name.startsWith('.')) return [];
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}
const files = walk(pkg).map((p) => path.relative(pkg, p).split(path.sep).join('/')).filter((f) => f !== 'MANIFEST.json').sort();
const editionJson = fs.readFileSync(path.join(guideDir, 'EDITION.json'));

const manifest = {
  title: 'AWS — What Survives',
  subtitle: 'Three visual studies of state, failure and recovery.',
  companionVersion: '1.0',
  entryPoint: 'What_Survives_companion/AWS_What_Survives.html',
  companionTo: {
    title: edition.title,
    guideEdition: edition.guideEdition,
    editionRecord: 'SAA-C03_One-Guide_Study_Kit_v4/EDITION.json',
    editionRecordSha256: sha(editionJson),
    guideFilesUnchanged: true
  },
  routePlacement: [
    { study: 1, title: 'The missing photograph', after: 'Day 4', guideAnchors: ['w1', 's6-3', 's7-1', 's7-5'] },
    { study: 2, title: 'The perfectly replicated mistake', after: 'Day 6', guideAnchors: ['s8-2', 's11-1'] },
    { study: 3, title: 'The second payment', after: 'Day 7', guideAnchors: ['s9-2', 'w21'] }
  ],
  teachingCondition: 'Optional companion, not part of the frozen v4 study route. In the beginner pilot its use is an additional teaching condition: record it and do not attribute results from the extended route to the original guide alone.',
  evidenceStatus: 'Model, package and browser checks pass. No learner has used the companion; learning effectiveness and timings are not established.',
  verification: {
    checkedOn: '2026-10-06',
    method: 'Claims checked against the AWS pages in SOURCE_MAP.md, read through a web-search index because the build environment blocked direct requests to docs.aws.amazon.com and aws.amazon.com.'
  },
  requirements: 'A current web browser with JavaScript. No installation, AWS account or network connection.',
  files: files.map((f) => {
    const buf = fs.readFileSync(path.join(pkg, f));
    return { file: f, bytes: buf.length, sha256: sha(buf) };
  })
};
fs.writeFileSync(path.join(pkg, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${pkgName}/MANIFEST.json (${files.length} files listed)`);

// 3. Reproducible ZIP.
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const DOS_DATE = ((2026 - 1980) << 9) | (10 << 5) | 6; // 2026-10-06
const DOS_TIME = 0;
const entries = [...files, 'MANIFEST.json'].sort();
const locals = [];
const central = [];
let offset = 0;
for (const f of entries) {
  const data = fs.readFileSync(path.join(pkg, f));
  const name = Buffer.from(`${pkgName}/${f}`, 'utf8');
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const stored = deflated.length >= data.length;
  const body = stored ? data : deflated;
  const crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(0x0800, 6);
  head.writeUInt16LE(stored ? 0 : 8, 8);
  head.writeUInt16LE(DOS_TIME, 10);
  head.writeUInt16LE(DOS_DATE, 12);
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(body.length, 18);
  head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(name.length, 26);
  head.writeUInt16LE(0, 28);
  locals.push(head, name, body);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(0x0314, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0x0800, 8);
  cd.writeUInt16LE(stored ? 0 : 8, 10);
  cd.writeUInt16LE(DOS_TIME, 12);
  cd.writeUInt16LE(DOS_DATE, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(body.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(name.length, 28);
  cd.writeUInt16LE(0, 30);
  cd.writeUInt16LE(0, 32);
  cd.writeUInt16LE(0, 34);
  cd.writeUInt16LE(0, 36);
  cd.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  cd.writeUInt32LE(offset, 42);
  central.push(cd, name);
  offset += head.length + name.length + body.length;
}
const cdBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(cdBuf.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);
const zip = Buffer.concat([...locals, cdBuf, end]);
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(path.dirname(pkg), `${pkgName}.zip`);
fs.writeFileSync(out, zip);
console.log(`wrote ${out} (${entries.length} files, ${zip.length} bytes, sha256 ${sha(zip)})`);
