// Model checks for AWS — What Survives.
//
//   node checks/model-checks.mjs        (run from What_Survives_companion/)
//
// Loads the model, teaching data and layouts from the BUILT page
// (AWS_What_Survives.html), so the checks test exactly what learners open,
// and confirms the inlined code matches source/. No dependencies.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const html = fs.readFileSync(path.join(root, 'AWS_What_Survives.html'), 'utf8');
const guidePath = path.resolve(root, '..', 'SAA-C03_One-Guide_Study_Kit_v4', 'SAA-C03_Beginner_Guide_2026-10-06_v4.html');
const guideMdPath = guidePath.replace(/\.html$/, '.md');

function inlined(id) {
  const m = html.match(new RegExp(`<script id="${id}">\\n([\\s\\S]*?)\\n</script>`));
  if (!m) throw new Error(`script ${id} not found in the built page`);
  return m[1];
}
const sources = { 'ws-model': 'model.js', 'ws-teaching': 'teaching.js', 'ws-view': 'view.js', 'ws-app': 'app.js' };
const ctx = {};
vm.createContext(ctx);
vm.runInContext(inlined('ws-model'), ctx);
vm.runInContext(inlined('ws-teaching'), ctx);
vm.runInContext(inlined('ws-view'), ctx); // top level only defines functions and layouts
const M = ctx.WhatSurvivesModel;
const T = ctx.WhatSurvivesTeaching;
const V = ctx.WhatSurvivesView;

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failures.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message ? e.message.split('\n')[0] : e)); }
}
const run = (study, config) => M.buildRun(study, config);
const at = (r, key) => { const i = r.events.findIndex((e) => e.key === key); assert.ok(i >= 0, `event ${key} missing`); return r.frames[i + 1]; };
const last = (r) => r.frames[r.frames.length - 1];
const json = (x) => JSON.stringify(x);
// Values created inside the vm context have their own Array/Object
// prototypes, so compare by value rather than with deepStrictEqual.
const eq = (actual, expected, msg) => assert.equal(json(actual), json(expected), msg);

