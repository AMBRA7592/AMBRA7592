/*
 * AWS — What Survives · deterministic event model
 *
 * Pure state transitions for the three studies. No DOM, no clock, no randomness:
 * the same study, configuration (design decisions + incident schedule) and event
 * list always produce the same frames. The view only reads frames.
 *
 * A run is built by folding a study's event schedule over its initial state:
 *   frames[0]   = starting state (no event)
 *   frames[i]   = state after events[i - 1]
 * Rewind and reset never undo anything; they select an earlier frame of a run
 * that was recomputed from the beginning.
 *
 * Times are an illustrative teaching clock, not AWS service timings.
 */
(function (root) {
  'use strict';

  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var keys = Object.keys;

  function addSeconds(t, n) {
    var p = t.split(':').map(Number);
    var total = p[0] * 3600 + p[1] * 60 + p[2] + n;
    var pad = function (x) { return (x < 10 ? '0' : '') + x; };
    return pad(Math.floor(total / 3600) % 24) + ':' + pad(Math.floor(total / 60) % 60) + ':' + pad(total % 60);
  }
  function byTime(a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; }
  function list(items) {
    if (items.length === 0) return 'none';
    if (items.length === 1) return items[0];
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  /* ------------------------------------------------------------------ */
  /* Study 1 · The missing photograph                                    */
  /* ------------------------------------------------------------------ */

  var PHOTO_FILE = 'photo-17.jpg';
  var PHOTO_KEY = 'photos/photo-17.jpg';

  var photo = {
    id: 'photo',
    defaultConfig: { storage: 'local', sticky: false },
    options: {
      storage: ['local', 's3'],
      sticky: [false, true]
    },
    normalize: function (c) {
      return { storage: c.storage === 's3' ? 's3' : 'local', sticky: c.sticky === true };
    },
    configLabel: function (c) {
      return (c.storage === 's3' ? 'Uploads in S3 Standard (object API)' : 'Uploads on each server’s instance store') +
        ' · stickiness ' + (c.sticky ? 'on' : 'off');
    },
    initialState: function () {
      return {
        clock: '09:58:00',
        browser: { cookie: null, page: { kind: 'form' } },
        alb: { targets: { 'i-0a1': 'healthy', 'i-0b1': 'healthy' } },
        instances: {
          'i-0a1': { name: 'Server A', az: 'a', status: 'running', files: {} },
          'i-0b1': { name: 'Server B', az: 'b', status: 'running', files: {} },
          'i-0a2': { name: 'Replacement A′', az: 'a', status: 'absent', files: {} }
        },
        // The bucket exists in every run so starting states are identical;
        // only the S3 design reads or writes it (and only then is it drawn).
        bucket: { name: 'shop-uploads', objects: {} },
        erased: [],
        accepted: null,
        request: null
      };
    },
    schedule: function () {
      // The ALB's target for each request is fixed by the schedule (teaching
      // assumption) so every replay routes identically unless stickiness or
      // target health overrides it.
      return [
        { key: 'upload', t: '10:00:00', label: 'Customer uploads photo-17', req: 'req-1', method: 'POST', path: '/photos', target: 'i-0a1' },
        { key: 'view-1', t: '10:01:00', label: 'Customer opens photo-17', req: 'req-2', method: 'GET', path: '/photos/photo-17', target: 'i-0b1' },
        { key: 'view-2', t: '10:02:00', label: 'Customer reloads photo-17', req: 'req-3', method: 'GET', path: '/photos/photo-17', target: 'i-0a1' },
        { key: 'fail', t: '10:10:00', label: 'Server A fails its health checks', instance: 'i-0a1' },
        { key: 'replace', t: '10:11:00', label: 'Auto Scaling replaces Server A', old: 'i-0a1', launch: 'i-0a2' },
        { key: 'ready', t: '10:14:00', label: 'Replacement passes its health checks', instance: 'i-0a2' },
        { key: 'view-3', t: '10:20:00', label: 'Customer opens photo-17 again', req: 'req-4', method: 'GET', path: '/photos/photo-17', target: 'i-0a2' }
      ];
    },
    apply: function (s, ev, c) {
      var out = { changes: [], cues: [], text: '', result: null };
      var name = function (id) { return s.instances[id].name + ' (' + id + ')'; };

      if (ev.req) {
        var r = photoRoute(s, ev, c);
        var srv = s.instances[r.to];
        var reqLabel = ev.req + ' · ' + ev.method + ' ' + ev.path;
        out.cues.push({ type: 'request', route: ['browser', 'alb', r.to], label: reqLabel });
        var routeText = photoRouteText(r, s, ev);
        if (c.sticky) s.browser.cookie = r.to;

        if (ev.key === 'upload') {
          if (c.storage === 'local') {
            srv.files[PHOTO_FILE] = { id: 'photo-17', size: '2.4 MB', at: ev.t };
            out.changes.push({ comp: r.to, rec: PHOTO_FILE, kind: 'created' });
            out.text = routeText + ' ' + srv.name + ' writes photo-17.jpg to /uploads on its own instance-store volume and answers 201 Created. The customer sees “photo-17 saved”. The business action is complete: the shop has accepted the upload.';
          } else {
            s.bucket.objects[PHOTO_KEY] = { id: 'photo-17', size: '2.4 MB', at: ev.t, storageClass: 'S3 Standard' };
            out.changes.push({ comp: 'bucket', rec: PHOTO_KEY, kind: 'created' });
            out.cues.push({ type: 'request', route: [r.to, 'bucket'], label: 'PutObject ' + PHOTO_KEY });
            out.cues.push({ type: 'ack', route: ['bucket', r.to], label: '200 OK (stored)' });
            out.text = routeText + ' ' + srv.name + ' calls PutObject: photo-17 is stored in the bucket shop-uploads as ' + PHOTO_KEY + '. Only after S3 confirms does ' + srv.name + ' answer 201 Created. The customer sees “photo-17 saved”. The business action is complete.';
          }
          if (c.sticky) out.text += ' Because stickiness is on, the response also sets a load-balancer cookie that names ' + name(r.to) + '.';
          out.cues.push({ type: 'ack', route: [r.to, 'alb', 'browser'], label: '201 Created' });
          s.accepted = { photo: 'photo-17', at: ev.t };
          s.browser.page = { kind: 'saved', status: 201 };
          s.request = { id: ev.req, server: r.to, status: 201, found: true, why: r.why, at: ev.t };
          out.result = 'Customer sees: “photo-17 saved” (201 Created).';
          return out;
        }

        // GET /photos/photo-17
        var found;
        if (c.storage === 'local') {
          found = !!srv.files[PHOTO_FILE];
        } else {
          found = !!s.bucket.objects[PHOTO_KEY];
          out.cues.push({ type: 'request', route: [r.to, 'bucket'], label: 'GetObject ' + PHOTO_KEY });
          out.cues.push({ type: 'ack', route: ['bucket', r.to], label: found ? '200 OK + object' : '404 NoSuchKey' });
        }
        var holder = photoLocalHolder(s, r.to);
        if (c.storage === 'local' && !found && holder) {
          out.cues.push({ type: 'blocked', route: [r.to, holder], label: 'no path to ' + s.instances[holder].name + '’s disk' });
        }
        out.cues.push({ type: 'ack', route: [r.to, 'alb', 'browser'], label: found ? '200 OK' : '404 Not Found' });
        s.browser.page = found ? { kind: 'photo', status: 200 } : { kind: 'missing', status: 404 };
        s.request = { id: ev.req, server: r.to, status: found ? 200 : 404, found: found, why: r.why, at: ev.t };
        out.result = found ? 'Customer sees: photo-17 (200 OK).' : 'Customer sees: “Photo not found” (404).';
        out.text = routeText + ' ' + photoViewText(s, ev, c, r, found, holder);
        return out;
      }

      if (ev.key === 'fail') {
        var a = s.instances[ev.instance];
        a.status = 'impaired';
        s.alb.targets[ev.instance] = 'unhealthy';
        out.changes.push({ comp: ev.instance, kind: 'status' }, { comp: 'alb', kind: 'status' });
        out.cues.push({ type: 'health', route: ['alb', ev.instance], label: 'health check failed' });
        out.text = 'Server A stops passing its health checks (its instance status is impaired). The ALB marks the target unhealthy and stops sending it requests. ' +
          (a.files[PHOTO_FILE]
            ? 'photo-17 is still on A’s instance-store volume, but nothing can read it while A is impaired: unreachable, not yet destroyed.'
            : 'No upload lives on A’s disk in this design; photo-17 is in S3 and unaffected.');
        out.result = 'No customer request at this moment.';
        return out;
      }

      if (ev.key === 'replace') {
        var old = s.instances[ev.old];
        var lost = keys(old.files);
        lost.forEach(function (f) {
          s.erased.push({ file: f, id: old.files[f].id, instance: ev.old, at: ev.t });
          out.changes.push({ comp: ev.old, rec: f, kind: 'destroyed' });
        });
        old.files = {};
        old.status = 'terminated';
        delete s.alb.targets[ev.old];
        s.instances[ev.launch].status = 'launching';
        s.alb.targets[ev.launch] = 'initial';
        out.changes.push({ comp: ev.old, kind: 'status' }, { comp: ev.launch, kind: 'launched' }, { comp: 'alb', kind: 'status' });
        out.cues.push({ type: 'control', route: ['asg', ev.old], label: 'terminate ' + ev.old });
        out.cues.push({ type: 'control', route: ['asg', ev.launch], label: 'launch ' + ev.launch + ' from the launch template' });
        out.text = 'The Auto Scaling group terminates ' + ev.old + ' and launches a replacement, ' + ev.launch + ', from its launch template (the saved instance settings, including the machine image). ' +
          (lost.length
            ? 'Termination erases the instance-store volume: photo-17’s only copy is now destroyed. The replacement boots from the machine image, so its /uploads starts empty — nothing is copied from A.'
            : 'Termination erases A’s instance-store volume, but no upload lived there. The replacement boots from the machine image with an empty disk; it will read uploads from S3.');
        out.result = 'No customer request at this moment.';
        return out;
      }

      if (ev.key === 'ready') {
        s.instances[ev.instance].status = 'running';
        s.alb.targets[ev.instance] = 'healthy';
        out.changes.push({ comp: ev.instance, kind: 'status' }, { comp: 'alb', kind: 'status' });
        out.cues.push({ type: 'health', route: ['alb', ev.instance], label: 'health check passed' });
        out.text = c.storage === 'local'
          ? 'The replacement passes its health checks and the ALB starts routing to it. Capacity is restored: two healthy servers. Healthy is not the same as holding the data — neither healthy server has photo-17.'
          : 'The replacement passes its health checks and the ALB starts routing to it. Both healthy servers can read photo-17 from S3 (permissions and network path assumed to work).';
        out.result = 'No customer request at this moment.';
        return out;
      }
      throw new Error('photo: unknown event ' + ev.key);
    }
  };

  function photoRoute(s, ev, c) {
    var healthy = function (id) { return s.alb.targets[id] === 'healthy'; };
    var firstHealthy = function () {
      var t = keys(s.alb.targets).filter(healthy);
      return t.length ? t[0] : null;
    };
    if (c.sticky && s.browser.cookie) {
      if (healthy(s.browser.cookie)) return { to: s.browser.cookie, why: 'sticky' };
      return { to: healthy(ev.target) ? ev.target : firstHealthy(), why: 'sticky-reselect', stale: s.browser.cookie };
    }
    if (healthy(ev.target)) return { to: ev.target, why: 'schedule' };
    return { to: firstHealthy(), why: 'fallback' };
  }

  function photoRouteText(r, s, ev) {
    var n = s.instances[r.to].name;
    if (r.why === 'sticky') return 'The browser’s stickiness cookie names ' + n + ', which is healthy, so the ALB sends ' + ev.req + ' there.';
    if (r.why === 'sticky-reselect') return 'The browser’s cookie still names ' + r.stale + ', which is no longer a healthy target. The ALB selects a new target, ' + n + ', and updates the cookie.';
    return 'The ALB sends ' + ev.req + ' to ' + n + '.';
  }

  function photoLocalHolder(s, except) {
    var ids = keys(s.instances).filter(function (id) { return id !== except && s.instances[id].files[PHOTO_FILE]; });
    return ids.length ? ids[0] : null;
  }

  function photoViewText(s, ev, c, r, found, holder) {
    var n = s.instances[r.to].name;
    if (c.storage === 's3') {
      return n + ' calls GetObject for ' + PHOTO_KEY + (found
        ? '. S3 returns the object — after a successful write, later reads return it (strong read-after-write consistency) — and the customer sees the photo. Every server reads the same object.'
        : ' and S3 has no such object.');
    }
    if (found) {
      if (r.why === 'sticky') return n + ' finds photo-17 on its own disk. The cross-server symptom is hidden — but there is still exactly one copy, on ' + n + '’s instance store.';
      return n + ' finds photo-17 on its own disk and returns it. The photo was never gone: whether the customer sees it depends on which server receives the request.';
    }
    if (holder) {
      return n + ' looks in its own /uploads, does not find photo-17 and returns 404 Not Found. photo-17 has not been deleted: it is intact on ' +
        s.instances[holder].name + '’s instance-store volume. No path exists from ' + n + ' to another instance’s instance store, so this request cannot reach the only copy. Not reachable is not the same as destroyed.';
    }
    var gone = s.erased.filter(function (e) { return e.id === 'photo-17'; })[0];
    return n + ' returns 404 Not Found — and this time photo-17 exists nowhere. Its only copy was erased at ' + gone.at +
      ' when ' + gone.instance + ' was terminated. At ' + s.accepted.at + ' the shop told the customer “saved”; that promise is broken.' +
      (r.why === 'sticky-reselect' ? ' Stickiness never protected the local copy; it only routed the browser back to it while A was healthy.' : '');
  }

  photo.copies = function (s, c) {
    var out = [];
    keys(s.instances).forEach(function (id) {
      if (s.instances[id].files[PHOTO_FILE]) out.push({ comp: id, where: s.instances[id].name + ' (' + id + ') · instance-store volume /uploads', status: s.instances[id].status });
    });
    if (c.storage === 's3' && s.bucket.objects[PHOTO_KEY]) out.push({ comp: 'bucket', where: 'S3 bucket shop-uploads · ' + PHOTO_KEY + ' (S3 Standard)', status: 'available' });
    return out;
  };

  photo.pauseCheck = function (frame, c) {
    var s = frame.state, ev = frame.event;
    var copies = photo.copies(s, c);
    var erased = s.erased.filter(function (e) { return e.id === 'photo-17'; })[0];
    var exists, holder, reach, business;
    if (!s.accepted) {
      exists = 'Not yet. The customer has not uploaded photo-17.';
      holder = 'Nothing holds it yet. ' + (c.storage === 's3' ? 'Uploads will go to the S3 bucket.' : 'Each server has its own empty /uploads on an instance-store volume.');
      reach = 'There is nothing to reach yet.';
      business = 'No. No upload has been accepted.';
    } else {
      exists = copies.length
        ? (copies[0].comp === 'bucket'
          ? 'Yes — as one object in S3 (S3 Standard stores it redundantly across multiple AZs).'
          : 'Yes — in exactly one place.' + (erased ? '' : ' Nothing has been destroyed.'))
        : 'No. Its only copy was erased at ' + erased.at + ' when ' + erased.instance + ' was terminated.';
      holder = copies.length ? copies.map(function (x) { return x.where + (x.status !== 'running' && x.status !== 'available' ? ' (instance ' + x.status + ')' : ''); }).join('; ') : 'No component. The replacement started from the machine image and never had it.';
      business = 'Yes. At ' + s.accepted.at + ' the shop accepted the upload and told the customer it was saved.' + (copies.length ? '' : ' That promise is now broken.');
      if (ev && ev.req && s.request) {
        var srvName = s.instances[s.request.server].name;
        if (ev.key === 'upload') {
          reach = 'Yes. ' + ev.req + ' is served by ' + srvName + (c.storage === 's3' ? ', which stored it in S3 before answering.' : ', which stored it on its own disk.');
        } else if (s.request.found) {
          reach = 'Yes. ' + ev.req + ' is served by ' + srvName + (c.storage === 's3' ? ', which reads the shared object from S3.' : ', which holds the copy on its own disk.');
        } else if (copies.length) {
          reach = 'No. ' + ev.req + ' is served by ' + srvName + ', which can read only its own instance store. The copy on ' + s.instances[copies[0].comp].name + '’s disk is out of reach — not deleted.';
        } else {
          reach = 'No. ' + ev.req + ' is served by ' + srvName + ', and there is no copy left to reach.';
        }
      } else if (copies.length) {
        if (c.storage === 's3') reach = 'Any healthy server can read it from S3 (role permissions and network path assumed to work).';
        else {
          var h = s.instances[copies[0].comp];
          reach = h.status === 'running'
            ? 'Only a request routed to ' + h.name + ' can reach it. A request routed to any other server cannot.'
            : 'No request can reach it now: ' + h.name + ' is ' + h.status + '. The data still exists on its volume.';
        }
      } else {
        reach = 'No request can reach it: no copy exists.';
      }
    }
    return { exists: exists, holder: holder, reach: reach, business: business };
  };

  photo.facts = function (frame, c) {
    var s = frame.state;
    var copies = photo.copies(s, c);
    var lastReq = s.request ? s.request.id + ' → ' + s.instances[s.request.server].name + ': ' + (s.request.status === 404 ? '404 Not Found' : s.request.status === 201 ? '201 Created' : '200 OK') : 'none yet';
    return [
      ['photo-17 is held by', copies.length ? copies.map(function (x) { return x.where; }).join('; ') : (s.accepted ? 'nothing — erased at ' + s.erased[0].at : 'not uploaded yet')],
      ['Last customer request', lastReq],
      ['Healthy ALB targets', keys(s.alb.targets).filter(function (t) { return s.alb.targets[t] === 'healthy'; }).join(', ') || 'none'],
      ['Stickiness cookie', s.browser.cookie ? 'names ' + s.browser.cookie : 'none'],
      ['Upload promise', s.accepted ? (copies.length ? 'kept (a copy exists)' : 'broken (no copy exists)') : 'not made yet']
    ];
  };

  /* ------------------------------------------------------------------ */
  /* Study 2 · The perfectly replicated mistake                          */
  /* ------------------------------------------------------------------ */

  function order(id, customer, item, amount, at) {
    return { id: id, customer: customer, item: item, amount: amount, placedAt: at, status: 'paid' };
  }
  var BASE_ORDERS = [
    order('order-41', 'cust-3', 'A3 prints ×2', '€22.00', '08:40:00'),
    order('order-42', 'cust-7', 'A4 prints ×5', '€30.00', '08:50:00'),
    order('order-43', 'cust-5', 'Canvas 40 cm', '€45.00', '08:55:00')
  ];
  function rowsOf(list) { var r = {}; list.forEach(function (o) { r[o.id] = clone(o); }); return r; }

  var database = {
    id: 'database',
    defaultConfig: { incident: 'writer-failure', recovery: 'failover' },
    options: {
      incident: ['writer-failure', 'mistaken-delete'],
      recovery: ['failover', 'restore']
    },
    normalize: function (c) {
      var incident = c.incident === 'mistaken-delete' ? 'mistaken-delete' : 'writer-failure';
      // A writer failure is answered by RDS's managed failover; the recovery
      // choice only exists for the mistaken deletion.
      var recovery = incident === 'writer-failure' ? 'failover' : (c.recovery === 'restore' ? 'restore' : 'failover');
      return { incident: incident, recovery: recovery };
    },
    configLabel: function (c) {
      if (c.incident === 'writer-failure') return 'Incident A: writer failure · managed failover';
      return 'Incident B: mistaken DELETE · ' + (c.recovery === 'restore' ? 'restore snap-0900 to a new DB, then cut over' : 'fail over to the standby');
    },
    initialState: function () {
      var rows = rowsOf(BASE_ORDERS);
      return {
        clock: '09:05:00',
        db: {
          'db-a': { name: 'Primary', az: 'a', role: 'primary', status: 'available', rows: clone(rows), deleted: {} },
          'db-b': { name: 'Standby', az: 'b', role: 'standby', status: 'available', rows: clone(rows), deleted: {} },
          'db-r': { name: 'orders-db-restored', az: 'a', role: 'separate', status: 'absent', rows: {}, deleted: {}, from: null }
        },
        dns: { 'orders-db': 'db-a', 'orders-db-restored': null },
        app: { endpoint: 'orders-db', connection: 'open' },
        snapshot: { id: 'snap-0900', at: '09:00:00', status: 'available', rows: clone(rows) },
        confirmed: BASE_ORDERS.map(function (o) { return { order: o.id, customer: o.customer, at: o.placedAt }; }),
        customer: { who: null, page: { kind: 'idle' } },
        operator: null
      };
    },
    schedule: function (c) {
      var ev = [
        { key: 'order-44', t: '09:10:00', label: 'cust-7 places order-44', order: order('order-44', 'cust-7', 'A4 prints ×3', '€18.00', '09:10:00') },
        { key: 'check-1', t: '09:35:00', label: 'cust-7 opens “My orders”', customer: 'cust-7' },
        { key: 'order-45', t: '09:40:00', label: 'cust-9 places order-45', order: order('order-45', 'cust-9', 'A2 poster', '€24.00', '09:40:00') },
        { key: 'check-2', t: '09:55:00', label: 'cust-7 opens “My orders” again', customer: 'cust-7' }
      ];
      if (c.incident === 'writer-failure') {
        ev.push({ key: 'incident', t: '09:30:00', label: 'The primary’s host fails' });
        ev.push({ key: 'recover-1', t: '09:31:00', label: 'RDS fails over to the standby' });
        ev.push({ key: 'recover-2', t: '09:32:00', label: 'The application reconnects' });
      } else {
        ev.push({ key: 'incident', t: '09:30:00', label: 'An operator runs a cleanup DELETE', sql: "DELETE FROM orders WHERE customer_id = 'cust-7';", meant: 'cust-77' });
        if (c.recovery === 'failover') {
          ev.push({ key: 'recover-1', t: '09:31:00', label: 'The operator forces a failover to the standby' });
          ev.push({ key: 'recover-2', t: '09:32:00', label: 'The application reconnects' });
        } else {
          ev.push({ key: 'recover-1', t: '09:31:00', label: 'The operator restores snap-0900 to a new DB instance' });
          ev.push({ key: 'recover-2', t: '09:45:00', label: 'The restored DB instance becomes available' });
          ev.push({ key: 'cutover', t: '09:50:00', label: 'The application is switched to the restored database' });
        }
      }
      return ev.sort(byTime);
    },
    apply: function (s, ev, c) {
      var out = { changes: [], cues: [], text: '', result: null };
      var target = s.dns[s.app.endpoint];

      if (ev.order) {
        var o = clone(ev.order);
        var p = s.db[target];
        p.rows[o.id] = clone(o);
        out.changes.push({ comp: target, rec: o.id, kind: 'created' });
        out.cues.push({ type: 'request', route: ['customer', 'app'], label: 'Place order' });
        out.cues.push({ type: 'request', route: ['app', target], label: 'INSERT ' + o.id });
        var standby = dbStandbyOf(s, target);
        if (standby) {
          s.db[standby].rows[o.id] = clone(o);
          out.changes.push({ comp: standby, rec: o.id, kind: 'created' });
          out.cues.push({ type: 'replication', route: [target, standby], label: 'synchronous replication · ' + o.id });
          out.cues.push({ type: 'ack', route: [standby, target], label: 'standby ack' });
        }
        out.cues.push({ type: 'ack', route: [target, 'app'], label: 'COMMIT' });
        out.cues.push({ type: 'ack', route: ['app', 'customer'], label: 'Order confirmed' });
        s.confirmed.push({ order: o.id, customer: o.customer, at: ev.t });
        s.customer = { who: o.customer, page: { kind: 'confirmed', order: o.id } };
        out.result = 'Customer ' + o.customer + ' sees: “Order confirmed — ' + o.id + '”.';
        if (standby) {
          out.text = o.customer + ' places ' + o.id + '. The INSERT reaches the primary in AZ ' + s.db[target].az + ', which sends the change to the standby in AZ ' + s.db[standby].az +
            ' (synchronous replication). Only after the standby acknowledges is the commit returned and the customer told “Order confirmed”. ' + o.id + ' now exists on both live copies' +
            (o.placedAt > s.snapshot.at ? ' — but not in snap-0900, which was taken at ' + s.snapshot.at.slice(0, 5) + '.' : '.');
        } else if (target === 'db-r') {
          out.text = o.customer + ' places ' + o.id + ' on the restored database.';
        } else {
          out.text = o.customer + ' places ' + o.id + '. It is committed on the promoted primary in AZ ' + s.db[target].az + '.';
          if (c.incident === 'writer-failure') out.text += ' The former primary in AZ a has failed, so this copy has no standby yet. Re-establishing a standby is RDS’s job and is not modelled here.';
        }
        if (c.incident === 'mistaken-delete' && c.recovery === 'restore' && s.db['db-r'].status !== 'absent' && target !== 'db-r') {
          out.text += ' The application is still connected to the original database, so the restored copy does not receive ' + o.id + '.';
        }
        return out;
      }

      if (ev.key === 'incident' && c.incident === 'writer-failure') {
        s.db['db-a'].status = 'failed';
        s.app.connection = 'broken';
        s.customer = { who: 'cust-3', page: { kind: 'error' } };
        out.changes.push({ comp: 'db-a', kind: 'status' }, { comp: 'app', kind: 'status' });
        out.cues.push({ type: 'blocked', route: ['app', 'db-a'], label: 'connection lost' });
        out.cues.push({ type: 'blocked', route: ['db-a', 'db-b'], label: 'replication stopped' });
        out.text = 'The primary’s host in AZ a fails. The application’s database connection breaks; a customer loading an order page sees “Temporarily unavailable — please retry”. order-44 still exists on the standby in AZ b: it was committed there before the failure.';
        out.result = 'Customer cust-3 sees: “Temporarily unavailable — please retry”.';
        return out;
      }

      if (ev.key === 'incident') {
        var victims = keys(s.db[target].rows).filter(function (id) { return s.db[target].rows[id].customer === 'cust-7'; }).sort();
        var sb = dbStandbyOf(s, target);
        [target, sb].forEach(function (id) {
          victims.forEach(function (v) {
            delete s.db[id].rows[v];
            s.db[id].deleted[v] = { at: ev.t };
            out.changes.push({ comp: id, rec: v, kind: 'deleted' });
          });
        });
        s.operator = { sql: ev.sql, result: 'DELETE ' + victims.length };
        out.cues.push({ type: 'request', route: ['operator', target], label: ev.sql });
        out.cues.push({ type: 'replication', route: [target, sb], label: 'synchronous replication · DELETE ' + victims.length + ' rows' });
        out.cues.push({ type: 'ack', route: [sb, target], label: 'standby ack' });
        out.cues.push({ type: 'ack', route: [target, 'operator'], label: 'DELETE ' + victims.length + ' (committed)' });
        out.changes.push({ comp: 'operator', kind: 'status' });
        out.text = 'An operator meant to remove the orders of a test account, ' + ev.meant + ', but runs a valid statement with the wrong value: ' + ev.sql +
          ' The database does exactly what it was told. The primary deletes ' + list(victims) + ' and replicates the change synchronously; the standby applies it too. Both copies are healthy and in sync — and both are wrong.';
        out.result = 'Operator console: “DELETE ' + victims.length + '”.';
        return out;
      }

      if (ev.key === 'recover-1' && c.incident === 'writer-failure') {
        s.db['db-b'].role = 'primary';
        s.db['db-a'].role = 'former primary';
        s.dns['orders-db'] = 'db-b';
        out.changes.push({ comp: 'db-b', kind: 'status' }, { comp: 'dns', kind: 'status' });
        out.cues.push({ type: 'control', route: ['rds', 'db-b'], label: 'promote standby' });
        out.cues.push({ type: 'control', route: ['dns', 'db-b'], label: 'orders-db → AZ b' });
        out.text = 'RDS detects the failure and fails over: it promotes the standby in AZ b to primary and changes the DNS record of the endpoint orders-db to point to it. This companion does not model how long that takes — it depends on conditions at the time.';
        out.result = 'Customers still see errors until the application reconnects.';
        return out;
      }

      if (ev.key === 'recover-1' && c.recovery === 'failover') {
        s.db['db-b'].role = 'primary';
        s.db['db-a'].role = 'standby';
        s.dns['orders-db'] = 'db-b';
        s.app.connection = 'broken';
        out.changes.push({ comp: 'db-b', kind: 'status' }, { comp: 'db-a', kind: 'status' }, { comp: 'dns', kind: 'status' }, { comp: 'app', kind: 'status' });
        out.cues.push({ type: 'control', route: ['rds', 'db-b'], label: 'reboot with failover' });
        out.cues.push({ type: 'control', route: ['dns', 'db-b'], label: 'orders-db → AZ b' });
        out.text = 'Hoping to undo the deletion, the operator forces a failover (reboot with failover). The standby in AZ b is promoted and the endpoint now leads to it — but it applied the same DELETE. Promotion changes which copy serves traffic, not what the copies contain. Existing connections break, as in any failover.';
        out.result = 'The application must reconnect.';
        return out;
      }

      if (ev.key === 'recover-1') {
        s.db['db-r'].status = 'creating';
        s.db['db-r'].from = s.snapshot.id;
        s.dns['orders-db-restored'] = 'db-r';
        out.changes.push({ comp: 'db-r', kind: 'launched' });
        out.cues.push({ type: 'restore', route: ['snapshot', 'db-r'], label: 'restore snap-0900 → new DB instance' });
        out.text = 'The operator restores snap-0900 into a new DB instance, orders-db-restored. A restore never overwrites the existing database; the new instance gets its own endpoint. While it is being created, the application still uses orders-db — with the wrong data.';
        out.result = 'Customers are still served from the original database.';
        return out;
      }

      if (ev.key === 'recover-2' && (c.incident === 'writer-failure' || c.recovery === 'failover')) {
        s.app.connection = 'open';
        out.changes.push({ comp: 'app', kind: 'status' });
        out.cues.push({ type: 'request', route: ['app', s.dns['orders-db']], label: 'new connection via orders-db' });
        out.cues.push({ type: 'ack', route: [s.dns['orders-db'], 'app'], label: 'connected' });
        out.text = 'The application opens a new connection to the same endpoint name, orders-db. DNS now leads to the promoted instance in AZ b. The application’s configuration did not change.';
        out.result = 'Requests can reach the database again.';
        return out;
      }

      if (ev.key === 'recover-2') {
        var r = s.db['db-r'];
        r.status = 'available';
        r.rows = clone(s.snapshot.rows);
        keys(r.rows).forEach(function (id) { out.changes.push({ comp: 'db-r', rec: id, kind: 'created' }); });
        out.changes.push({ comp: 'db-r', kind: 'status' });
        var missing = s.confirmed.filter(function (x) { return !r.rows[x.order]; }).map(function (x) { return x.order; });
        out.text = 'orders-db-restored is available. It holds exactly what snap-0900 held at 09:00: ' + list(keys(r.rows).sort()) + '. ' +
          list(missing) + (missing.length === 1 ? ' is' : ' are') + ' absent: placed after the snapshot. The application has not switched yet — restoration and cutover are separate steps.';
        out.result = 'Customers are still served from the original database.';
        return out;
      }

      if (ev.key === 'cutover') {
        s.app.endpoint = 'orders-db-restored';
        s.app.connection = 'open';
        out.changes.push({ comp: 'app', kind: 'status' });
        out.cues.push({ type: 'request', route: ['app', 'db-r'], label: 'connect via orders-db-restored' });
        out.cues.push({ type: 'ack', route: ['db-r', 'app'], label: 'connected' });
        out.text = 'After checking the restored data, the operator changes the application’s database setting to the orders-db-restored endpoint, and the application reconnects. This is a deliberate decision, separate from the restore. The original database still exists, unchanged.';
        out.result = 'Requests now go to the restored database.';
        return out;
      }

      if (ev.customer) {
        var rows = s.db[target].rows;
        var mine = keys(rows).filter(function (id) { return rows[id].customer === ev.customer; }).sort();
        s.customer = { who: ev.customer, page: { kind: 'orders', orders: mine } };
        out.changes.push({ comp: 'customer', kind: 'status' });
        out.cues.push({ type: 'request', route: ['customer', 'app'], label: 'GET /my-orders' });
        out.cues.push({ type: 'request', route: ['app', target], label: 'SELECT … WHERE customer_id = ’cust-7’' });
        out.cues.push({ type: 'ack', route: [target, 'app'], label: mine.length + ' row' + (mine.length === 1 ? '' : 's') });
        out.cues.push({ type: 'ack', route: ['app', 'customer'], label: mine.length ? list(mine) : 'no orders' });
        out.result = 'Customer cust-7 sees: ' + (mine.length ? list(mine) : '“You have no orders”') + '.';
        var confirmed7 = s.confirmed.filter(function (x) { return x.customer === 'cust-7'; }).map(function (x) { return x.order; });
        var lost7 = confirmed7.filter(function (id) { return mine.indexOf(id) < 0; });
        if (!lost7.length) {
          out.text = 'cust-7 opens “My orders” and sees ' + list(mine) + '. Every committed order is present' +
            (c.incident === 'writer-failure' ? ': the standby held the same committed data and now serves it as primary.' : '.');
        } else if (target === 'db-r') {
          var absent45 = !s.db['db-r'].rows['order-45'];
          out.text = 'cust-7 sees ' + list(mine) + ' again — restored from the 09:00 state. ' + list(lost7) + (lost7.length === 1 ? ' is' : ' are') +
            ' missing: confirmed after the snapshot was taken. ' + (absent45 ? 'cust-9’s order-45 is also absent from the restored copy; it exists only in the original database. ' : '') +
            'Both must be reconciled — the restored copy is an earlier state, not the latest correct one.';
        } else {
          out.text = 'cust-7 sees “You have no orders”. ' + (c.recovery === 'restore' ? 'The application is still connected to the original database, where the deletion stands. ' : '') +
            'Every component reports healthy; the data is wrong.' + (c.recovery === 'failover' && ev.key === 'check-2' ? ' Another current copy cannot return data that every current copy has lost.' : '');
        }
        return out;
      }
      throw new Error('database: unknown event ' + ev.key);
    }
  };

  function dbStandbyOf(s, primaryId) {
    if (primaryId !== 'db-a' && primaryId !== 'db-b') return null;
    var other = primaryId === 'db-a' ? 'db-b' : 'db-a';
    var o = s.db[other];
    return o.role === 'standby' && o.status === 'available' ? other : null;
  }

  database.locate = function (s, id) {
    var where = [];
    ['db-a', 'db-b', 'db-r'].forEach(function (d) {
      if (s.db[d].status !== 'absent' && s.db[d].rows[id]) where.push(d);
    });
    if (s.snapshot.rows[id]) where.push('snapshot');
    return where;
  };

  database.instanceName = function (s, d) {
    if (d === 'snapshot') return 'snap-0900 (09:00 snapshot)';
    var x = s.db[d];
    if (d === 'db-r') return 'orders-db-restored' + (x.status === 'creating' ? ' (being created)' : '');
    if (x.status === 'failed') return 'Failed primary (AZ ' + x.az + ', unreachable)';
    return x.role === 'primary' ? 'Primary (AZ ' + x.az + ')' : x.role === 'standby' ? 'Standby (AZ ' + x.az + ')' : 'Former primary (AZ ' + x.az + ')';
  };

  database.pauseCheck = function (frame, c) {
    var s = frame.state;
    var tracked = ['order-42', 'order-44', 'order-45'].filter(function (id) {
      return s.confirmed.some(function (x) { return x.order === id; });
    });
    // A failed instance's storage is not readable; this companion makes no
    // claim about whether its data is destroyed, so it is reported separately.
    var exists = tracked.map(function (id) {
      var w = database.locate(s, id);
      var usable = w.filter(function (d) { return d === 'snapshot' || s.db[d].status === 'available'; });
      var unreachable = w.filter(function (d) { return d !== 'snapshot' && s.db[d].status === 'failed'; });
      return id + ': ' + (usable.length ? usable.map(function (d) { return database.instanceName(s, d); }).join(', ') : (unreachable.length ? 'no usable copy' : 'nowhere')) +
        (unreachable.length ? ' (plus the failed primary in AZ a, unreachable)' : '');
    }).join(' · ');
    var target = s.dns[s.app.endpoint];
    var holder = 'Live copies: ' + ['db-a', 'db-b'].map(function (d) {
      return database.instanceName(s, d) + (s.db[d].status === 'failed' ? '' : ' — ' + keys(s.db[d].rows).length + ' orders');
    }).join('; ') + '. Historical copy: snap-0900 — ' + keys(s.snapshot.rows).length + ' orders as of 09:00.' +
      (s.db['db-r'].status !== 'absent' ? ' Separate copy: orders-db-restored (' + s.db['db-r'].status + (s.db['db-r'].status === 'available' ? ' — ' + keys(s.db['db-r'].rows).length + ' orders' : '') + ').' : '');
    var reach;
    if (s.app.connection !== 'open') {
      reach = 'No. The application’s connection is broken; requests fail until it reconnects.';
    } else if (target === 'db-r') {
      reach = 'The application now uses the endpoint orders-db-restored: the new DB instance created from snap-0900. It can read only that instance; the original database still exists but receives no application traffic.';
    } else {
      reach = 'The application uses the endpoint orders-db, which leads to ' + database.instanceName(s, target) + '. It can read only that instance. ' +
        (dbStandbyOf(s, target) ? 'The standby serves no reads before promotion. ' : '') +
        'Nobody can query snap-0900 directly: a snapshot must first be restored into a new DB instance.';
    }
    var conf = s.confirmed.filter(function (x) { return x.at > '08:45:00' && (x.customer === 'cust-7' || x.order === 'order-45'); })
      .map(function (x) { return x.order + ' (' + x.customer + ', ' + x.at.slice(0, 5) + ')'; });
    var business = 'Confirmed to customers: ' + list(conf) + '.' +
      (s.operator ? ' The 09:30 DELETE was not a business action; it was a mistake that the database executed correctly.' : '');
    return { exists: exists, holder: holder, reach: reach, business: business };
  };

  database.facts = function (frame, c) {
    var s = frame.state;
    var target = s.dns[s.app.endpoint];
    var appRows = s.db[target].rows;
    var missing = s.confirmed.filter(function (x) { return !appRows[x.order]; }).map(function (x) { return x.order; });
    var unhealthy = ['db-a', 'db-b', 'db-r'].filter(function (d) { return s.db[d].status === 'failed'; });
    var seen = s.customer.page.kind === 'orders' ? (s.customer.page.orders.length ? list(s.customer.page.orders) : 'no orders') :
      s.customer.page.kind === 'error' ? 'error page' : s.customer.page.kind === 'confirmed' ? 'order confirmation' : '—';
    return [
      ['Application uses', s.app.endpoint + ' → ' + database.instanceName(s, target) + (s.app.connection === 'open' ? '' : ' (connection broken)')],
      ['Failed instances', unhealthy.length ? unhealthy.map(function (d) { return database.instanceName(s, d); }).join(', ') : 'none'],
      ['Last customer page', s.customer.who ? s.customer.who + ': ' + seen : '—'],
      ['Confirmed orders missing from the database in use', missing.length ? list(missing) : 'none'],
      ['snap-0900', 'retained · ' + keys(s.snapshot.rows).length + ' orders as of 09:00']
    ];
  };

  /* ------------------------------------------------------------------ */
  /* Study 3 · The second payment                                        */
  /* ------------------------------------------------------------------ */

  var VISIBILITY = 30; // seconds: the SQS default visibility timeout

  var payment = {
    id: 'payment',
    defaultConfig: { design: 'plain', crash: 'after-charge' },
    options: {
      design: ['plain', 'checked', 'idempotent'],
      crash: ['none', 'before-charge', 'after-charge', 'after-delete']
    },
    normalize: function (c) {
      return {
        design: ['plain', 'checked', 'idempotent'].indexOf(c.design) >= 0 ? c.design : 'plain',
        crash: ['none', 'before-charge', 'after-charge', 'after-delete'].indexOf(c.crash) >= 0 ? c.crash : 'after-charge'
      };
    },
    configLabel: function (c) {
      var d = { plain: 'Plain charge (no idempotency)', checked: 'Worker checks a table, charges, then marks (naive)', idempotent: 'Processor idempotency key = payment ID' }[c.design];
      var k = { none: 'no crash', 'before-charge': 'W1 crashes before the charge', 'after-charge': 'W1 crashes after the charge, before deletion', 'after-delete': 'W1 crashes after confirmed deletion' }[c.crash];
      return d + ' · ' + k;
    },
    initialState: function () {
      return {
        clock: '11:59:58',
        queue: { name: 'payments', type: 'Standard', visibility: VISIBILITY, messages: {} },
        workers: {
          W1: { status: 'idle', holding: null, receipt: null },
          W2: { status: 'idle', holding: null, receipt: null }
        },
        // The processor keeps its records in its own durable store, outside the
        // workers. The key table is used only by the idempotent design.
        processor: { charges: [], keys: {}, requests: [] },
        // processed-payments table in the shop's database: used only by the
        // naive check-then-mark design.
        processed: {},
        attempts: {},
        seq: { rh: 0, ch: 0 },
        last: null
      };
    },
    schedule: function (c) {
      var ev = [
        { key: 'send-42', t: '12:00:00', label: 'Checkout sends m-42 (payment-42)', msg: payMsg('42') },
        { key: 'receive-1', t: '12:00:01', label: 'W1 receives a message', worker: 'W1', msg: 'm-42' }
      ];
      var deleted = false;
      if (c.crash === 'before-charge') {
        ev.push({ key: 'crash', t: '12:00:02', label: 'W1 crashes', worker: 'W1', point: 'before-charge' });
      } else {
        ev.push({ key: 'charge-1', t: '12:00:03', label: 'W1 asks the processor to charge payment-42', worker: 'W1', msg: 'm-42' });
        if (c.crash === 'after-charge') {
          ev.push({ key: 'crash', t: '12:00:04', label: 'W1 crashes', worker: 'W1', point: 'after-charge' });
        } else {
          if (c.design === 'checked') ev.push({ key: 'mark-1', t: '12:00:04', label: 'W1 marks payment-42 as processed', worker: 'W1', msg: 'm-42' });
          ev.push({ key: 'delete-1', t: '12:00:05', label: 'W1 deletes m-42', worker: 'W1', msg: 'm-42' });
          deleted = true;
          if (c.crash === 'after-delete') ev.push({ key: 'crash', t: '12:00:06', label: 'W1 crashes', worker: 'W1', point: 'after-delete' });
        }
      }
      if (!deleted) {
        ev.push({ key: 'expire', t: addSeconds('12:00:01', VISIBILITY), label: 'Visibility timeout of m-42 ends', msg: 'm-42' });
        ev.push({ key: 'receive-2', t: '12:00:32', label: 'W2 receives a message', worker: 'W2', msg: 'm-42' });
        ev.push({ key: 'charge-2', t: '12:00:34', label: 'W2 asks the processor to charge payment-42', worker: 'W2', msg: 'm-42' });
        if (c.design === 'checked') ev.push({ key: 'mark-2', t: '12:00:35', label: 'W2 marks payment-42 as processed', worker: 'W2', msg: 'm-42' });
        ev.push({ key: 'delete-2', t: '12:00:36', label: 'W2 deletes m-42', worker: 'W2', msg: 'm-42' });
      }
      ev.push({ key: 'send-43', t: '12:01:00', label: 'Checkout sends m-43 (payment-43)', msg: payMsg('43') });
      ev.push({ key: 'process-43', t: '12:01:01', label: 'W2 processes m-43', worker: 'W2', msg: 'm-43' });
      return ev;
    },
    apply: function (s, ev, c) {
      var out = { changes: [], cues: [], text: '', result: null };
      var w = ev.worker ? s.workers[ev.worker] : null;
      var m = ev.msg && typeof ev.msg === 'string' ? s.queue.messages[ev.msg] : null;

      if (ev.key === 'send-42' || ev.key === 'send-43') {
        var msg = clone(ev.msg);
        s.queue.messages[msg.id] = msg;
        s.attempts[msg.payment] = 0;
        out.changes.push({ comp: 'queue', rec: msg.id, kind: 'created' });
        out.cues.push({ type: 'request', route: ['checkout', 'queue'], label: 'SendMessage ' + msg.id });
        out.cues.push({ type: 'ack', route: ['queue', 'checkout'], label: 'MessageId' });
        out.text = ev.key === 'send-42'
          ? 'Checkout sends message m-42 carrying the stable payment ID payment-42 (order-42, cust-7, €49.00). The message is stored in the queue, visible to workers.'
          : 'cust-7 has placed a second, separate order — order-43, for the same amount, €49.00. Checkout sends m-43 with its own payment ID, payment-43.';
        out.result = 'No change to cust-7’s statement.';
        return out;
      }

      if (ev.key === 'receive-1' || ev.key === 'receive-2') {
        payReceive(s, ev, w, m, out);
        out.text = ev.worker + ' calls ReceiveMessage and gets ' + m.id + ' with receipt handle ' + m.receipt + (ev.key === 'receive-1' ? ' (a token for this receive, needed to delete the message)' : '') + '. ' +
          (ev.key === 'receive-1'
            ? 'Receiving does not delete: m-42 stays in the queue, hidden from other workers until ' + m.hiddenUntil + ' (visibility timeout ' + VISIBILITY + ' s). Receive count: 1. Processing attempt 1 begins.'
            : 'It is the same message carrying the same payment-42 — a new receipt handle, not a new payment. Receive count: ' + m.receiveCount + '. Processing attempt ' + s.attempts[m.payment] + ' begins, and W1’s old handle rh-1 is useless.');
        out.result = 'No change to cust-7’s statement.';
        return out;
      }

      if (ev.key === 'charge-1' || ev.key === 'charge-2') {
        var res = payCharge(s, c, ev, w, m, out);
        out.text = payChargeText(s, c, ev, res);
        out.result = payStatementLine(s);
        return out;
      }

      if (ev.key === 'mark-1' || ev.key === 'mark-2') {
        s.processed[m.payment] = { by: ev.worker, at: ev.t };
        out.changes.push({ comp: 'processed', rec: m.payment, kind: 'created' });
        out.cues.push({ type: 'request', route: [ev.worker, 'processed'], label: 'INSERT ' + m.payment + ' processed' });
        out.cues.push({ type: 'ack', route: ['processed', ev.worker], label: 'OK' });
        out.text = ev.worker + ' records payment-42 in the processed-payments table. From now on a check would find it — but the charge happened earlier, and a crash between the charge and this mark would have left no trace.';
        out.result = payStatementLine(s);
        return out;
      }

      if (ev.key === 'delete-1' || ev.key === 'delete-2') {
        payDelete(s, ev, w, m, out);
        out.text = ev.worker + ' calls DeleteMessage with ' + m.lastReceipt + ' — the receipt handle from its own receive. ' + m.id + ' is removed from the queue. This is the only step that removes it.';
        out.result = payStatementLine(s);
        return out;
      }

      if (ev.key === 'crash') {
        var rh = w.receipt;
        w.status = 'crashed';
        w.holding = null;
        w.receipt = null;
        out.changes.push({ comp: ev.worker, kind: 'status' });
        out.cues.push({ type: 'control', route: ['fault', ev.worker], label: 'process crash' });
        var mm = s.queue.messages['m-42'];
        if (ev.point === 'before-charge') {
          out.text = 'W1 crashes before calling the processor. Its memory, including receipt handle ' + rh + ', is gone. No charge exists. m-42 is still in the queue, hidden until ' + mm.hiddenUntil + '.';
        } else if (ev.point === 'after-charge') {
          out.text = 'W1 crashes after the processor confirmed the charge and before it could call DeleteMessage' + (c.design === 'checked' ? ' or mark payment-42 as processed' : '') +
            '. Its memory, including receipt handle ' + rh + ', is gone. The charge already happened at the processor. m-42 is still in the queue, hidden until ' + mm.hiddenUntil + '; SQS cannot know that the work was done.';
        } else {
          out.text = 'W1 crashes after DeleteMessage succeeded. The message is gone and the payment is complete, so the crash changes nothing for payment-42.' +
            ' (A Standard queue is at-least-once: in rare cases a copy can be delivered again even after a successful delete. The idempotent design would absorb that repeat too; it is not modelled here.)';
        }
        out.result = payStatementLine(s);
        return out;
      }

      if (ev.key === 'expire') {
        m.state = 'visible';
        m.hiddenUntil = null;
        m.receipt = null;
        out.changes.push({ comp: 'queue', rec: m.id, kind: 'updated' });
        out.text = 'At ' + ev.t + ' the visibility timeout ends. m-42 was never deleted, so it becomes visible again (receive count stays ' + m.receiveCount + '). SQS cannot know whether W1 charged; it only knows the message was not deleted.';
        out.result = payStatementLine(s);
        return out;
      }

      if (ev.key === 'process-43') {
        // Compound step: the receive / charge / delete mechanism was shown in
        // detail for m-42; for m-43 the same three operations run in sequence.
        payReceive(s, ev, w, m, out);
        var r43 = payCharge(s, c, ev, w, m, out);
        if (c.design === 'checked' && r43.result !== 'skipped') {
          s.processed[m.payment] = { by: ev.worker, at: ev.t };
          out.changes.push({ comp: 'processed', rec: m.payment, kind: 'created' });
        }
        payDelete(s, ev, w, m, out);
        out.text = 'W2 receives m-43, asks the processor to charge payment-43 and deletes m-43. ' +
          (c.design === 'idempotent'
            ? 'The key payment-43 has never been seen, so the processor charges it: ' + r43.charge + '. Idempotency suppresses repeats of the same logical payment, not new payments that look alike.'
            : 'The processor charges it: ' + r43.charge + '. A new payment with its own ID always executes.');
        out.result = payStatementLine(s);
        return out;
      }
      throw new Error('payment: unknown event ' + ev.key);
    }
  };

  function payMsg(n) {
    return { id: 'm-' + n, payment: 'payment-' + n, order: 'order-' + n, customer: 'cust-7', amount: '€49.00', state: 'visible', receiveCount: 0, hiddenUntil: null, receipt: null, lastReceipt: null, deletedAt: null };
  }

  function payReceive(s, ev, w, m, out) {
    m.state = 'in-flight';
    m.receiveCount += 1;
    m.receipt = 'rh-' + (++s.seq.rh);
    m.lastReceipt = m.receipt;
    m.hiddenUntil = addSeconds(ev.t, VISIBILITY);
    w.status = 'processing';
    w.holding = m.id;
    w.receipt = m.receipt;
    s.attempts[m.payment] = (s.attempts[m.payment] || 0) + 1;
    out.changes.push({ comp: 'queue', rec: m.id, kind: 'updated' }, { comp: ev.worker, kind: 'status' });
    out.cues.push({ type: 'request', route: [ev.worker, 'queue'], label: 'ReceiveMessage' });
    out.cues.push({ type: 'ack', route: ['queue', ev.worker], label: m.id + ' + ' + m.receipt });
  }

  function payDelete(s, ev, w, m, out) {
    m.state = 'deleted';
    m.deletedAt = ev.t;
    m.receipt = null;
    m.hiddenUntil = null;
    w.status = 'idle';
    w.holding = null;
    w.receipt = null;
    out.changes.push({ comp: 'queue', rec: m.id, kind: 'deleted' }, { comp: ev.worker, kind: 'status' });
    out.cues.push({ type: 'request', route: [ev.worker, 'queue'], label: 'DeleteMessage ' + m.lastReceipt });
    out.cues.push({ type: 'ack', route: ['queue', ev.worker], label: 'deleted' });
  }

  function payCharge(s, c, ev, w, m, out) {
    var pay = m.payment;
    if (c.design === 'checked') {
      var marked = !!s.processed[pay];
      out.cues.push({ type: 'request', route: [ev.worker, 'processed'], label: 'SELECT ' + pay });
      out.cues.push({ type: 'ack', route: ['processed', ev.worker], label: marked ? 'found' : 'not found' });
      if (marked) {
        s.last = { payment: pay, result: 'skipped' };
        return { result: 'skipped' };
      }
    }
    var key = c.design === 'idempotent' ? pay : null;
    s.processor.requests.push({ n: s.processor.requests.length + 1, worker: ev.worker, payment: pay, key: key, at: ev.t });
    out.cues.push({ type: 'request', route: [ev.worker, 'processor'], label: 'charge ' + pay + ' €49.00' + (key ? ' · key ' + key : '') });
    var res;
    if (key && s.processor.keys[key]) {
      // Atomic lookup in the processor's durable store: the key already maps
      // to an outcome, so the stored outcome is returned and nothing is charged.
      res = { result: 'existing', charge: s.processor.keys[key] };
      out.changes.push({ comp: 'processor', rec: key, kind: 'matched' });
    } else {
      var id = 'ch-' + (++s.seq.ch);
      var earlier = s.processor.charges.filter(function (x) { return x.payment === pay; }).length;
      s.processor.charges.push({ id: id, payment: pay, amount: m.amount, customer: m.customer, at: ev.t, duplicate: earlier > 0 });
      // In the idempotent design the key and the outcome are written in the
      // same atomic step (teaching assumption: one processor transaction).
      if (key) s.processor.keys[key] = id;
      out.changes.push({ comp: 'processor', rec: id, kind: earlier > 0 ? 'duplicate' : 'created' });
      if (key) out.changes.push({ comp: 'processor', rec: key, kind: 'created' });
      res = { result: 'new', charge: id, duplicate: earlier > 0 };
    }
    out.cues.push({ type: 'ack', route: ['processor', ev.worker], label: res.result === 'existing' ? 'already done: ' + res.charge : 'charged: ' + res.charge });
    s.last = { payment: pay, result: res.result, charge: res.charge };
    return res;
  }

  function payChargeText(s, c, ev, res) {
    var who = ev.worker;
    var pre = '';
    if (c.design === 'checked') pre = who + ' first checks the processed-payments table: payment-42 is ' + (res.result === 'skipped' ? 'already marked, so it skips the charge.' : 'not marked. ');
    if (res.result === 'skipped') return pre;
    if (res.result === 'existing') {
      return who + ' sends the same idempotency key, payment-42. The processor finds the key and returns the stored result — ' + res.charge +
        ' — without charging again. Two processing attempts; one completed charge.';
    }
    if (res.duplicate) {
      if (c.design === 'checked') {
        return pre + who + ' asks the processor to charge payment-42, and the processor records a second charge, ' + res.charge + '. cust-7 has now paid twice for one order. ' +
          'Checking a separate table first only moved the window: the crash came between the charge and the mark, so the check found nothing.';
      }
      return who + ' asks the processor to charge payment-42. Nothing in the request lets the processor recognise a repeat, so it records a second charge, ' + res.charge +
        '. cust-7 has now paid twice for one order.';
    }
    var first = ev.key === 'charge-2' ? ' This is the first charge: the earlier attempt crashed before reaching the processor.' : '';
    if (c.design === 'idempotent') {
      return who + ' asks the processor to charge payment-42, passing payment-42 as the idempotency key (a stable ID that lets the processor recognise a repeat). In one atomic step the processor records charge ' + res.charge +
        ' together with the key (payment-42 → ' + res.charge + '), then confirms. The business effect has happened.' + first;
    }
    return pre + who + ' asks the processor to charge payment-42. The processor records charge ' + res.charge + ' and confirms. The business effect has happened: cust-7 has paid.' +
      (ev.key === 'charge-1' ? ' The queue does not know — m-42 is still there, hidden.' : '') + first;
  }

  function payStatementLine(s) {
    var mine = s.processor.charges.filter(function (x) { return x.customer === 'cust-7'; });
    if (!mine.length) return 'cust-7’s statement: no charges yet.';
    return 'cust-7’s statement: ' + mine.map(function (x) { return x.amount + ' (' + x.payment + (x.duplicate ? ', DUPLICATE' : '') + ')'; }).join(', ') + '.';
  }

  payment.counts = function (s, pay) {
    return {
      attempts: s.attempts[pay] || 0,
      charges: s.processor.charges.filter(function (x) { return x.payment === pay; }).length
    };
  };

  function payMsgState(m) {
    if (!m) return 'not sent yet';
    return m.state === 'in-flight' ? 'in the queue, in flight — hidden until ' + m.hiddenUntil + ' (receive count ' + m.receiveCount + ')' :
      m.state === 'visible' ? 'in the queue, visible (receive count ' + m.receiveCount + ')' : 'deleted from the queue at ' + m.deletedAt;
  }

  payment.pauseCheck = function (frame, c) {
    var s = frame.state, ev = frame.event;
    // Answer about the payment the current event concerns.
    var n = ev && ev.msg && (ev.msg === 'm-43' || ev.msg.id === 'm-43') ? '43' : '42';
    var pay = 'payment-' + n, mid = 'm-' + n;
    var m = s.queue.messages[mid];
    var mine = s.processor.charges.filter(function (x) { return x.payment === pay; });
    var exists, holder, reach, business;
    if (!m) {
      return {
        exists: 'Nothing yet: ' + pay + ' has not been sent to the queue.',
        holder: 'No component holds a record of ' + pay + ' yet.',
        reach: 'No worker can receive anything yet.',
        business: 'No. ' + pay + ' has not been charged.'
      };
    }
    exists = mid + ': ' + payMsgState(m) + '. Charges for ' + pay + ': ' + (mine.length ? mine.map(function (x) { return x.id; }).join(', ') : 'none') + '.' +
      (n === '43' ? ' (m-42: ' + payMsgState(s.queue.messages['m-42']) + '.)' : '');
    var workerNotes = keys(s.workers).map(function (k) {
      var x = s.workers[k];
      return k + ' ' + x.status + (x.holding ? ' (holds ' + x.receipt + ' for ' + x.holding + ' in memory)' : '');
    }).join('; ');
    holder = (m.state === 'deleted' ? 'The queue no longer holds ' + mid : 'The SQS queue holds ' + mid + ' (not the worker)') +
      '. The processor’s durable ledger, outside the workers, holds ' +
      (s.processor.charges.length ? s.processor.charges.map(function (x) { return x.id; }).join(', ') : 'no charges') +
      (c.design === 'idempotent' && keys(s.processor.keys).length ? ' and the idempotency records ' + keys(s.processor.keys).map(function (k) { return k + ' → ' + s.processor.keys[k]; }).join(', ') : '') +
      (c.design === 'checked' && keys(s.processed).length ? '; the processed-payments table holds ' + keys(s.processed).join(', ') : '') + '. Workers: ' + workerNotes + '.';
    var k = ev ? ev.key : '';
    if (k === 'receive-1') {
      reach = 'Only W1 can work on m-42 now: other workers’ receives cannot see it until ' + m.hiddenUntil + '.';
    } else if (k === 'receive-2') {
      reach = 'Yes — W2 can receive m-42 only because the visibility timeout ended without a delete.';
    } else if ((k === 'charge-1' || k === 'charge-2') && s.last && s.last.result === 'existing') {
      reach = 'Yes. The request carries key payment-42, which leads the processor to its stored record payment-42 → ' + s.last.charge + '.';
    } else if (k === 'charge-2' && mine.length > 1) {
      reach = 'No. Nothing in W2’s request lets the processor connect it to ' + mine[0].id + '; it looks like a new payment.';
    } else if (k === 'charge-1' || k === 'charge-2') {
      reach = 'The charge request reaches the processor. ' + (c.design === 'idempotent' ? 'No record exists yet for key payment-42, so a new charge is made and the key is stored with it.' : 'It holds no earlier charge for payment-42, so a new charge is made.');
    } else if (k === 'crash' || k === 'expire') {
      reach = m.state === 'deleted' ? 'No worker can receive m-42 again in this model: it was deleted.' :
        m.state === 'visible' ? 'Yes — any worker’s next ReceiveMessage can get m-42 now.' : 'Not yet: m-42 stays hidden until ' + m.hiddenUntil + '; then any worker can receive it.';
    } else if (k === 'delete-1' || k === 'delete-2') {
      reach = 'No: a deleted message is not delivered again (in a Standard queue, a rare duplicate delivery remains possible).';
    } else if (k === 'send-43') {
      reach = 'Any idle worker can receive m-43. It is a different message for a different payment.';
    } else if (k === 'process-43') {
      reach = c.design === 'idempotent'
        ? 'Yes. The request carries key payment-43, which matches no stored record, so the processor charges it.'
        : 'Yes. The charge request for payment-43 reaches the processor, which charges it.';
    } else {
      reach = m.state === 'in-flight' ? 'Only the worker holding the current receipt handle can delete it; other workers cannot see it until ' + m.hiddenUntil + '.' :
        m.state === 'visible' ? 'Any worker can receive it.' : 'It is gone from the queue.';
    }
    business = mine.length
      ? 'Yes — ' + pay + ' was charged at ' + mine[0].at + (mine.length > 1 ? ', and charged AGAIN at ' + mine.slice(1).map(function (x) { return x.at; }).join(', ') + '.' : '.') +
        (m.state !== 'deleted' ? ' The queue still holds the work item: completing the effect and deleting the message are separate steps.' : '')
      : 'No. ' + pay + ' has not been charged.';
    return { exists: exists, holder: holder, reach: reach, business: business };
  };

  payment.facts = function (frame, c) {
    var s = frame.state;
    var m = s.queue.messages['m-42'];
    var n42 = payment.counts(s, 'payment-42');
    var n43 = payment.counts(s, 'payment-43');
    return [
      ['m-42 in the queue', !m ? 'not sent' : m.state === 'in-flight' ? 'in flight (hidden until ' + m.hiddenUntil + ')' : m.state === 'visible' ? 'visible' : 'deleted ' + m.deletedAt],
      ['Processing attempts for payment-42', String(n42.attempts)],
      ['Completed charges for payment-42', String(n42.charges)],
      ['Completed charges for payment-43', s.queue.messages['m-43'] ? String(n43.charges) : 'not sent yet'],
      ['cust-7 has paid', '€' + (49 * s.processor.charges.filter(function (x) { return x.customer === 'cust-7'; }).length).toFixed(2)]
    ];
  };

  /* ------------------------------------------------------------------ */
  /* Generic run machinery                                               */
  /* ------------------------------------------------------------------ */

  var STUDIES = { photo: photo, database: database, payment: payment };

  function study(id) {
    var S = STUDIES[id];
    if (!S) throw new Error('Unknown study ' + id);
    return S;
  }

  function normalize(id, config) {
    var S = study(id);
    var merged = {};
    keys(S.defaultConfig).forEach(function (k) { merged[k] = S.defaultConfig[k]; });
    keys(config || {}).forEach(function (k) { merged[k] = config[k]; });
    return S.normalize(merged);
  }

  function configKey(id, config) {
    var c = normalize(id, config);
    return keys(c).sort().map(function (k) { return k + '=' + c[k]; }).join('&');
  }

  function buildRun(id, config) {
    var S = study(id);
    var c = normalize(id, config);
    var state = S.initialState(c);
    var events = S.schedule(c);
    var frames = [{ index: 0, event: null, state: clone(state), changes: [], cues: [], text: '', result: null }];
    events.forEach(function (ev, i) {
      var next = clone(state);
      var out = S.apply(next, ev, c);
      next.clock = ev.t;
      state = next;
      frames.push({ index: i + 1, event: clone(ev), state: clone(state), changes: out.changes, cues: out.cues, text: out.text, result: out.result });
    });
    return { study: id, config: c, key: configKey(id, c), label: S.configLabel(c), events: events, frames: frames };
  }

  // The earliest frame a replay must restart from when switching from run a to
  // run b: the state just before the first event whose definition, procedure
  // (requests, replication, acknowledgements), narration or resulting state
  // differs. Everything before it is identical in both runs by construction.
  function outcome(f) {
    return JSON.stringify([f.event, f.state, f.cues, f.changes, f.text, f.result]);
  }
  function firstDivergence(a, b) {
    if (JSON.stringify(a.frames[0].state) !== JSON.stringify(b.frames[0].state)) return 0;
    var n = Math.min(a.events.length, b.events.length);
    for (var i = 0; i < n; i++) {
      if (outcome(a.frames[i + 1]) !== outcome(b.frames[i + 1])) return i;
    }
    return n;
  }

  // Equivalent events across two runs share a key. Returns the aligned list in
  // the order of run b, with run a's own events merged in where they have no
  // counterpart.
  function align(a, b) {
    var seen = {};
    var rows = [];
    var idx = function (run, key) {
      for (var i = 0; i < run.events.length; i++) if (run.events[i].key === key) return i + 1;
      return null;
    };
    b.events.concat(a.events).slice().sort(byTime).forEach(function (ev) {
      if (seen[ev.key]) return;
      seen[ev.key] = true;
      rows.push({ key: ev.key, a: idx(a, ev.key), b: idx(b, ev.key) });
    });
    return rows;
  }

  // The frame of a run that best represents an event key: the event itself, or
  // the latest earlier frame when the run has no equivalent event.
  function frameAt(run, key, t) {
    for (var i = 0; i < run.events.length; i++) if (run.events[i].key === key) return { frame: run.frames[i + 1], exact: true };
    var best = run.frames[0];
    for (var j = 0; j < run.events.length; j++) if (run.events[j].t <= t) best = run.frames[j + 1];
    return { frame: best, exact: false };
  }

  function pauseCheck(id, run, index) {
    return study(id).pauseCheck(run.frames[index], run.config);
  }

  function facts(id, run, index) {
    return study(id).facts(run.frames[index], run.config);
  }

  var api = {
    version: '1.0.0',
    studies: keys(STUDIES),
    study: study,
    normalize: normalize,
    configKey: configKey,
    configLabel: function (id, c) { return study(id).configLabel(normalize(id, c)); },
    defaultConfig: function (id) { return clone(study(id).defaultConfig); },
    options: function (id) { return clone(study(id).options); },
    buildRun: buildRun,
    firstDivergence: firstDivergence,
    align: align,
    frameAt: frameAt,
    pauseCheck: pauseCheck,
    facts: facts,
    helpers: { addSeconds: addSeconds, list: list },
    photo: { copies: photo.copies },
    database: { locate: database.locate, instanceName: database.instanceName },
    payment: { counts: payment.counts }
  };

  root.WhatSurvivesModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
