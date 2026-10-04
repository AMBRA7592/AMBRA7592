// Bundles the experience into one self-contained HTML file:
//   dist/the-second-form.html  (full document, opens from disk)
//   dist/artifact.html         (same page without the document skeleton)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const MODULES = [
  ['geometry', 'src/geometry.js'],
  ['scene', 'src/scene.js'],
  ['film', 'src/film.js'],
  ['renderer', 'web/renderer.js'],
  ['app', 'web/app.js'],
];

function transform(name, code) {
  const exported = [];
  code = code.replace(/^import\s*\{([^}]+)\}\s*from\s*'([^']+)';[ \t]*$/gm, (m, names, from) =>
    `const {${names.replace(/\s+/g, ' ')}} = __m[${JSON.stringify(path.basename(from, '.js'))}];`);
  code = code.replace(/^export\s+(async\s+)?function\s+([A-Za-z0-9_$]+)/gm, (m, a, n) => { exported.push(n); return `${a || ''}function ${n}`; });
  code = code.replace(/^export\s+(const|let|var|class)\s+([A-Za-z0-9_$]+)/gm, (m, k, n) => { exported.push(n); return `${k} ${n}`; });
  if (/^\s*(import|export)\s/m.test(code)) throw new Error(`${name}: unhandled import/export`);
  return `__m[${JSON.stringify(name)}] = (() => {\n${code}\nreturn { ${exported.join(', ')} };\n})();\n`;
}

let js = '"use strict";\n(() => {\nconst __m = {};\n';
js += `const OPTICS_GLSL = ${JSON.stringify(read('src/optics.glsl'))};\n`;
js += `const TONEMAP_GLSL = ${JSON.stringify(read('src/tonemap.glsl'))};\n`;
for (const [name, file] of MODULES) js += `// ---- ${file}\n` + transform(name, read(file));
js += '})();\n';
if (js.includes('</script')) throw new Error('script contains a closing tag');

const body = read('web/template.html').replace('<!--SCRIPT-->', `<script>\n${js}</script>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n` +
  body.replace(/(<title>[\s\S]*?<\/style>)/, '$1\n</head>\n<body>') + '\n</body>\n</html>\n';
fs.writeFileSync(path.join(root, 'dist/the-second-form.html'), full);
fs.writeFileSync(path.join(root, 'dist/artifact.html'), body);
console.log(`dist/the-second-form.html ${(full.length / 1024).toFixed(1)} KB`);
