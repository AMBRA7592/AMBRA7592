// Browser checks for AWS — What Survives (maintainers only; learners need nothing).
//
//   npm install playwright && npx playwright install chromium   (once)
//   node checks/browser-checks.mjs [--screenshots]               (from What_Survives_companion/)
//
// Opens the built page straight from disk (file://) with every network
// request blocked, then exercises the interface. With --screenshots it also
// writes the three representative screenshots into screenshots/.
// If Playwright is installed elsewhere, set PLAYWRIGHT_PATH to its folder.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pageUrl = pathToFileURL(path.join(root, 'AWS_What_Survives.html')).href;
const guideFile = path.resolve(root, '..', 'SAA-C03_One-Guide_Study_Kit_v4', 'SAA-C03_Beginner_Guide_2026-10-06_v4.html');
const wantShots = process.argv.includes('--screenshots');

let chromium;
try { ({ chromium } = await import('playwright')); }
catch (e) {
  if (!process.env.PLAYWRIGHT_PATH) { console.error('Playwright not found. Install it (npm install playwright) or set PLAYWRIGHT_PATH.'); process.exit(2); }
  ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_PATH, 'package.json'))('.'));
}

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failures.push(name); console.log('  FAIL ' + name + '\n       ' + String(e && e.message || e).split('\n')[0]); }
}

const browser = await chromium.launch();
const network = [];
const errors = [];
async function open(opts = {}) {
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, reducedMotion: opts.reducedMotion || 'no-preference' });
  await context.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('file://')) return route.continue();
    network.push(u);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(pageUrl);
  await page.waitForFunction(() => window.WhatSurvivesApp && window.WhatSurvivesApp.state.run);
  return { page, context };
}
const state = (page) => page.evaluate(() => {
  const a = window.WhatSurvivesApp.state;
  return { study: a.study, mode: a.mode, seg: a.seg, index: a.index, key: a.run && a.run.key, revealed: Object.keys(a.revealed).length, layout: a.layout, playing: a.playing, textView: a.textView, reduced: a.reduced };
});

console.log('Offline operation and rendering');
{
  const { page, context } = await open();
  await check('the page opens from file:// and makes no network requests', async () => {
    await page.waitForTimeout(300);
    assert.equal(network.length, 0, network.join(', '));
    assert.equal(errors.length, 0, errors.join(' | '));
  });
  await check('the page has a title, a language and unique element IDs', async () => {
    assert.equal(await page.title(), 'AWS \u2014 What Survives');
    assert.equal(await page.getAttribute('html', 'lang'), 'en');
    const dupes = await page.evaluate(() => { const seen = {}, d = []; document.querySelectorAll('[id]').forEach((e) => { if (seen[e.id]) d.push(e.id); seen[e.id] = 1; }); return d; });
    assert.deepEqual(dupes, []);
  });
  await check('every frame of every configuration renders in both layouts without gaps', async () => {
    const report = await page.evaluate(() => {
      const M = window.WhatSurvivesModel, V = window.WhatSurvivesView;
      const out = { frames: 0, missing: [], nan: [], empty: [] };
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:0;top:0;width:900px';
      document.body.appendChild(host);
      for (const id of M.studies) {
        const opts = M.options(id);
        const names = Object.keys(opts);
        const combos = names.reduce((acc, n) => acc.flatMap((c) => opts[n].map((v) => Object.assign({}, c, { [n]: v }))), [{}]);
        for (const c of combos) {
          const run = M.buildRun(id, c);
          for (const layout of ['wide', 'narrow']) {
            for (const f of run.frames) {
              const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
              host.appendChild(svg);
              const missing = [];
              V.render(svg, { study: id, run, index: f.index, layout, M, title: 't', missing });
              out.frames++;
              if (missing.length) out.missing.push(run.key + '/' + layout + '/' + f.index + ': ' + missing.join(','));
              if (/NaN|undefined/.test(svg.innerHTML)) out.nan.push(run.key + '/' + layout + '/' + f.index);
              if (svg.querySelectorAll('.comp').length < 3) out.empty.push(run.key + '/' + layout + '/' + f.index);
              host.removeChild(svg);
            }
          }
        }
      }
      host.remove();
      return out;
    });
    assert.ok(report.frames > 300, 'rendered ' + report.frames + ' frames');
    assert.deepEqual(report.missing, []);
    assert.deepEqual(report.nan, []);
    assert.deepEqual(report.empty, []);
  });
  await check('rendering is deterministic: the same frame always produces the same drawing', async () => {
    const same = await page.evaluate(() => {
      const M = window.WhatSurvivesModel, V = window.WhatSurvivesView;
      const run = M.buildRun('payment', { design: 'plain', crash: 'after-charge' });
      const draw = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); document.body.appendChild(s); V.render(s, { study: 'payment', run, index: 7, layout: 'wide', M, title: 't' }); const h = s.outerHTML; s.remove(); return h; };
      return draw() === draw();
    });
    assert.ok(same);
  });
  await context.close();
}