console.log('Build integrity');
check('the page inlines exactly the code in source/', () => {
  for (const [id, file] of Object.entries(sources)) {
    const src = fs.readFileSync(path.join(root, 'source', file), 'utf8').trimEnd();
    assert.equal(inlined(id), src, `${file} differs from the inlined copy; rebuild with node source/build.mjs`);
  }
});
check('the page references no external scripts, styles or fonts', () => {
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel=["']?stylesheet/i);
  assert.doesNotMatch(html, /@import|url\(\s*["']?https?:/i);
});

/* ------------------------------------------------------------------ */
console.log('\nStudy 1 · The missing photograph');
const local = run('photo', { storage: 'local', sticky: false });
const s3 = run('photo', { storage: 's3', sticky: false });
const sticky = run('photo', { storage: 'local', sticky: true });

check('the upload is stored only on Server A’s instance store and acknowledged', () => {
  const f = at(local, 'upload');
  assert.ok(f.state.instances['i-0a1'].files['photo-17.jpg']);
  eq(Object.keys(f.state.instances['i-0b1'].files), []);
  eq(Object.keys(f.state.bucket.objects), []);
  assert.equal(f.state.request.status, 201);
  assert.ok(f.state.accepted, 'the business action (accepted upload) is recorded');
});
check('an inaccessible local file is not shown as deleted (request reaches Server B)', () => {
  const f = at(local, 'view-1');
  assert.equal(f.state.request.server, 'i-0b1');
  assert.equal(f.state.request.status, 404);
  assert.ok(f.state.instances['i-0a1'].files['photo-17.jpg'], 'photo-17 still exists on Server A');
  assert.equal(f.state.erased.length, 0, 'nothing is erased');
  assert.ok(f.cues.some((c) => c.type === 'blocked' && c.route[0] === 'i-0b1' && c.route[1] === 'i-0a1'), 'the unavailable path B → A is shown');
  assert.ok(f.changes.every((ch) => ch.kind !== 'destroyed' && ch.kind !== 'deleted'));
  const pc = M.pauseCheck('photo', local, f.index);
  assert.match(pc.exists, /^Yes/);
  assert.match(pc.reach, /^No\./);
  assert.match(pc.reach, /not deleted/);
});
check('a later request that reaches Server A still finds the photo', () => {
  const f = at(local, 'view-2');
  assert.equal(f.state.request.server, 'i-0a1');
  assert.equal(f.state.request.status, 200);
});
check('while Server A is impaired the photo is unreachable but not yet destroyed', () => {
  const f = at(local, 'fail');
  assert.equal(f.state.instances['i-0a1'].status, 'impaired');
  assert.ok(f.state.instances['i-0a1'].files['photo-17.jpg']);
  assert.equal(f.state.erased.length, 0);
});
check('replacing compute does not silently recreate local data', () => {
  const rep = at(local, 'replace');
  assert.equal(rep.state.instances['i-0a1'].status, 'terminated');
  eq(Object.keys(rep.state.instances['i-0a1'].files), []);
  assert.equal(rep.state.erased.length, 1);
  assert.equal(rep.state.erased[0].id, 'photo-17');
  assert.equal(rep.state.instances['i-0a2'].status, 'launching');
  eq(Object.keys(rep.state.instances['i-0a2'].files), [], 'the replacement starts without the photo');
  const ready = at(local, 'ready');
  assert.equal(ready.state.instances['i-0a2'].status, 'running');
  assert.equal(ready.state.alb.targets['i-0a2'], 'healthy');
  eq(Object.keys(ready.state.instances['i-0a2'].files), []);
  const end = at(local, 'view-3');
  assert.equal(end.state.request.server, 'i-0a2');
  assert.equal(end.state.request.status, 404);
  assert.equal(M.photo.copies(end.state, local.config).length, 0, 'no copy exists anywhere');
});
check('the local design never writes to S3 and the S3 design never writes to local disks', () => {
  for (const f of local.frames) eq(Object.keys(f.state.bucket.objects), []);
  for (const f of s3.frames) for (const id of Object.keys(f.state.instances)) eq(Object.keys(f.state.instances[id].files), []);
});
check('with S3 both instances, and the replacement, retrieve the same object', () => {
  assert.equal(at(s3, 'view-1').state.request.server, 'i-0b1');
  assert.equal(at(s3, 'view-1').state.request.status, 200);
  assert.equal(at(s3, 'view-2').state.request.status, 200);
  const end = at(s3, 'view-3');
  assert.equal(end.state.request.server, 'i-0a2');
  assert.equal(end.state.request.status, 200);
  assert.ok(end.state.bucket.objects['photos/photo-17.jpg']);
  assert.equal(end.state.erased.length, 0);
});
check('changing the storage design rewinds to before the upload; nothing migrates', () => {
  const k = M.firstDivergence(local, s3);
  assert.equal(k, 0);
  assert.equal(s3.events[k].key, 'upload');
  eq(Object.keys(s3.frames[k].state.bucket.objects), []);
  eq(Object.keys(s3.frames[k].state.instances['i-0a1'].files), []);
});
check('stickiness hides the cross-server symptom while A is healthy, but not A’s loss', () => {
  assert.equal(at(sticky, 'upload').state.browser.cookie, 'i-0a1');
  const v1 = at(sticky, 'view-1');
  assert.equal(v1.state.request.server, 'i-0a1');
  assert.equal(v1.state.request.status, 200);
  const end = at(sticky, 'view-3');
  assert.equal(end.state.request.why, 'sticky-reselect');
  assert.equal(end.state.request.server, 'i-0a2');
  assert.equal(end.state.request.status, 404);
  assert.equal(end.state.browser.cookie, 'i-0a2', 'the cookie is updated to the new target');
  assert.equal(M.photo.copies(end.state, sticky.config).length, 0);
});

/* ------------------------------------------------------------------ */
console.log('\nStudy 2 · The perfectly replicated mistake');
const A = run('database', { incident: 'writer-failure' });
const BF = run('database', { incident: 'mistaken-delete', recovery: 'failover' });
const BR = run('database', { incident: 'mistaken-delete', recovery: 'restore' });
const rows = (s, id) => Object.keys(s.db[id].rows).sort();

check('a committed order is written to the primary and the synchronous standby', () => {
  const f = at(A, 'order-44');
  assert.ok(f.state.db['db-a'].rows['order-44'] && f.state.db['db-b'].rows['order-44']);
  const types = f.cues.map((c) => c.type);
  assert.ok(types.indexOf('replication') > types.indexOf('request'), 'replication follows the request');
  assert.ok(f.cues.findIndex((c) => c.type === 'ack' && c.label === 'standby ack') < f.cues.findIndex((c) => c.label === 'COMMIT'), 'standby acknowledges before the commit');
  assert.ok(!f.state.snapshot.rows['order-44'], 'the earlier snapshot does not contain it');
});
check('writer failure: interruption, managed failover, reconnection, committed data restored', () => {
  const inc = at(A, 'incident');
  assert.equal(inc.state.db['db-a'].status, 'failed');
  assert.equal(inc.state.app.connection, 'broken');
  assert.ok(inc.state.db['db-b'].rows['order-44']);
  const fo = at(A, 'recover-1');
  assert.equal(fo.state.db['db-b'].role, 'primary');
  assert.equal(fo.state.dns['orders-db'], 'db-b');
  assert.equal(fo.state.app.connection, 'broken', 'clients must reconnect');
  assert.equal(at(A, 'recover-2').state.app.connection, 'open');
  eq(at(A, 'check-1').state.customer.page.orders, ['order-42', 'order-44']);
  assert.equal(at(A, 'check-1').state.app.endpoint, 'orders-db', 'the application configuration does not change');
});
check('no failover duration is promised', () => {
  for (const r of [A, BF, BR]) for (const f of r.frames) if (f.event) assert.doesNotMatch(f.text, /\b\d+\s*(?:–|-|to)?\s*\d*\s*(seconds?|minutes?|s)\b(?!.*illustrative)/i);
});
check('the mistaken deletion reaches the live standby; both copies stay healthy', () => {
  const f = at(BF, 'incident');
  for (const id of ['db-a', 'db-b']) {
    assert.ok(!f.state.db[id].rows['order-42'] && !f.state.db[id].rows['order-44'], id + ' lost the rows');
    assert.ok(f.state.db[id].deleted['order-42'] && f.state.db[id].deleted['order-44']);
    assert.equal(f.state.db[id].status, 'available');
  }
  assert.ok(f.cues.some((c) => c.type === 'replication'));
  assert.ok(f.state.snapshot.rows['order-42'], 'the snapshot still holds order-42');
  eq(at(BF, 'check-1').state.customer.page.orders, []);
});
check('failing over to the standby does not bring the rows back', () => {
  const f = at(BF, 'recover-1');
  assert.equal(f.state.dns['orders-db'], 'db-b');
  eq(rows(f.state, 'db-b'), rows(f.state, 'db-a'));
  eq(at(BF, 'check-2').state.customer.page.orders, []);
});
check('snapshot restoration creates a separate database with the snapshot’s contents', () => {
  const start = at(BR, 'recover-1');
  assert.equal(start.state.db['db-r'].status, 'creating');
  eq(rows(start.state, 'db-r'), []);
  const ready = at(BR, 'recover-2');
  assert.equal(ready.state.db['db-r'].status, 'available');
  eq(ready.state.db['db-r'].rows, ready.state.snapshot.rows);
  assert.equal(ready.state.dns['orders-db'], 'db-a', 'the original endpoint is untouched');
  assert.notEqual(ready.state.dns['orders-db-restored'], null, 'the restored instance has its own endpoint');
  assert.ok(ready.state.db['db-a'].rows['order-45'], 'the original database is not overwritten');
});
check('restoration and application cutover are separate steps', () => {
  assert.equal(at(BR, 'recover-2').state.app.endpoint, 'orders-db');
  eq(at(BR, 'check-1').state.customer.page.orders, [], 'before cutover customers still see the wrong data');
  assert.equal(at(BR, 'cutover').state.app.endpoint, 'orders-db-restored');
  assert.ok(BR.events.findIndex((e) => e.key === 'cutover') > BR.events.findIndex((e) => e.key === 'recover-2'));
});
check('legitimate changes after the snapshot are absent from the restored copy', () => {
  const end = last(BR);
  eq(end.state.customer.page.orders, ['order-42']);
  assert.ok(!end.state.db['db-r'].rows['order-44'], 'order-44 (09:10) is absent');
  assert.ok(!end.state.db['db-r'].rows['order-45'], 'order-45 (09:40) is absent');
  assert.ok(end.state.db['db-a'].rows['order-45'], 'order-45 survives only in the original database');
  assert.ok(end.state.confirmed.some((x) => x.order === 'order-44') && end.state.confirmed.some((x) => x.order === 'order-45'));
});
check('the standby is never read before promotion', () => {
  for (const r of [A, BF, BR]) for (const f of r.frames) for (const c of f.cues) {
    if (c.type !== 'request' || !/^SELECT/.test(c.label)) continue;
    const target = c.route[c.route.length - 1];
    const prev = r.frames[f.index - 1].state;
    assert.ok(target === 'db-r' || prev.db[target].role === 'primary', `${r.key} reads ${target}`);
  }
});
check('both incidents share the same initial data and workload', () => {
  assert.equal(json(A.frames[0].state), json(BF.frames[0].state));
  for (const key of ['order-44', 'check-1', 'order-45', 'check-2']) {
    assert.equal(json(A.events.find((e) => e.key === key)), json(BF.events.find((e) => e.key === key)));
    assert.equal(json(BF.events.find((e) => e.key === key)), json(BR.events.find((e) => e.key === key)));
  }
  assert.equal(M.firstDivergence(A, BF), 1, 'changing the incident rewinds to just before 09:30');
  assert.equal(M.firstDivergence(BF, BR), 2, 'changing the recovery rewinds to just after the DELETE');
});

/* ------------------------------------------------------------------ */
console.log('\nStudy 3 · The second payment');
const plain = run('payment', { design: 'plain', crash: 'after-charge' });
const idem = run('payment', { design: 'idempotent', crash: 'after-charge' });
const naive = run('payment', { design: 'checked', crash: 'after-charge' });
const charges = (s, p) => s.processor.charges.filter((x) => x.payment === p).length;

check('receiving a message does not delete it', () => {
  const f = at(plain, 'receive-1');
  const m = f.state.queue.messages['m-42'];
  assert.equal(m.state, 'in-flight');
  assert.equal(m.receiveCount, 1);
  assert.equal(m.hiddenUntil, '12:00:31', 'hidden for the 30-second visibility timeout');
  assert.equal(m.receipt, 'rh-1');
});
check('the charge is a completed business effect before the message is deleted', () => {
  const f = at(plain, 'charge-1');
  assert.equal(charges(f.state, 'payment-42'), 1);
  assert.equal(f.state.queue.messages['m-42'].state, 'in-flight');
});
check('a crash after charging leaves the message to reappear after its visibility timeout', () => {
  const crash = at(plain, 'crash');
  assert.equal(crash.state.workers.W1.status, 'crashed');
  assert.equal(crash.state.workers.W1.receipt, null, 'the receipt handle is lost with the worker');
  assert.equal(crash.state.queue.messages['m-42'].state, 'in-flight');
  assert.equal(at(plain, 'expire').state.queue.messages['m-42'].state, 'visible');
  const r2 = at(plain, 'receive-2').state.queue.messages['m-42'];
  assert.equal(r2.receiveCount, 2);
  assert.equal(r2.receipt, 'rh-2', 'a new receipt handle');
});
check('a crash after charging produces a repeated charge in the unsafe version', () => {
  const f = at(plain, 'charge-2');
  assert.equal(charges(f.state, 'payment-42'), 2);
  assert.ok(f.state.processor.charges[1].duplicate);
  assert.equal(charges(last(plain).state, 'payment-42'), 2);
});
check('a naive check-charge-mark sequence still charges twice in the same crash window', () => {
  assert.equal(charges(last(naive).state, 'payment-42'), 2);
  assert.ok(naive.events.some((e) => e.key === 'mark-2'));
});
check('the idempotent version preserves one charge for the same payment ID', () => {
  const f = at(idem, 'charge-2');
  assert.equal(f.state.last.result, 'existing');
  assert.equal(f.state.last.charge, 'ch-1');
  assert.equal(charges(f.state, 'payment-42'), 1);
  assert.equal(f.state.attempts['payment-42'], 2, 'two processing attempts, one completed charge');
  assert.equal(f.state.processor.keys['payment-42'], 'ch-1');
});
check('the idempotent version still executes a different payment', () => {
  const end = last(idem);
  assert.equal(charges(end.state, 'payment-43'), 1);
  assert.equal(end.state.processor.keys['payment-43'], 'ch-2');
  assert.equal(end.state.processor.charges.length, 2);
  const m43 = end.state.queue.messages['m-43'];
  assert.equal(m43.customer, 'cust-7');
  assert.equal(m43.amount, end.state.queue.messages['m-42'].amount, 'same customer and amount, different payment ID');
});
check('the idempotency key and charge outcome are recorded in one step at the processor', () => {
  const f = at(idem, 'charge-1');
  const prev = idem.frames[f.index - 1].state;
  assert.equal(Object.keys(prev.processor.keys).length, 0);
  assert.equal(charges(f.state, 'payment-42'), 1);
  assert.equal(f.state.processor.keys['payment-42'], f.state.processor.charges[0].id);
});
check('processing attempts and completed charges are counted separately', () => {
  const facts = M.facts('payment', idem, idem.frames.length - 1);
  const get = (name) => facts.find((x) => x[0] === name)[1];
  assert.equal(get('Processing attempts for payment-42'), '2');
  assert.equal(get('Completed charges for payment-42'), '1');
});
check('the other two failure boundaries charge exactly once in every design', () => {
  for (const design of ['plain', 'checked', 'idempotent']) {
    const before = run('payment', { design, crash: 'before-charge' });
    assert.equal(charges(last(before).state, 'payment-42'), 1, design + ' / before the charge');
    assert.equal(last(before).state.attempts['payment-42'], 2);
    const after = run('payment', { design, crash: 'after-delete' });
    assert.equal(charges(last(after).state, 'payment-42'), 1, design + ' / after deletion');
    assert.equal(last(after).state.attempts['payment-42'], 1);
    assert.ok(!after.events.some((e) => e.key === 'expire'), 'a deleted message is not redelivered');
  }
});
check('changing the payment design rewinds to just before the first charge', () => {
  const k = M.firstDivergence(plain, idem);
  assert.equal(k, 2);
  assert.equal(idem.events[k].key, 'charge-1');
  assert.equal(M.firstDivergence(plain, naive), 2);
});

/* ------------------------------------------------------------------ */
console.log('\nDeterminism, rewind and reset');
const ALL = [];
for (const id of M.studies) {
  const opts = M.options(id);
  const names = Object.keys(opts);
  const combos = names.reduce((acc, n) => acc.flatMap((c) => opts[n].map((v) => ({ ...c, [n]: v }))), [{}]);
  for (const c of combos) ALL.push(run(id, c));
}
check('every configuration of every study builds and replays identically', () => {
  for (const r of ALL) assert.equal(json(M.buildRun(r.study, r.config).frames), json(r.frames), r.key);
});
check('derived views (pause checks, facts) never change a frame', () => {
  for (const r of ALL) {
    const before = json(r.frames);
    r.frames.forEach((f) => { M.pauseCheck(r.study, r, f.index); M.facts(r.study, r, f.index); });
    assert.equal(json(r.frames), before, r.key);
  }
});
check('within a study every configuration starts from the same state', () => {
  for (const id of M.studies) {
    const starts = new Set(ALL.filter((r) => r.study === id).map((r) => json(r.frames[0].state)));
    assert.equal(starts.size, 1, id);
  }
});
check('frames before a rewind point are identical in the old and new run', () => {
  for (const a of ALL) for (const b of ALL) {
    if (a.study !== b.study || a === b) continue;
    const k = M.firstDivergence(a, b);
    for (let i = 0; i <= k; i++) assert.equal(json(a.frames[i].state), json(b.frames[i].state), `${a.key} → ${b.key} at ${i}`);
    if (k < Math.min(a.events.length, b.events.length)) {
      const fa = a.frames[k + 1], fb = b.frames[k + 1];
      assert.notEqual(json([fa.event, fa.state, fa.cues, fa.text]), json([fb.event, fb.state, fb.cues, fb.text]), `${a.key} → ${b.key}: event ${k + 1} should differ`);
    }
  }
});
check('replaying forward from a rewind point reproduces a fresh run', () => {
  for (const r of ALL) {
    const fresh = M.buildRun(r.study, r.config);
    for (let k = 0; k < r.frames.length; k++) assert.equal(json(r.frames.slice(k)), json(fresh.frames.slice(k)));
  }
});
check('reset returns to the first guided configuration and its starting frame', () => {
  for (const id of M.studies) {
    const first = T.studies[id].script[0];
    assert.equal(M.configKey(id, first.config), M.configKey(id, M.defaultConfig(id)), id + ': the default design is the first guided run');
  }
});
check('the illustrative clock never runs backwards', () => {
  for (const r of ALL) for (let i = 1; i < r.events.length; i++) assert.ok(r.events[i].t >= r.events[i - 1].t, `${r.key}: ${r.events[i].key}`);
});
check('every request, replication, acknowledgement and blocked path has a drawn route in both layouts', () => {
  for (const r of ALL) for (const f of r.frames) for (const c of f.cues) {
    for (const name of ['wide', 'narrow']) {
      const L = V.layouts[r.study][name];
      if (c.type === 'control' || c.type === 'health') { assert.ok(L.comps[c.route[c.route.length - 1]], `${name}: tag target ${c.route}`); continue; }
      for (let i = 0; i < c.route.length - 1; i++) assert.ok(V.linkPoints(L, c.route[i], c.route[i + 1]), `${name}: ${r.key} ${c.route[i]}>${c.route[i + 1]}`);
    }
  }
});

/* ------------------------------------------------------------------ */
console.log('\nTeaching data');
const guideHtml = fs.readFileSync(guidePath, 'utf8');
check('every guide link points to an anchor that exists in the guide’s HTML reader', () => {
  const anchors = new Set();
  for (const id of M.studies) {
    T.studies[id].guide.forEach((g) => anchors.add(g[0]));
    T.sources[id].forEach((c) => c.guide.forEach((g) => anchors.add(g[0])));
  }
  for (const a of ['w1', 's6-3', 's7-1', 's7-5', 's8-2', 's11-1', 's9-2', 'w21']) assert.ok(anchors.has(a), 'required link ' + a);
  for (const a of anchors) assert.ok(guideHtml.includes(`id="${a}"`), 'missing anchor #' + a);
  assert.match(T.guideHref, /^\.\.\/SAA-C03_One-Guide_Study_Kit_v4\/SAA-C03_Beginner_Guide_2026-10-06_v4\.html$/);
});
check('scripts reference valid configurations, frames and segments', () => {
  for (const id of M.studies) {
    const sc = T.studies[id].script;
    const ids = new Set(sc.map((s) => s.id));
    for (const s of sc) {
      if (s.config) {
        const r = run(id, s.config);
        for (const k of Object.keys(s.predict || {})) assert.ok(Number(k) >= 0 && Number(k) < r.frames.length - 1, `${id}/${s.id}: prediction at ${k}`);
        if (s.rewindFrom) assert.ok(ids.has(s.rewindFrom));
      }
      if (s.compare) for (const ref of s.compare) if (typeof ref === 'string') assert.ok(ids.has(ref));
      if (s.next) assert.ok(ids.has(s.next.to));
    }
    assert.equal(sc[sc.length - 1].stage, 'Transfer');
  }
});
check('each guided study follows observe → predict → reveal → rewind → change → compare → transfer', () => {
  for (const id of M.studies) {
    const sc = T.studies[id].script;
    assert.ok(sc.some((s) => s.predict && Object.keys(s.predict).length), id + ' has predictions');
    assert.ok(sc.some((s) => s.rewindFrom), id + ' rewinds');
    assert.ok(sc.some((s) => s.compare), id + ' compares');
    assert.ok(sc.some((s) => s.stage === 'Transfer'));
    const t = T.studies[id].transfer;
    assert.ok(t.question.length > 80 && t.answer.length >= 2);
  }
});
check('transfer questions do not reproduce Appendix C questions', () => {
  const md = fs.readFileSync(guideMdPath, 'utf8');
  const c = md.slice(md.indexOf('# Appendix C.'), md.indexOf('# Appendix D.'));
  const words = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  const cw = words(c);
  const grams = new Set();
  for (let i = 0; i + 7 <= cw.length; i++) grams.add(cw.slice(i, i + 7).join(' '));
  for (const id of M.studies) {
    const q = words(T.studies[id].transfer.question + ' ' + T.studies[id].transfer.answer.join(' '));
    for (let i = 0; i + 7 <= q.length; i++) assert.ok(!grams.has(q.slice(i, i + 7).join(' ')), `${id}: shares the 7-word sequence “${q.slice(i, i + 7).join(' ')}”`);
  }
});
check('every teaching claim cites AWS documentation and a verification date', () => {
  for (const id of M.studies) for (const c of T.sources[id]) {
    assert.ok(c.aws.length >= 1, c.claim);
    for (const [, url] of c.aws) assert.match(url, /^https:\/\/(docs\.aws\.amazon\.com|aws\.amazon\.com)\//);
    assert.match(T.checked, /^\d{4}-\d{2}-\d{2}$/);
  }
});
check('assumptions state that timings are illustrative and dependencies are assumed', () => {
  for (const id of M.studies) {
    const a = T.studies[id].assumptions.join(' ');
    assert.match(a, /illustrative/i);
  }
  assert.match(T.studies.photo.assumptions.join(' '), /IAM role/);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
