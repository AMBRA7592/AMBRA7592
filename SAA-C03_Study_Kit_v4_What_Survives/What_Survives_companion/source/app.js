/*
 * AWS — What Survives · interface controller
 *
 * Holds only interface state (which study, which run, which frame, what has
 * been revealed). Every run is rebuilt from the model; rewind, reset and
 * comparison select frames of recomputed runs and never undo anything.
 */
(function () {
  'use strict';

  var M = window.WhatSurvivesModel;
  var V = window.WhatSurvivesView;
  var T = window.WhatSurvivesTeaching;
  var STUDIES = ['photo', 'database', 'payment'];
  var $ = function (id) { return document.getElementById(id); };
  var keys = Object.keys;

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  var reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  var app = {
    study: 'photo',
    mode: 'run',          // run | compare | transfer | sources
    seg: 0,               // index in the study script, or -1 while exploring freely
    config: null,
    run: null,
    index: 0,
    revealed: {},
    prevConfig: null,
    compare: null,
    rewind: null,         // notice shown after a rewind
    playing: false,
    playTimer: null,
    anim: null,
    textView: false,
    reduced: !!reduceQuery.matches,
    showAnswers: false,
    layout: 'wide',
    memory: {}
  };

  var runCache = {};
  function getRun(study, config) {
    var key = study + ':' + M.configKey(study, config);
    if (!runCache[key]) runCache[key] = M.buildRun(study, config);
    return runCache[key];
  }

  function script() { return T.studies[app.study].script; }
  function seg() { return app.seg >= 0 ? script()[app.seg] : null; }
  function segById(id) {
    var s = script();
    for (var i = 0; i < s.length; i++) if (s[i].id === id) return i;
    return -1;
  }
  function segConfig(ref) {
    if (typeof ref === 'string') return script()[segById(ref)].config;
    return ref;
  }

  /* ------------------------------------------------------------------ */
  /* Navigation                                                          */
  /* ------------------------------------------------------------------ */

  function enterSegment(i) {
    stopPlay();
    finishAnim();
    var sg = script()[i];
    app.seg = i;
    app.rewind = null;
    if (sg.compare) {
      app.mode = 'compare';
      var a = getRun(app.study, segConfig(sg.compare[0]));
      var b = getRun(app.study, segConfig(sg.compare[1]));
      app.compare = { a: a, b: b, key: sg.focus || b.events[0].key };
      app.config = b.config;
      app.run = b;
    } else if (sg.stage === 'Transfer') {
      app.mode = 'transfer';
    } else {
      app.mode = 'run';
      var run = getRun(app.study, sg.config);
      var start = 0;
      if (sg.rewindFrom) {
        var from = getRun(app.study, segConfig(sg.rewindFrom));
        start = M.firstDivergence(from, run);
        app.prevConfig = from.config;
        app.rewind = rewindNotice(from, run, start, true);
      } else {
        app.prevConfig = null;
      }
      app.config = run.config;
      app.run = run;
      app.index = start;
    }
    renderAll(false);
    ensureStageVisible();
  }

  function rewindNotice(from, to, start, guided) {
    var next = to.events[start];
    return {
      time: to.frames[start].state.clock,
      eventLabel: next ? next.label : null,
      eventTime: next ? next.t : null,
      from: from.label,
      to: to.label,
      guided: guided,
      none: false
    };
  }

  function go(index, animate) {
    finishAnim();
    var max = app.run.frames.length - 1;
    index = Math.max(0, Math.min(max, index));
    var forward = index === app.index + 1;
    if (index !== app.index) app.rewind = null;
    // Skipping past a prediction counts as choosing not to pause there.
    var sg = seg();
    if (sg && sg.predict) for (var k = app.index; k < index; k++) if (sg.predict[k]) app.revealed[predKey(k)] = true;
    app.index = index;
    renderAll(animate && forward && !app.reduced && !app.textView);
    ensureStageVisible();
  }

  // While stepping, keep the drawing and the explanation beside it on screen
  // (the sticky control bar covers the bottom edge of the viewport).
  function ensureStageVisible() {
    if (!app.booted || app.mode !== 'run') return;
    var grid = document.querySelector('.stage-grid');
    var wrap = app.textView ? $('text-view') : $('drawing-wrap');
    if (!grid || !wrap) return;
    var bar = document.querySelector('.run-view > .control-bar');
    var barH = bar ? bar.getBoundingClientRect().height + 12 : 0;
    var r = wrap.getBoundingClientRect();
    var room = window.innerHeight - barH;
    if (r.top >= 0 && r.bottom <= room) return;
    var top = grid.getBoundingClientRect().top + window.pageYOffset - 8;
    window.scrollTo({ top: Math.max(0, top), behavior: app.reduced ? 'auto' : 'smooth' });
  }

  function predKey(k) { return app.study + ':' + (seg() ? seg().id : 'free') + ':' + k; }
  function pendingPrediction() {
    var sg = seg();
    if (app.mode !== 'run' || !sg || !sg.predict) return null;
    var q = sg.predict[app.index];
    if (!q || app.revealed[predKey(app.index)]) return null;
    if (app.index >= app.run.frames.length - 1) return null;
    return q;
  }

  function primary() {
    if (app.anim && !app.anim.isDone()) { finishAnim(); return; }
    if (app.mode === 'run') {
      if (pendingPrediction()) {
        app.revealed[predKey(app.index)] = true;
        go(app.index + 1, true);
        return;
      }
      if (app.index < app.run.frames.length - 1) { go(app.index + 1, true); return; }
      var sg = seg();
      if (sg && sg.next) { enterSegment(segById(sg.next.to)); return; }
      if (!sg && app.prevConfig) { openFreeCompare(); return; }
      return;
    }
    if (app.mode === 'compare') {
      var sc = seg();
      if (sc && sc.next) enterSegment(segById(sc.next.to));
      else backToRun();
      return;
    }
    if (app.mode === 'transfer') { nextStudy(); return; }
  }

  function primaryLabel() {
    if (app.mode === 'run') {
      if (pendingPrediction()) return 'Reveal';
      if (app.index < app.run.frames.length - 1) return 'Next event';
      var sg = seg();
      if (sg && sg.next) return sg.next.label;
      if (!sg && app.prevConfig) return 'Compare with the previous design';
      return 'End of this run';
    }
    if (app.mode === 'compare') {
      var sc = seg();
      return sc && sc.next ? sc.next.label : 'Back to the replay';
    }
    if (app.mode === 'transfer') return STUDIES.indexOf(app.study) < 2 ? 'Next study' : 'Sources and assumptions';
    return 'Next';
  }

  function prev() {
    if (app.mode !== 'run') { backToRun(); return; }
    if (app.index > 0) go(app.index - 1, false);
  }

  function reset() {
    stopPlay();
    finishAnim();
    app.revealed = {};
    app.prevConfig = null;
    app.compare = null;
    app.showAnswers = false;
    enterSegment(0);
    announce('Study reset to its starting state.');
  }

  function backToRun() {
    stopPlay();
    if (app.mode === 'compare' && app.compare) {
      app.mode = 'run';
      app.run = app.compare.b;
      app.config = app.run.config;
      var f = M.frameAt(app.run, app.compare.key, '99:99:99');
      app.index = f.frame.index;
      app.seg = -1;
    } else if (app.mode === 'transfer' || app.mode === 'sources') {
      app.mode = 'run';
      if (!app.run) { enterSegment(0); return; }
    }
    renderAll(false);
  }

  function setDecision(key, value) {
    stopPlay();
    finishAnim();
    var cfg = {};
    keys(app.config).forEach(function (k) { cfg[k] = app.config[k]; });
    cfg[key] = value;
    var next = getRun(app.study, cfg);
    if (next.key === app.run.key) { renderAll(false); return; }
    var from = app.run;
    var start = M.firstDivergence(from, next);
    var target = Math.min(app.index, start);
    app.prevConfig = from.config;
    app.config = next.config;
    app.run = next;
    app.mode = 'run';
    app.seg = -1;
    app.rewind = rewindNotice(from, next, target, false);
    if (app.index <= start) app.rewind.none = true;
    app.index = target;
    renderAll(false);
    announce(app.rewind.none ? 'Design changed. The change affects only later events; the replay stays here.' : 'Design changed. Rewound to ' + app.rewind.time + ', before the earliest affected event.');
  }

  function openFreeCompare() {
    stopPlay();
    var a = getRun(app.study, app.prevConfig);
    var b = app.run;
    var ev = b.events[Math.min(app.index, b.events.length) - 1] || b.events[0];
    app.compare = { a: a, b: b, key: ev.key };
    app.mode = 'compare';
    renderAll(false);
  }

  function resumeGuide() {
    var mem = app.lastGuidedSeg || 0;
    enterSegment(mem);
  }

  function switchStudy(id, fromMemory) {
    if (id === app.study && app.mode !== 'sources') return;
    stopPlay();
    finishAnim();
    if (app.mode !== 'sources') saveMemory();
    app.study = id;
    var m = app.memory[id];
    if (m && fromMemory !== false) {
      app.mode = m.mode; app.seg = m.seg; app.config = m.config; app.run = m.run; app.index = m.index;
      app.revealed = m.revealed; app.prevConfig = m.prevConfig; app.compare = m.compare; app.rewind = null;
      renderAll(false);
    } else {
      app.revealed = {};
      app.prevConfig = null;
      app.compare = null;
      enterSegment(0);
    }
    var tab = document.querySelector('[data-study="' + id + '"]');
    if (tab) tab.focus();
  }
  function saveMemory() {
    if (!app.run) return;
    app.memory[app.study] = { mode: app.mode, seg: app.seg, config: app.config, run: app.run, index: app.index, revealed: app.revealed, prevConfig: app.prevConfig, compare: app.compare };
  }
  function nextStudy() {
    var i = STUDIES.indexOf(app.study);
    if (i < 2) switchStudy(STUDIES[i + 1], false);
    else showSources();
  }
  function showSources() {
    stopPlay();
    saveMemory();
    app.mode = 'sources';
    renderAll(false);
    $('sources-view').focus();
  }

  /* ------------------------------------------------------------------ */
  /* Playback                                                            */
  /* ------------------------------------------------------------------ */

  function togglePlay() {
    if (app.playing) { stopPlay(); return; }
    if (app.mode !== 'run') return;
    app.playing = true;
    updateControls();
    tick();
  }
  function tick() {
    if (!app.playing) return;
    if (pendingPrediction() || app.index >= app.run.frames.length - 1) { stopPlay(); return; }
    go(app.index + 1, true);
    var wait = function () {
      if (!app.playing) return;
      if (app.anim && !app.anim.isDone()) { app.playTimer = setTimeout(wait, 120); return; }
      app.playTimer = setTimeout(tick, app.reduced ? 3200 : 2200);
    };
    wait();
  }
  function stopPlay() {
    app.playing = false;
    if (app.playTimer) clearTimeout(app.playTimer);
    app.playTimer = null;
    updateControls();
  }
  function finishAnim() {
    if (app.anim && !app.anim.isDone()) app.anim.finish();
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  function chooseLayout(width) { return width < 700 ? 'narrow' : 'wide'; }

  function renderAll(animate) {
    if (seg() && !seg().compare && seg().stage !== 'Transfer') app.lastGuidedSeg = app.seg;
    document.body.classList.toggle('reduce-motion', app.reduced);
    renderTabs();
    $('run-view').hidden = app.mode !== 'run';
    $('compare-view').hidden = app.mode !== 'compare';
    $('transfer-view').hidden = app.mode !== 'transfer';
    $('sources-view').hidden = app.mode !== 'sources';
    $('study-head').hidden = app.mode === 'sources';
    $('stage-rail').hidden = app.mode === 'sources';
    $('guide-bar').hidden = app.mode === 'sources';
    if (app.mode === 'sources') { renderSources(); return; }
    renderHead();
    renderRail();
    renderGuideBar();
    if (app.mode === 'run') renderRun(animate);
    if (app.mode === 'compare') renderCompare();
    if (app.mode === 'transfer') renderTransfer();
    updateControls();
  }

  function renderTabs() {
    document.querySelectorAll('[data-study]').forEach(function (b) {
      var on = b.getAttribute('data-study') === app.study && app.mode !== 'sources';
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on || (app.mode === 'sources' && b.getAttribute('data-study') === 'photo') ? 0 : -1;
    });
    $('tab-sources').setAttribute('aria-pressed', app.mode === 'sources' ? 'true' : 'false');
    $('btn-text').setAttribute('aria-pressed', app.textView ? 'true' : 'false');
    $('btn-motion').setAttribute('aria-pressed', app.reduced ? 'true' : 'false');
  }

  function renderHead() {
    var st = T.studies[app.study];
    $('study-number').textContent = 'Study ' + st.number + ' of 3';
    $('study-title').textContent = st.title;
    $('study-lede').textContent = st.lede;
    $('study-route').textContent = st.route;
    var gl = clear($('study-guide'));
    gl.appendChild(el('span', { 'class': 'guide-label', text: 'In the guide:' }));
    st.guide.forEach(function (g) {
      gl.appendChild(el('a', { href: T.guideHref + '#' + g[0], target: '_blank', rel: 'noopener', 'class': 'guide-link', text: g[1] }));
    });
    var terms = clear($('study-terms'));
    st.terms.forEach(function (t) {
      terms.appendChild(el('dt', { text: t[0] }));
      terms.appendChild(el('dd', { text: t[1] }));
    });
    $('deployment-note').textContent = st.deployment || '';
    $('deployment-note').hidden = !st.deployment;
  }

  function currentStage() {
    if (app.mode === 'transfer') return 'Transfer';
    if (app.mode === 'compare') return 'Compare';
    var sg = seg();
    if (!sg) return 'Change';
    if (pendingPrediction()) return 'Predict';
    if (app.rewind && !app.rewind.none) return 'Rewind';
    if (sg.stage === 'Change') return 'Change';
    var anyRevealed = keys(sg.predict || {}).some(function (k) { return app.revealed[app.study + ':' + sg.id + ':' + k]; });
    if (sg.stage === 'Observe' || sg.stage === 'Predict') return anyRevealed ? 'Reveal' : sg.stage === 'Predict' ? 'Predict' : 'Observe';
    return sg.stage;
  }

  function renderRail() {
    var cur = currentStage();
    var rail = clear($('stage-rail'));
    var ci = T.stages.indexOf(cur);
    T.stages.forEach(function (s, i) {
      rail.appendChild(el('li', { 'class': 'rail-item' + (i < ci ? ' is-done' : '') + (i === ci ? ' is-current' : ''), 'aria-current': i === ci ? 'step' : null }, [
        el('span', { 'class': 'rail-dot', 'aria-hidden': 'true', text: i < ci ? '✓' : String(i + 1) }), s
      ]));
    });
  }

  function renderGuideBar() {
    var bar = clear($('guide-bar'));
    var sg = seg();
    if (sg) {
      bar.appendChild(el('p', { 'class': 'guide-intro' }, [el('strong', { text: currentStage() + ' · ' }), sg.intro || T.studies[app.study].lede]));
    } else {
      bar.appendChild(el('p', { 'class': 'guide-intro' }, [el('strong', { text: 'Exploring on your own \u00b7 ' }), 'You changed a decision. Step through, then compare with the previous design.']));
      if (app.prevConfig && app.mode === 'run') bar.appendChild(el('button', { type: 'button', 'class': 'btn btn-quiet', onclick: openFreeCompare, text: 'Compare with the previous design' }));
      bar.appendChild(el('button', { type: 'button', 'class': 'btn btn-quiet', onclick: resumeGuide, text: 'Resume the guided path' }));
    }
  }

  function renderRun(animate) {
    var st = T.studies[app.study];
    var run = app.run, f = run.frames[app.index];
    var wrap = $('drawing-wrap');
    app.layout = chooseLayout(wrap.clientWidth || 900);
    $('drawing-clock').textContent = f.state.clock;
    $('drawing-design').textContent = run.label;
    var svg = $('drawing');
    var title = st.title + ' — ' + (f.event ? f.event.t + ', ' + f.event.label : 'starting state') + '. Design: ' + run.label + '.';
    var result = V.render(svg, { study: app.study, run: run, index: app.index, layout: app.layout, M: M, title: title });
    svg.setAttribute('aria-label', title + ' A text description of every component follows in the text view.');
    if (animate) app.anim = V.animate(result, function () { updateControls(); });
    else app.anim = null;

    // Text view
    $('drawing-wrap').hidden = app.textView;
    $('text-view').hidden = !app.textView;
    if (app.textView) {
      var tv = clear($('text-view'));
      tv.appendChild(el('h3', { 'class': 'tv-title', text: 'At ' + f.state.clock + ' (' + (f.event ? f.event.label : 'starting state') + ')' }));
      var dl = el('dl', { 'class': 'tv-list' });
      V.describe(app.study, run, app.index, M).forEach(function (row) {
        dl.appendChild(el('dt', { text: row[0] }));
        dl.appendChild(el('dd', { text: row[1] }));
      });
      tv.appendChild(dl);
    }

    renderEventCard(f);
    renderPredict();
    renderNotes(f);
    renderPause();
    renderDecisions();
    renderTimeline();
  }

  function stepsList(f) {
    var ol = el('ol', { 'class': 'steps' });
    f.cues.forEach(function (c) {
      var word = V.typeWord[c.type] || (c.type === 'health' ? 'HEALTH CHECK' : 'CONTROL');
      var route = c.route.map(compName).join(' → ');
      ol.appendChild(el('li', { 'class': 'step step--' + c.type }, [
        el('span', { 'class': 'step-type', text: word }), ' ', el('span', { 'class': 'step-route', text: route }), ' · ', c.label
      ]));
    });
    return ol;
  }

  function compName(id) {
    var s = app.run ? app.run.frames[app.index].state : null;
    var names = {
      browser: 'browser', alb: 'ALB', bucket: 'S3', asg: 'Auto Scaling', 'i-0a1': 'Server A', 'i-0b1': 'Server B', 'i-0a2': 'Replacement A′',
      customer: 'customer', app: 'application', operator: 'operator', snapshot: 'snap-0900', 'db-r': 'restored DB', rds: 'RDS', dns: 'DNS',
      checkout: 'checkout', queue: 'queue', W1: 'W1', W2: 'W2', processor: 'processor', processed: 'processed table', fault: 'fault'
    };
    if ((id === 'db-a' || id === 'db-b') && s && s.db) return M.database.instanceName(s, id).replace(/ \(.*\)$/, '') + ' (AZ ' + id.slice(-1) + ')';
    return names[id] || id;
  }

  function renderEventCard(f) {
    var card = clear($('event-card'));
    var st = T.studies[app.study];
    var n = app.run.frames.length - 1;
    if (app.rewind) {
      card.appendChild(el('p', { 'class': 'rewind-note', role: 'status' }, [
        el('span', { 'class': 'rewind-icon', 'aria-hidden': 'true', text: '⟲ ' }),
        app.rewind.none
          ? 'Design changed to: ' + app.rewind.to + '. This change affects only events after this point, so the replay stays here.'
          : 'Rewound to ' + app.rewind.time + (app.rewind.eventLabel ? ', just before “' + app.rewind.eventLabel + '” (' + app.rewind.eventTime + ') — the earliest event this change affects.' : '.') +
            ' Nothing carries over from the previous run' + (app.study === 'photo' ? ': files are not migrated.' : '.')
      ]));
    }
    card.appendChild(el('p', { 'class': 'event-meta', text: (f.event ? 'Event ' + app.index + ' of ' + n + ' · ' + f.event.t : 'Starting state · ' + f.state.clock) + ' · illustrative clock' }));
    card.appendChild(el('h3', { 'class': 'event-title', text: f.event ? f.event.label : 'Before the first event' }));
    card.appendChild(el('p', { 'class': 'event-text', text: f.event ? f.text : st.start(app.config) }));
    if (f.result) card.appendChild(el('p', { 'class': 'event-result', text: f.result }));
    if (f.cues.length) {
      card.appendChild(el('p', { 'class': 'steps-title', text: 'What moved in this event' }));
      card.appendChild(stepsList(f));
    }
    if (app.index === n && app.mode === 'run') {
      var sg = seg();
      card.appendChild(el('p', { 'class': 'end-note', text: sg && sg.next ? 'End of this run. Continue with: ' + sg.next.label + '.' : 'End of this run.' + (app.prevConfig ? ' Compare it with the previous design.' : '') }));
    }
  }

  function renderPredict() {
    var q = pendingPrediction();
    var box = $('predict-card');
    box.hidden = !q;
    if (!q) return;
    clear(box);
    box.appendChild(el('p', { 'class': 'predict-kicker', text: 'Predict before you continue' }));
    box.appendChild(el('p', { 'class': 'predict-q', text: q }));
    box.appendChild(el('p', { 'class': 'predict-hint', text: 'Think it through — no typing needed. The next event shows what happens.' }));
    box.appendChild(el('button', { type: 'button', 'class': 'btn btn-primary', onclick: primary, text: 'Reveal' }));
  }

  function renderNotes(f) {
    var box = clear($('note-card'));
    var st = T.studies[app.study];
    var x = { key: f.event ? f.event.key : null, index: app.index, c: app.config };
    var shown = st.notes.filter(function (n) { return n.when(x); });
    box.hidden = !shown.length;
    shown.forEach(function (n) {
      box.appendChild(el('div', { 'class': 'note' }, [el('p', { 'class': 'note-title', text: n.title }), el('p', { 'class': 'note-text', text: n.text })]));
    });
  }

  function renderPause() {
    var pc = M.pauseCheck(app.study, app.run, app.index);
    var list = clear($('pause-list'));
    T.pauseQuestions.forEach(function (q) {
      list.appendChild(el('dt', { text: q[1] }));
      list.appendChild(el('dd', { 'class': app.showAnswers ? '' : 'is-hidden', text: pc[q[0]] }));
    });
    $('btn-answers').textContent = app.showAnswers ? 'Hide answers' : 'Show answers';
    $('btn-answers').setAttribute('aria-expanded', app.showAnswers ? 'true' : 'false');
  }

  function renderDecisions() {
    var box = clear($('decisions'));
    var st = T.studies[app.study];
    st.decisions.forEach(function (d) {
      var applicable = !d.onlyWhen || keys(d.onlyWhen).every(function (k) { return app.config[k] === d.onlyWhen[k]; });
      var fs = el('fieldset', { 'class': 'decision' + (applicable ? '' : ' is-disabled') });
      fs.appendChild(el('legend', { text: d.question }));
      d.options.forEach(function (o) {
        var id = 'dec-' + d.key + '-' + String(o[0]);
        var input = el('input', { type: 'radio', name: 'dec-' + d.key, id: id, value: String(o[0]), checked: app.config[d.key] === o[0], disabled: !applicable,
          onchange: function () { setDecision(d.key, o[0]); } });
        fs.appendChild(el('div', { 'class': 'opt' }, [input, el('label', { 'for': id, text: o[1] })]));
      });
      if (!applicable && d.disabledNote) fs.appendChild(el('p', { 'class': 'decision-note', text: d.disabledNote }));
      box.appendChild(fs);
    });
  }

  function renderTimeline() {
    var tl = clear($('timeline'));
    var run = app.run;
    var sg = seg();
    var start = el('li', null, [el('button', { type: 'button', 'class': 'tl-item' + (app.index === 0 ? ' is-current' : ' is-past'), 'aria-current': app.index === 0 ? 'step' : null, onclick: function () { go(0, false); } }, [
      el('span', { 'class': 'tl-time', text: run.frames[0].state.clock.slice(0, 5) }), el('span', { 'class': 'tl-label', text: 'Start' })
    ])]);
    tl.appendChild(start);
    run.events.forEach(function (ev, i) {
      var idx = i + 1;
      var cls = 'tl-item' + (idx === app.index ? ' is-current' : idx < app.index ? ' is-past' : ' is-future');
      var predicted = sg && sg.predict && sg.predict[idx - 1] && !app.revealed[predKey(idx - 1)];
      tl.appendChild(el('li', null, [el('button', { type: 'button', 'class': cls, 'aria-current': idx === app.index ? 'step' : null, onclick: function () { go(idx, false); },
        'aria-label': ev.t + ' ' + ev.label + (predicted ? ' (prediction pending before this event)' : '') }, [
        el('span', { 'class': 'tl-time', text: ev.t.length > 5 && app.study === 'payment' ? ev.t : ev.t.slice(0, 5) }),
        el('span', { 'class': 'tl-label', text: ev.label }),
        predicted ? el('span', { 'class': 'tl-predict', 'aria-hidden': 'true', text: '?' }) : null
      ])]));
    });
    var cur = tl.querySelector('.is-current');
    if (cur && cur.scrollIntoView && tl.scrollWidth > tl.clientWidth) {
      var left = cur.offsetLeft - tl.clientWidth / 2 + cur.clientWidth / 2;
      tl.scrollLeft = Math.max(0, left);
    }
  }

  function updateControls() {
    if (!app.run) return;
    var p = $('btn-primary');
    p.textContent = primaryLabel() + ' \u25b8';
    $('btn-compare-next').textContent = (app.mode === 'compare' ? primaryLabel() : 'Continue') + ' \u25b8';
    $('btn-compare-next').hidden = app.mode === 'compare' && !seg();
    var atEnd = app.mode === 'run' && app.index >= app.run.frames.length - 1 && !seg() && !app.prevConfig;
    p.disabled = atEnd;
    $('btn-prev').disabled = app.mode === 'run' && app.index === 0;
    $('btn-play').disabled = app.mode !== 'run';
    $('btn-play').querySelector('.btn-icon').textContent = app.playing ? '\u275a\u275a' : '\u25b6';
    $('btn-play').querySelector('.btn-text').textContent = app.playing ? 'Pause' : 'Play';
    $('btn-play').setAttribute('aria-label', app.playing ? 'Pause' : 'Play');
    $('btn-play').setAttribute('aria-pressed', app.playing ? 'true' : 'false');
    $('frame-pos').textContent = app.mode === 'run' ? (app.index === 0 ? 'start' : app.index + ' / ' + (app.run.frames.length - 1)) : '';
  }

  /* ------------------------------------------------------------------ */
  /* Comparison                                                          */
  /* ------------------------------------------------------------------ */

  function renderCompare() {
    var cmp = app.compare;
    var sg = seg();
    // The guided intro is already shown above; repeat nothing here.
    $('compare-intro').textContent = sg ? 'Choose an event to see both runs at that moment. Differences are marked \u2260.' : 'Equivalent events in your previous design (A) and your current design (B). Differences are marked \u2260.';
    var rows = M.align(cmp.a, cmp.b);
    var list = clear($('compare-events'));
    rows.forEach(function (r) {
      var evA = r.a ? cmp.a.events[r.a - 1] : null, evB = r.b ? cmp.b.events[r.b - 1] : null;
      var ev = evB || evA;
      var on = r.key === cmp.key;
      list.appendChild(el('li', null, [el('button', { type: 'button', 'class': 'cmp-ev' + (on ? ' is-current' : ''), 'aria-pressed': on ? 'true' : 'false',
        onclick: function () { cmp.key = r.key; renderCompare(); } }, [
        el('span', { 'class': 'tl-time', text: ev.t.slice(0, app.study === 'payment' ? 8 : 5) }),
        el('span', { 'class': 'tl-label', text: ev.label }),
        el('span', { 'class': 'cmp-presence', text: (r.a ? 'A' : '–') + ' / ' + (r.b ? 'B' : '–') })
      ])]));
    });
    var t = (function () {
      for (var i = 0; i < rows.length; i++) if (rows[i].key === cmp.key) {
        var e = rows[i].b ? cmp.b.events[rows[i].b - 1] : cmp.a.events[rows[i].a - 1];
        return e.t;
      }
      return '99:99:99';
    })();
    var fa = M.frameAt(cmp.a, cmp.key, t), fb = M.frameAt(cmp.b, cmp.key, t);
    compareSide('cmp-a', 'A · ' + (sg ? 'Original run' : 'Previous design'), cmp.a, fa, fb);
    compareSide('cmp-b', 'B · ' + (sg ? 'Changed run' : 'Current design'), cmp.b, fb, fa);
  }

  function compareSide(id, heading, run, at, other) {
    var box = clear($(id));
    var f = at.frame;
    box.appendChild(el('h3', { 'class': 'cmp-head', text: heading }));
    box.appendChild(el('p', { 'class': 'cmp-design', text: run.label }));
    box.appendChild(el('p', { 'class': 'cmp-when', text: at.exact
      ? (f.event ? f.event.t + ' · ' + f.event.label : 'Starting state')
      : 'No equivalent event in this run — showing the latest earlier state (' + f.state.clock + ').' }));
    if (f.result) box.appendChild(el('p', { 'class': 'event-result', text: f.result }));
    var facts = M.facts(app.study, run, f.index);
    var otherFacts = M.facts(app.study, other.frame === f ? run : (id === 'cmp-a' ? app.compare.b : app.compare.a), other.frame.index);
    var tbl = el('table', { 'class': 'facts' });
    var tb = el('tbody');
    facts.forEach(function (row, i) {
      var differs = otherFacts[i] && otherFacts[i][1] !== row[1];
      tb.appendChild(el('tr', { 'class': differs ? 'is-diff' : '' }, [el('th', { scope: 'row', text: row[0] }), el('td', null, [differs ? el('span', { 'class': 'diff-mark', 'aria-label': 'differs from the other run', text: '≠ ' }) : null, row[1]])]));
    });
    tbl.appendChild(tb);
    box.appendChild(tbl);
    box.appendChild(el('p', { 'class': 'cmp-text', text: f.event ? f.text : T.studies[app.study].start(run.config) }));
    // Same layout on both sides, so every component sits in the same place
    // and a changed record stands out.
    var holder = el('div', { 'class': 'cmp-drawing' });
    box.appendChild(holder);
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('role', 'img');
    holder.appendChild(svg);
    var wide = box.clientWidth >= 720;
    $('compare-grid').classList.toggle('is-wide', wide);
    V.render(svg, { study: app.study, run: run, index: f.index, layout: wide ? 'wide' : 'narrow', M: M, title: heading + ': ' + run.label + ', ' + (f.event ? f.event.t + ' ' + f.event.label : 'starting state') });
  }

  /* ------------------------------------------------------------------ */
  /* Transfer and sources                                                */
  /* ------------------------------------------------------------------ */

  function renderTransfer() {
    var st = T.studies[app.study];
    $('transfer-q').textContent = st.transfer.question;
    var ans = clear($('transfer-a'));
    st.transfer.answer.forEach(function (p) { ans.appendChild(el('p', { text: p })); });
    $('transfer-details').open = false;
    $('btn-transfer-next').textContent = (STUDIES.indexOf(app.study) < 2 ? 'Next study' : 'Sources and assumptions') + ' \u25b8';
    var gl = clear($('transfer-links'));
    st.guide.forEach(function (g) { gl.appendChild(el('a', { href: T.guideHref + '#' + g[0], target: '_blank', rel: 'noopener', 'class': 'guide-link', text: g[1] })); });
  }

  function renderSources() {
    var box = clear($('sources-body'));
    box.appendChild(el('p', { 'class': 'sources-method', text: T.sources.method }));
    STUDIES.forEach(function (sid) {
      var st = T.studies[sid];
      var sec = el('section', { 'class': 'src-study' });
      sec.appendChild(el('h3', { text: 'Study ' + st.number + ' · ' + st.title }));
      var tbl = el('table', { 'class': 'src-table' });
      tbl.appendChild(el('thead', null, [el('tr', null, [el('th', { scope: 'col', text: 'Teaching claim' }), el('th', { scope: 'col', text: 'Guide' }), el('th', { scope: 'col', text: 'AWS documentation' }), el('th', { scope: 'col', text: 'Checked' })])]));
      var tb = el('tbody');
      T.sources[sid].forEach(function (c) {
        var g = el('td');
        if (!c.guide.length) g.appendChild(document.createTextNode('—'));
        c.guide.forEach(function (x, i) { if (i) g.appendChild(document.createTextNode(', ')); g.appendChild(el('a', { href: T.guideHref + '#' + x[0], target: '_blank', rel: 'noopener', text: x[1] })); });
        var a = el('td');
        c.aws.forEach(function (x, i) { if (i) a.appendChild(el('br')); a.appendChild(el('a', { href: x[1], target: '_blank', rel: 'noopener', text: x[0] })); });
        tb.appendChild(el('tr', null, [el('td', { text: c.claim }), g, a, el('td', { text: T.checked })]));
      });
      tbl.appendChild(tb);
      sec.appendChild(tbl);
      sec.appendChild(el('h4', { text: 'Teaching assumptions' }));
      var ul = el('ul');
      st.assumptions.forEach(function (x) { ul.appendChild(el('li', { text: x })); });
      sec.appendChild(ul);
      sec.appendChild(el('p', null, [el('strong', { text: 'Not modelled: ' }), st.notModelled]));
      box.appendChild(sec);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Print pack: key states of every study                               */
  /* ------------------------------------------------------------------ */

  var KEY_STATES = {
    photo: [[{ storage: 'local', sticky: false }, 'view-1'], [{ storage: 'local', sticky: false }, 'replace'], [{ storage: 's3', sticky: false }, 'view-3'], [{ storage: 'local', sticky: true }, 'view-3']],
    database: [[{ incident: 'writer-failure' }, 'check-1'], [{ incident: 'mistaken-delete', recovery: 'failover' }, 'check-2'], [{ incident: 'mistaken-delete', recovery: 'restore' }, 'recover-2'], [{ incident: 'mistaken-delete', recovery: 'restore' }, 'check-2']],
    payment: [[{ design: 'plain', crash: 'after-charge' }, 'crash'], [{ design: 'plain', crash: 'after-charge' }, 'charge-2'], [{ design: 'idempotent', crash: 'after-charge' }, 'charge-2'], [{ design: 'idempotent', crash: 'after-charge' }, 'process-43']]
  };

  function buildPrintPack() {
    var pack = clear($('print-pack'));
    // Lay the pack out off-screen while building, so text is measured exactly.
    pack.style.cssText = 'display:block;position:absolute;left:-12000px;top:0;width:1000px';
    pack.appendChild(el('h1', { text: T.title }));
    pack.appendChild(el('p', { 'class': 'pp-sub', text: T.subtitle + ' Key states for printing. Clock times are illustrative.' }));
    STUDIES.forEach(function (sid) {
      var st = T.studies[sid];
      pack.appendChild(el('h2', { 'class': 'pp-study', text: 'Study ' + st.number + ' · ' + st.title }));
      KEY_STATES[sid].forEach(function (k) {
        var run = getRun(sid, k[0]);
        var at = M.frameAt(run, k[1], '99:99:99').frame;
        var fig = el('figure', { 'class': 'pp-state' });
        fig.appendChild(el('figcaption', { 'class': 'pp-cap' }, [el('strong', { text: at.event.t + ' · ' + at.event.label }), ' — ' + run.label]));
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('role', 'img');
        fig.appendChild(svg);
        pack.appendChild(fig);
        V.render(svg, { study: sid, run: run, index: at.index, layout: 'wide', M: M, title: st.title + ': ' + at.event.label });
        fig.appendChild(el('p', { 'class': 'pp-text', text: at.text }));
        var pc = M.pauseCheck(sid, run, at.index);
        var dl = el('dl', { 'class': 'pp-pause' });
        T.pauseQuestions.forEach(function (q) { dl.appendChild(el('dt', { text: q[1] })); dl.appendChild(el('dd', { text: pc[q[0]] })); });
        fig.appendChild(dl);
        pack.appendChild(fig);
      });
    });
    pack.style.cssText = '';
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                              */
  /* ------------------------------------------------------------------ */

  function announce(msg) { $('live').textContent = msg; }

  function onKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target;
    var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      if (!(tag === 'input' && t.type === 'radio' && (e.key === 'n' || e.key === 'p'))) return;
    }
    var dlg = $('help');
    if (dlg.open) return;
    var k = e.key;
    if (k === 'ArrowRight' || k === 'n') {
      if (tag === 'button' && t.closest && t.closest('[role="tablist"]')) return;
      e.preventDefault(); primary();
    } else if (k === 'ArrowLeft' || k === 'p') {
      if (tag === 'button' && t.closest && t.closest('[role="tablist"]')) return;
      e.preventDefault(); prev();
    } else if (k === ' ' && (tag === 'body' || tag === '' || t.id === 'drawing-wrap')) {
      e.preventDefault(); togglePlay();
    } else if (k === 'k') { togglePlay(); }
    else if (k === 'r') { reset(); }
    else if (k === 'Home' && app.mode === 'run' && tag !== 'button') { e.preventDefault(); go(0, false); }
    else if (k === 'End' && app.mode === 'run' && tag !== 'button') { e.preventDefault(); go(app.run.frames.length - 1, false); }
    else if (k === '1' || k === '2' || k === '3') { switchStudy(STUDIES[Number(k) - 1]); }
    else if (k === 'c' && app.mode === 'run' && app.prevConfig) { openFreeCompare(); }
    else if (k === 't') { toggleText(); }
    else if (k === 'm') { toggleMotion(); }
    else if (k === 'a') { app.showAnswers = !app.showAnswers; if (app.mode === 'run') renderPause(); }
    else if (k === '?') { openHelp(); }
  }

  function toggleText() { app.textView = !app.textView; finishAnim(); renderAll(false); announce(app.textView ? 'Text view on.' : 'Drawing view on.'); }
  function toggleMotion() { app.reduced = !app.reduced; finishAnim(); renderAll(false); announce(app.reduced ? 'Reduced motion on: no moving tokens.' : 'Motion on.'); }
  function openHelp() {
    var d = $('help');
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }

  function tabKeys(e) {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-study]'));
    var i = tabs.indexOf(e.target);
    if (i < 0) return;
    var j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') j = (i + tabs.length - 1) % tabs.length;
    if (e.key === 'Home') j = 0;
    if (e.key === 'End') j = tabs.length - 1;
    if (j === null) return;
    e.preventDefault();
    switchStudy(tabs[j].getAttribute('data-study'));
  }

  function init() {
    document.title = T.title;
    $('app-title').textContent = T.title;
    $('app-subtitle').textContent = T.subtitle;
    var about = clear($('about-text'));
    T.about.forEach(function (p) { about.appendChild(el('p', { text: p })); });
    about.appendChild(el('p', null, ['Companion to the ', el('a', { href: T.guideHref, target: '_blank', rel: 'noopener', text: T.guideName }), '. The guide stays the primary text; each study links to its chapters.']));
    $('pilot-text').textContent = T.pilot;
    document.querySelectorAll('[data-study]').forEach(function (b) {
      var st = T.studies[b.getAttribute('data-study')];
      b.querySelector('.tab-title').textContent = st.title;
      b.querySelector('.tab-route').textContent = st.route.replace('Use after ', 'After ').replace(/ \(.*\)\.$/, '');
      b.addEventListener('click', function () { switchStudy(b.getAttribute('data-study')); });
      b.addEventListener('keydown', tabKeys);
    });
    $('tab-sources').addEventListener('click', function () { if (app.mode === 'sources') backToRun(); else showSources(); });
    $('btn-primary').addEventListener('click', primary);
    $('btn-prev').addEventListener('click', prev);
    $('btn-play').addEventListener('click', togglePlay);
    $('btn-reset').addEventListener('click', reset);
    $('btn-text').addEventListener('click', toggleText);
    $('btn-motion').addEventListener('click', toggleMotion);
    $('btn-print').addEventListener('click', function () { buildPrintPack(); window.print(); });
    $('btn-help').addEventListener('click', openHelp);
    $('help-close').addEventListener('click', function () { var d = $('help'); if (d.close) d.close(); else d.removeAttribute('open'); });
    $('btn-answers').addEventListener('click', function () { app.showAnswers = !app.showAnswers; renderPause(); });
    $('btn-back-run').addEventListener('click', backToRun);
    $('btn-compare-next').addEventListener('click', primary);
    $('btn-transfer-next').addEventListener('click', nextStudy);
    $('btn-transfer-back').addEventListener('click', function () { var i = segById('transfer'); app.seg = i - 1; enterSegment(Math.max(0, i - 1)); });
    $('btn-sources-back').addEventListener('click', function () { switchStudy(app.study, true); backToRun(); });
    window.addEventListener('beforeprint', buildPrintPack);
    document.addEventListener('keydown', onKey);
    if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', function (e) { app.reduced = e.matches; renderAll(false); });
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var w = $('drawing-wrap').clientWidth;
        if ((app.mode === 'run' && chooseLayout(w) !== app.layout) || app.mode === 'compare') renderAll(false);
      }, 150);
    });
    var hash = (location.hash || '').replace('#', '');
    if (STUDIES.indexOf(hash) >= 0) app.study = hash;
    enterSegment(0);
    app.booted = true;
    window.WhatSurvivesApp = { state: app, primary: primary, prev: prev, reset: reset, setDecision: setDecision, switchStudy: switchStudy, go: go, enterSegment: enterSegment, buildPrintPack: buildPrintPack, openFreeCompare: openFreeCompare };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