console.log('\nGuided path, rewind and reset');
{
  const { page, context } = await open({ reducedMotion: 'reduce' });
  await check('the whole guided path can be completed with the primary control alone', async () => {
    let n = 0;
    for (; n < 200; n++) {
      const s = await state(page);
      if (s.mode === 'sources') break;
      const id = s.mode === 'transfer' ? '#btn-transfer-next' : s.mode === 'compare' ? '#btn-compare-next' : '#btn-primary';
      await page.click(id);
    }
    assert.ok(n > 40 && n < 120, 'presses: ' + n);
    assert.equal(errors.length, 0, errors.join(' | '));
  });
  await check('a prediction pauses the replay until the learner reveals it', async () => {
    await page.evaluate(() => window.WhatSurvivesApp.switchStudy('photo', false));
    await page.click('#btn-primary');
    assert.equal(await page.isVisible('#predict-card'), true);
    assert.match(await page.textContent('#btn-primary'), /Reveal/);
    await page.click('#btn-play');
    assert.equal((await state(page)).index, 1, 'play does not run past a prediction');
    await page.click('#btn-primary');
    const s = await state(page);
    assert.equal(s.index, 2);
    assert.match(await page.textContent('#event-card'), /not the same as destroyed/);
  });
  await check('changing the storage decision rewinds to before the upload and nothing migrates', async () => {
    await page.evaluate(() => window.WhatSurvivesApp.go(7, false));
    await page.check('#dec-storage-s3');
    const s = await state(page);
    assert.equal(s.index, 0);
    assert.match(s.key, /storage=s3/);
    assert.match(await page.textContent('#event-card'), /Rewound to 09:58:00/);
    assert.equal(await page.locator('#drawing [data-rec]').count(), 0, 'no record exists before the upload');
  });
  await check('changing the payment design rewinds to just before the first charge', async () => {
    await page.evaluate(() => window.WhatSurvivesApp.switchStudy('payment', false));
    await page.evaluate(() => window.WhatSurvivesApp.go(10, false));
    await page.check('#dec-design-idempotent');
    const s = await state(page);
    assert.equal(s.index, 2);
    await page.evaluate(() => window.WhatSurvivesApp.go(7, false));
    assert.match(await page.textContent('#event-card'), /without charging again/);
  });
  await check('comparison shows equivalent events of the previous and the changed run', async () => {
    await page.evaluate(() => window.WhatSurvivesApp.openFreeCompare());
    assert.equal((await state(page)).mode, 'compare');
    const a = await page.textContent('#cmp-a');
    const b = await page.textContent('#cmp-b');
    assert.match(a, /Plain charge/);
    assert.match(b, /idempotency key/);
    assert.ok(await page.locator('#cmp-a tr.is-diff').count() >= 1, 'differences are flagged');
    assert.equal(await page.locator('#cmp-a svg .comp').count() > 3, true);
  });
  await check('reset restores the study’s starting state, design and predictions', async () => {
    await page.evaluate(() => window.WhatSurvivesApp.reset());
    const s = await state(page);
    assert.equal(s.mode, 'run');
    assert.equal(s.seg, 0);
    assert.equal(s.index, 0);
    assert.equal(s.revealed, 0);
    assert.match(s.key, /design=plain/);
    assert.equal(await page.locator('#drawing [data-rec]').count(), 0);
  });
  await context.close();
}

console.log('\nKeyboard, motion and reading modes');
{
  const { page, context } = await open();
  await check('keyboard: arrows step, digits switch study, R resets, K plays', async () => {
    await page.focus('#drawing-wrap');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(50);
    await page.keyboard.press('Escape');
    let s = await state(page);
    assert.equal(s.index, 1);
    await page.keyboard.press('ArrowLeft');
    s = await state(page);
    assert.equal(s.index, 0);
    await page.keyboard.press('2');
    s = await state(page);
    assert.equal(s.study, 'database');
    await page.focus('#drawing-wrap');
    await page.keyboard.press('k');
    assert.equal((await state(page)).playing, true);
    await page.keyboard.press('k');
    assert.equal((await state(page)).playing, false);
    await page.keyboard.press('r');
    s = await state(page);
    assert.equal(s.index, 0);
  });
  await check('every control is a named, focusable element', async () => {
    const bad = await page.evaluate(() => [...document.querySelectorAll('button, a[href], input')].filter((e) => {
      const name = (e.getAttribute('aria-label') || e.textContent || (e.labels && e.labels[0] && e.labels[0].textContent) || '').trim();
      return !name || e.tabIndex < -1;
    }).map((e) => e.outerHTML.slice(0, 80)));
    assert.deepEqual(bad, []);
    const tabs = await page.$$eval('[role=tab]', (t) => t.map((x) => x.getAttribute('aria-selected')));
    assert.deepEqual(tabs.sort(), ['false', 'false', 'true']);
  });
  await check('with motion, a step plays tokens along the event’s paths, then settles', async () => {
    await page.evaluate(() => window.WhatSurvivesApp.switchStudy('photo', false));
    await page.click('#btn-primary');
    await page.waitForTimeout(80);
    assert.ok(await page.locator('#drawing .layer-tokens .token').count() >= 1, 'a token is moving');
    await page.waitForTimeout(3000);
    assert.equal(await page.locator('#drawing .layer-tokens .token').count(), 0);
    assert.equal(await page.locator('#drawing .is-pending').count(), 0);
  });
  await check('reduced motion (toggle): no tokens, the paused image appears at once', async () => {
    await page.click('#btn-motion');
    assert.equal((await state(page)).reduced, true);
    await page.evaluate(() => window.WhatSurvivesApp.go(0, false));
    await page.click('#btn-primary');
    assert.equal(await page.locator('#drawing .layer-tokens .token').count(), 0);
    assert.equal(await page.locator('#drawing .is-waiting, #drawing .is-pending').count(), 0);
    assert.ok(await page.locator('#drawing .cue').count() >= 1, 'the event’s paths stay drawn');
    await page.click('#btn-motion');
  });
  await check('text view describes every component’s records in words', async () => {
    await page.click('#btn-text');
    assert.equal(await page.isVisible('#text-view'), true);
    assert.equal(await page.isVisible('#drawing-wrap'), false);
    const t = await page.textContent('#text-view');
    assert.match(t, /Server A \(i-0a1, AZ a\)/);
    assert.match(t, /photo-17\.jpg/);
    await page.click('#btn-text');
  });
  await check('pause-check answers stay hidden until asked for, then follow the frame', async () => {
    assert.equal(await page.locator('#pause-list dd.is-hidden').count(), 4);
    await page.click('#btn-answers');
    assert.equal(await page.locator('#pause-list dd.is-hidden').count(), 0);
    assert.match(await page.textContent('#pause-list'), /What still exists\?/);
  });
  await check('the operating-system reduced-motion setting is honoured', async () => {
    const { page: p2, context: c2 } = await open({ reducedMotion: 'reduce' });
    assert.equal((await state(p2)).reduced, true);
    await p2.click('#btn-primary');
    assert.equal(await p2.locator('#drawing .layer-tokens .token').count(), 0);
    await c2.close();
  });
  await context.close();
}

console.log('\nGuide links, print and small screens');
{
  const { page, context } = await open();
  const guideHtml = fs.readFileSync(guideFile, 'utf8');
  await check('all chapter links resolve to anchors in the unchanged guide', async () => {
    const hrefs = new Set();
    for (const id of ['photo', 'database', 'payment']) {
      await page.evaluate((s) => window.WhatSurvivesApp.switchStudy(s, false), id);
      (await page.$$eval('a[href*="SAA-C03_Beginner_Guide"]', (a) => a.map((x) => x.getAttribute('href')))).forEach((h) => hrefs.add(h));
    }
    await page.click('#tab-sources');
    (await page.$$eval('a[href*="SAA-C03_Beginner_Guide"]', (a) => a.map((x) => x.getAttribute('href')))).forEach((h) => hrefs.add(h));
    const anchors = [...hrefs].map((h) => h.split('#')[1]).filter(Boolean);
    for (const req of ['w1', 's6-3', 's7-1', 's7-5', 's8-2', 's11-1', 's9-2', 'w21']) assert.ok(anchors.includes(req), 'link to #' + req);
    for (const a of anchors) assert.ok(guideHtml.includes(`id="${a}"`), '#' + a);
    const target = new URL([...hrefs].find((h) => h.endsWith('#w21')), pageUrl).href;
    const g = await context.newPage();
    await g.goto(target);
    assert.equal(await g.locator('#w21').count(), 1);
    await g.close();
  });
  await check('print shows the key states of all three studies and hides the interface', async () => {
    await page.evaluate(() => window.WhatSurvivesApp.buildPrintPack());
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.isVisible('#print-pack'), true);
    assert.equal(await page.isVisible('main'), false);
    assert.equal(await page.locator('#print-pack figure.pp-state').count(), 12);
    assert.ok(await page.locator('#print-pack figure svg .comp').count() > 60);
    await page.emulateMedia({ media: 'screen' });
  });
  await context.close();
  const small = await open({ viewport: { width: 390, height: 844 } });
  await check('on a phone-width screen the drawing rearranges vertically without sideways scrolling', async () => {
    const p = small.page;
    await p.click('#btn-primary');
    await p.waitForTimeout(200);
    assert.equal((await state(p)).layout, 'narrow');
    assert.match(await p.getAttribute('#drawing', 'class'), /ws-narrow/);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, 'horizontal overflow ' + overflow + 'px');
    assert.equal(await p.isVisible('#btn-primary'), true);
  });
  await small.context.close();
}

if (wantShots) {
  console.log('\nScreenshots');
  const { page, context } = await open({ reducedMotion: 'reduce' });
  const shots = path.join(root, 'screenshots');
  fs.mkdirSync(shots, { recursive: true });
  const shoot = async (file) => {
    await page.evaluate(() => { const g = document.querySelector('.stage-grid') || document.querySelector('.compare-view'); window.scrollTo(0, g.getBoundingClientRect().top + window.pageYOffset - 8); });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(shots, file) });
    console.log('  wrote screenshots/' + file);
  };
  // Study 1: the request reaches Server B; the photo is intact on Server A.
  await page.evaluate(() => { const a = window.WhatSurvivesApp; a.switchStudy('photo', false); a.go(2, false); a.state.showAnswers = true; a.go(1, false); a.go(2, false); });
  await shoot('study-1-not-reachable-is-not-destroyed.png');
  // Study 2: after cutover to the copy restored from the 09:00 snapshot.
  await page.evaluate(() => { const a = window.WhatSurvivesApp; a.switchStudy('database', false); a.enterSegment(3); a.go(8, false); });
  await shoot('study-2-restored-earlier-state.png');
  // Study 3: the second charge after redelivery, in the unsafe design.
  await page.evaluate(() => { const a = window.WhatSurvivesApp; a.switchStudy('payment', false); a.go(7, false); });
  await shoot('study-3-second-charge.png');
  await context.close();
}

await browser.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (errors.length) console.log('page errors: ' + errors.join(' | '));
if (failures.length || errors.length) process.exit(1);
