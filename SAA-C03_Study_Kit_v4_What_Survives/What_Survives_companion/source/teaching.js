/*
 * AWS — What Survives · teaching data
 *
 * Guided scripts, predictions, terms, contextual notes, transfer questions,
 * assumptions and the source map. Plain text only: the interface inserts these
 * strings with textContent.
 */
(function (root) {
  'use strict';

  var GUIDE = '../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html';
  var CHECKED = '2026-10-06';

  var T = {
    title: 'AWS — What Survives',
    subtitle: 'Three visual studies of state, failure and recovery.',
    version: '1.0',
    guideHref: GUIDE,
    guideName: 'SAA-C03 One-Guide Study Kit, Revision 4 (6 October 2026)',
    checked: CHECKED,
    pauseQuestions: [
      ['exists', 'What still exists?'],
      ['holder', 'Which component holds it?'],
      ['reach', 'Can this request reach or use it?'],
      ['business', 'Has the business action already happened?']
    ],
    stages: ['Observe', 'Predict', 'Reveal', 'Rewind', 'Change', 'Compare', 'Transfer'],
    about: [
      'One small online print shop, shop.example, replayed through the same events. Pause at any event, change one design decision, rewind, and compare equivalent moments of the two runs.',
      'This is an optional companion. It is not part of the frozen v4 study route, and its teaching effect has not been tested.'
    ],
    pilot: 'Taking part in the beginner pilot? Using this companion is an additional teaching condition. Record it in your study log (which studies, when, roughly how long) and report it with your results, so that results from this extended route are not attributed to the original guide alone.',
    studies: {}
  };

  /* ------------------------------------------------------------------ */
  T.studies.photo = {
    number: 1,
    title: 'The missing photograph',
    lede: 'A customer uploads a photo and the shop says “saved”. Where does the photo actually live — and what is left when a server is replaced?',
    route: 'Use after Day 4 (§6: compute, load balancing and scaling).',
    guide: [
      ['w1', 'W1 · Adding instances is not enough'],
      ['s6-3', '§6.3 · Auto Scaling and application state'],
      ['s7-1', '§7.1 · Choose the interface first'],
      ['s7-5', '§7.5 · EBS, EFS and FSx']
    ],
    terms: [
      ['Application Load Balancer (ALB)', 'Sends each HTTP request to one healthy target — here, an EC2 instance.'],
      ['EC2 instance', 'A virtual server.'],
      ['Availability Zone (AZ)', 'An isolated group of data centres inside an AWS Region.'],
      ['Instance store', 'Disk storage attached to the physical host of one instance. Its data survives a reboot, but not stop, hibernation or termination.'],
      ['Auto Scaling group', 'Keeps a desired number of instances running and replaces instances that fail their health checks.'],
      ['S3 Standard', 'Object storage reached through an API. It stores objects redundantly across multiple AZs in the Region.'],
      ['Object API', 'The application writes and reads whole objects by key (PutObject, GetObject) over HTTPS instead of using a local folder.'],
      ['Stickiness', 'The ALB sets a cookie and keeps sending that browser to the same target while the target stays healthy.']
    ],
    decisions: [
      { key: 'storage', question: 'Where does the application store uploads?', options: [
        ['local', 'On each server’s instance-store volume (/uploads)'],
        ['s3', 'In an S3 Standard bucket, through object APIs']
      ] },
      { key: 'sticky', question: 'ALB stickiness', options: [
        [false, 'Off'],
        [true, 'On — the tempting shortcut']
      ] }
    ],
    start: function (c) {
      var setting = 'Two EC2 instances (virtual servers) run the same shop application behind an Application Load Balancer (ALB), which sends each request to one healthy server. Server A is in Availability Zone (AZ) a and Server B in AZ b \u2014 separate groups of data centres. An Auto Scaling group keeps two servers running and replaces any that fail their health checks.';
      var s = c.storage === 's3'
        ? setting + ' Design for this run: the application stores uploads in the S3 bucket shop-uploads (S3 Standard: object storage reached through an API, kept redundantly across multiple AZs). It writes and reads whole objects with PutObject and GetObject and keeps nothing indispensable on its own disks. Assumed to work: each instance\u2019s IAM role allows those calls on the bucket, and the network path to S3 is available.'
        : setting + ' Storage assumption for this run: each server saves uploads to /uploads on its own instance-store volume \u2014 disk attached to that instance\u2019s physical host. Instance-store data survives a reboot, but not stop, hibernation or termination.';
      if (c.sticky) s += ' Stickiness is on: the ALB sets a cookie and keeps sending this browser to the same server while that server is healthy.';
      return s + ' The ALB’s target for each request is fixed by this replay’s schedule, so every replay is identical. Clock times are illustrative.';
    },
    script: [
      { id: 'observe', stage: 'Observe', config: { storage: 'local', sticky: false },
        intro: 'Step through the morning. Watch where photo-17 is written — and which server each request reaches.',
        predict: {
          1: 'The ALB sends the customer’s next request to Server B. What will the customer see? At that moment, does photo-17 still exist — and where?',
          3: 'Server A is about to fail its health checks, and the Auto Scaling group will replace it with a new, healthy instance. Will the replacement be able to return photo-17?'
        },
        next: { label: 'Rewind to before the upload and store uploads in S3', to: 's3' } },
      { id: 's3', stage: 'Change', config: { storage: 's3', sticky: false }, rewindFrom: 'observe',
        intro: 'Same schedule, same failure, one changed decision. Nothing carries over from the previous run: the photo that was on Server A is not migrated anywhere — the replay starts before the upload.',
        predict: {
          6: 'Same failure, same replacement as before. Will req-4 find photo-17 this time?'
        },
        next: { label: 'Compare the two runs', to: 'cmp-s3' } },
      { id: 'cmp-s3', stage: 'Compare', compare: ['observe', 's3'], focus: 'view-1',
        intro: 'Equivalent events, side by side. What differs — the servers, or where the photo lives?',
        next: { label: 'Try a tempting shortcut: stickiness', to: 'cmp-sticky' } },
      { id: 'cmp-sticky', stage: 'Compare', compare: [{ storage: 'local', sticky: false }, { storage: 'local', sticky: true }], focus: 'view-1',
        intro: 'Back to local storage, now with ALB stickiness on. Compare 10:01 — then 10:20.',
        next: { label: 'Transfer question', to: 'transfer' } },
      { id: 'transfer', stage: 'Transfer', intro: 'Apply the same mechanism to a situation the replay did not show.' }
    ],
    notes: [
      { when: function (x) { return x.key === 'view-1' && x.c.storage === 'local' && !x.c.sticky; },
        title: 'Not reachable is not destroyed',
        text: 'A 404 says that this server could not find the file. It does not say the file is gone. Before concluding that data was lost, find which component holds it and whether this request has a path to it.' },
      { when: function (x) { return x.key === 'replace' && x.c.storage === 'local'; },
        title: 'Storage assumption: instance store',
        text: 'If /uploads were on an EBS volume instead, a root volume is deleted at termination by default. A separate EBS volume can be kept, but it attaches to one instance in one AZ, and the replacement would not mount it automatically. Neither gives Server B the photo (guide §6.1, §7.5).' },
      { when: function (x) { return x.c.sticky && (x.key === 'view-1' || x.key === 'view-3'); },
        title: 'Stickiness changes routing, not storage',
        text: 'It hides the cross-server symptom while Server A is healthy. It copies nothing. When A is replaced, the ALB picks a new target and the only copy is already gone.' },
      { when: function (x) { return x.key === 'upload' && x.c.storage === 's3'; },
        title: 'Why this upload survives',
        text: 'The customer is told “saved” only after S3 has stored the object. The servers become replaceable because nothing indispensable lives on them.' }
    ],
    transfer: {
      question: 'Fresh situation — the shop adds a print-preparation tool supplied as a closed program. It works only with ordinary files: it watches /srv/print-jobs/incoming, writes finished files to /srv/print-jobs/done and renames files as it goes. It cannot call S3. It runs on every server in the same two-AZ Auto Scaling group, and a job started on one server may be finished on another. What would you change so that every server — including a fresh replacement — sees the same job files? What still has to be configured?',
      answer: [
        'Mount one Regional Amazon EFS file system at /srv/print-jobs on every instance. EFS is a shared NFS file system: every server sees the same directory tree, so a job written by one server can be renamed or finished by another, and file operations work unchanged. A Regional file system stores data redundantly across multiple AZs, so the files survive the loss of an instance or of one AZ.',
        'Still to configure: a mount target in each AZ the servers use; security groups that allow NFS (TCP 2049) from the instances to the mount targets; and mounting at boot from the launch template, so a replacement mounts the file system before the ALB sends it work. POSIX permissions — and optionally EFS access points — still control what the tool may change.',
        'Not equivalent: instance store (lost with the instance), a separate EBS volume per server (separate copies, attached within one AZ), EFS One Zone (one-AZ failure boundary). Where the application can adopt object APIs, S3 remains the simpler home for immutable uploads (guide W1, W16, §7.5).'
      ]
    },
    assumptions: [
      'Clock times are illustrative, not AWS timings.',
      'The ALB’s target for each request is fixed by the schedule; a real ALB chooses with its routing algorithm.',
      'In the local design, /uploads is on an instance-store volume.',
      'In the S3 design, each instance’s IAM role allows PutObject and GetObject on the bucket, and the network path to S3 works.',
      'The Auto Scaling group uses ELB health checks, so it replaces an instance that the ALB reports unhealthy. Grace periods and thresholds are not modelled.',
      'Launching the replacement succeeds: EC2 capacity, quotas and subnet addresses are assumed available.'
    ],
    notModelled: 'Retries, DNS and TLS, caching or CloudFront, the ALB’s real routing algorithm, health-check timing, and how long launching takes.'
  };

  /* ------------------------------------------------------------------ */
  T.studies.database = {
    number: 2,
    title: 'The perfectly replicated mistake',
    lede: 'A synchronous standby protects committed orders from a failed server. Watch what it does with a valid mistake.',
    route: 'Use after Day 6 (§8: databases and caching).',
    guide: [
      ['s8-2', '§8.2 · RDS: engine, HA, replicas and recovery'],
      ['s11-1', '§11.1 · RPO and RTO are requirements, not service names']
    ],
    deployment: 'Amazon RDS for PostgreSQL · Multi-AZ DB instance deployment: one primary (the writer) and one synchronous standby in another AZ. The standby serves no reads; it exists to take over.',
    terms: [
      ['Amazon RDS', 'A managed relational database service.'],
      ['Multi-AZ DB instance', 'A primary DB instance plus a standby in another AZ. The standby is not readable before it is promoted.'],
      ['Synchronous replication', 'A write is confirmed only after the standby has it too.'],
      ['Failover', 'RDS promotes the standby to primary and points the endpoint’s DNS name at it. Clients reconnect.'],
      ['Endpoint', 'The DNS name the application connects to (here, orders-db).'],
      ['DB snapshot', 'A retained copy of the DB instance’s storage at one moment. It cannot be queried; it is restored into a new DB instance.'],
      ['Cutover', 'Switching the application to a different database.'],
      ['Point-in-time recovery (PITR)', 'With automated backups, restoring to a chosen moment within the retention window — also into a new DB instance.']
    ],
    decisions: [
      { key: 'incident', question: 'Incident at 09:30', options: [
        ['writer-failure', 'A · The primary’s host fails'],
        ['mistaken-delete', 'B · A valid but mistaken DELETE']
      ] },
      { key: 'recovery', question: 'Response to incident B', onlyWhen: { incident: 'mistaken-delete' },
        disabledNote: 'Incident A is answered by RDS’s managed failover.', options: [
        ['failover', 'Fail over to the standby'],
        ['restore', 'Restore snap-0900 to a new DB, then cut over']
      ] }
    ],
    start: function () {
      return 'The shop\u2019s orders live in Amazon RDS (a managed relational database service) for PostgreSQL, deployed as a Multi-AZ DB instance: a primary in AZ a, which takes every write, and a standby in AZ b. Replication is synchronous: a write is confirmed only after the standby has it too. The standby serves no reads; it exists to take over (failover). Orders 41\u201343 exist on both copies. A manual DB snapshot \u2014 a retained copy of the database as it was at one moment \u2014 named snap-0900 completed at 09:00 and holds the same three orders. The application connects through the endpoint orders-db, a DNS name that currently leads to the primary. Clock times are illustrative.';
    },
    script: [
      { id: 'a', stage: 'Observe', config: { incident: 'writer-failure' },
        intro: 'Incident A. Watch where order-44 is written, then what happens when the primary fails.',
        predict: {
          1: 'At 09:30 the primary’s host fails. Which copy still holds order-44, committed at 09:10 — and can the application reach it?'
        },
        next: { label: 'Replay the same morning with incident B', to: 'b' } },
      { id: 'b', stage: 'Predict', config: { incident: 'mistaken-delete', recovery: 'failover' }, rewindFrom: 'a',
        intro: 'Same starting data, same workload, same deployment. Only the 09:30 incident changes, so the replay restarts just before it.',
        predict: {
          1: 'At 09:30 an operator’s valid DELETE removes cust-7’s orders. When it commits, which copies still hold order-42 and order-44?',
          2: 'The operator decides to fail over to the standby. Will cust-7’s orders come back?'
        },
        next: { label: 'Compare incident A and incident B', to: 'cmp-ab' } },
      { id: 'cmp-ab', stage: 'Compare', compare: ['a', 'b'], focus: 'check-1',
        intro: 'Same deployment, two incidents. Which one did the standby solve?',
        next: { label: 'Rewind and change one decision: restore snap-0900', to: 'restore' } },
      { id: 'restore', stage: 'Change', config: { incident: 'mistaken-delete', recovery: 'restore' }, rewindFrom: 'b',
        intro: 'Rewound to 09:30, just after the DELETE committed — the earliest event this decision affects. The DELETE itself stays in the schedule.',
        predict: {
          7: 'After cutover to the copy restored from snap-0900, which of cust-7’s orders will the application show? What about cust-9’s order-45?'
        },
        next: { label: 'Compare: another current copy vs an earlier state', to: 'cmp-restore' } },
      { id: 'cmp-restore', stage: 'Compare', compare: ['b', 'restore'], focus: 'check-2',
        intro: 'Another current copy versus an earlier recoverable state.',
        next: { label: 'Transfer question', to: 'transfer' } },
      { id: 'transfer', stage: 'Transfer', intro: 'Apply the same mechanism to a situation the replay did not show.' }
    ],
    notes: [
      { when: function (x) { return x.index === 0 || x.key === 'order-44'; },
        title: 'Readable copies are a different deployment',
        text: 'A read replica is an asynchronous, readable copy. An RDS Multi-AZ DB cluster (MySQL or PostgreSQL) has a writer and two readable standbys in three AZs with semisynchronous replication. In this Multi-AZ DB instance deployment the standby serves no reads before promotion (guide §8.2).' },
      { when: function (x) { return x.key === 'incident' && x.c.incident === 'writer-failure'; },
        title: 'Steps, not durations',
        text: 'AWS describes failover as automatic, with a duration that depends on conditions at the time. This replay shows the order of the steps only.' },
      { when: function (x) { return x.key === 'incident' && x.c.incident === 'mistaken-delete'; },
        title: 'Replication copies changes, including mistakes',
        text: 'Synchronous replication guarantees that the standby has every committed change. A committed DELETE is a committed change. High availability and recovery from a bad change are different problems (guide §8.2, §11.1).' },
      { when: function (x) { return x.key === 'recover-2' && x.c.recovery === 'restore'; },
        title: 'Restore is not cutover',
        text: 'A restore creates a separate database. Nothing changes for customers until someone checks it and switches the application — a decision with its own risks.' },
      { when: function (x) { return x.key === 'check-2' && x.c.recovery === 'restore'; },
        title: 'Narrowing the gap: point-in-time recovery',
        text: 'With automated backups enabled, RDS can restore to a chosen moment within the retention window — for example 09:29 — also into a new DB instance. That would keep order-44, but anything after the chosen moment still needs reconciling. The age of the state you restore bounds the data you can get back: that is this plan’s recovery point (guide §8.2, §11.1).' }
    ],
    transfer: {
      question: 'Fresh situation — the shop’s product catalogue runs on its own RDS for PostgreSQL Multi-AZ DB instance with automated backups (7-day retention) and a manual snapshot every night at 01:00. At 14:20 a faulty release runs an UPDATE that sets every product price to 0. Staff notice at 14:50; between 14:20 and 14:50 they legitimately added two new products. Would failing over help? Which earlier state would you restore, where does it go, and what happens to the two new products?',
      answer: [
        'Failing over does not help: the UPDATE was committed and synchronously applied to the standby, so both live copies hold zero prices.',
        'Restore an earlier state instead. With automated backups enabled, point-in-time recovery can restore to a moment just before 14:20 — far closer than the 01:00 snapshot, which would discard the whole day’s legitimate changes. Like a snapshot restore, it creates a new DB instance with its own endpoint; nothing is overwritten. Check the restored prices, then cut over (or copy the correct prices back) as a separate, deliberate step.',
        'The two products added after the restore point are not in the restored copy. Re-create them from the damaged database, which still exists, or from staff records. The earlier state repairs the mistake; reconciliation recovers the legitimate changes made after it.'
      ]
    },
    assumptions: [
      'Clock times are illustrative; failover, restore and DNS timings are not modelled.',
      'The operator’s DELETE is valid SQL with the wrong value; the database executes it correctly.',
      'Reconnection works as soon as the endpoint leads to the promoted instance (DNS caching and connection pools are not modelled).',
      'The restored instance’s AZ placement and Multi-AZ setting are chosen at restore and not modelled.',
      'Re-establishing a standby after the writer failure is RDS\u2019s job and is not modelled.',
      'The restore succeeds: capacity, quotas, encryption keys and network access for the new DB instance are assumed available.'
    ],
    notModelled: 'Failover and restore durations, DNS TTLs, RDS Proxy, how replication works internally, read replicas and Multi-AZ DB clusters (contextual note only), and reconciliation tooling.'
  };

  /* ------------------------------------------------------------------ */
  T.studies.payment = {
    number: 3,
    title: 'The second payment',
    lede: 'A queue promises that work is delivered at least once. Whether the customer pays once is a different promise.',
    route: 'Use after Day 7 (§9: messaging and APIs).',
    guide: [
      ['s9-2', '§9.2 · SQS: receive is not delete'],
      ['w21', 'W21 · Worker charges twice after a crash']
    ],
    terms: [
      ['Amazon SQS', 'A managed message queue (Simple Queue Service).'],
      ['Standard queue', 'At-least-once delivery: a message may be delivered more than once.'],
      ['ReceiveMessage', 'Hands a message to a worker without removing it from the queue.'],
      ['Visibility timeout', 'How long a received message stays hidden from other workers. The SQS default is 30 seconds.'],
      ['Receipt handle', 'A token from one particular receive. DeleteMessage needs the most recent one.'],
      ['DeleteMessage', 'The step that removes a message after the work is done.'],
      ['Idempotency key', 'A stable identifier for one logical action. Repeating a request with the same key does not repeat the effect.'],
      ['Payment processor', 'An external system that charges cards (simulated here).']
    ],
    decisions: [
      { key: 'design', question: 'How is the charge requested?', options: [
        ['plain', 'Plain charge request (no idempotency)'],
        ['checked', 'Worker checks a “processed” table, charges, then marks it (naive)'],
        ['idempotent', 'Processor idempotency key = payment ID (atomic)']
      ] },
      { key: 'crash', question: 'Where does W1 crash?', options: [
        ['none', 'No crash'],
        ['before-charge', 'Before the charge'],
        ['after-charge', 'After the charge, before deletion'],
        ['after-delete', 'After confirmed deletion']
      ] }
    ],
    start: function (c) {
      var d = {
        plain: ' In this design the processor charges every request it receives.',
        idempotent: ' In this design the processor accepts an idempotency key and stores the key with the charge outcome in one atomic step.',
        checked: ' In this design each worker first checks a processed-payments table in the shop’s database, then charges, and only afterwards marks the payment as processed.'
      }[c.design];
      return 'Checkout has created order-42 for cust-7 (\u20ac49.00) with a stable payment ID, payment-42. It hands the work to Amazon SQS, a managed message queue. In this Standard queue, \u201cpayments\u201d, every message is delivered at least once \u2014 possibly more than once. Two workers, W1 and W2, take messages with ReceiveMessage and remove them with DeleteMessage; the queue\u2019s visibility timeout is 30 seconds, the SQS default. The payment processor is a separate, simulated system that charges cards and keeps its own durable records outside the workers.' + d + ' Clock times are illustrative.';
    },
    script: [
      { id: 'plain', stage: 'Observe', config: { design: 'plain', crash: 'after-charge' },
        intro: 'Step through one payment. Watch the message as well as the worker.',
        predict: {
          1: 'W1 is about to receive m-42. Afterwards, where will m-42 be?',
          3: 'W1 crashes right now — after the processor confirmed charge ch-1, before DeleteMessage. What happens to m-42, and how many charges will cust-7 see?'
        },
        next: { label: 'Rewind to the first charge and give the processor an idempotency key', to: 'idem' } },
      { id: 'idem', stage: 'Change', config: { design: 'idempotent', crash: 'after-charge' }, rewindFrom: 'plain',
        intro: 'Rewound to 12:00:01, just before the first charge — the earliest event this decision affects. Same crash, same timings.',
        predict: {
          6: 'W2 asks the processor to charge payment-42 again, with the same idempotency key. What will the processor do?',
          9: 'payment-43 is a new order by the same customer for the same amount. Will the idempotent processor charge it?'
        },
        next: { label: 'Compare the two runs', to: 'cmp' } },
      { id: 'cmp', stage: 'Compare', compare: ['plain', 'idem'], focus: 'charge-2',
        intro: 'Same crash, same redelivery. Only the payment operation changed.',
        next: { label: 'Transfer question', to: 'transfer' } },
      { id: 'transfer', stage: 'Transfer', intro: 'Apply the same mechanism to a situation the replay did not show.' }
    ],
    notes: [
      { when: function (x) { return x.key === 'expire' || x.key === 'receive-2'; },
        title: 'Why a FIFO queue would not prevent this',
        text: 'FIFO deduplication accepts, but does not deliver, a second SendMessage with the same deduplication ID within its 5-minute interval. Here nothing was sent twice: the original message was never deleted, so it is delivered again after its visibility timeout. FIFO queues redeliver undeleted messages too. The repeat comes from processing, not from sending.' },
      { when: function (x) { return x.c.design === 'checked' && (x.key === 'charge-2' || x.key === 'mark-2' || x.key === 'mark-1'); },
        title: 'Why check-then-mark is not safe',
        text: 'Checking a table, charging, then marking leaves a window between the charge and the mark. A crash there — or two workers checking at the same moment after a visibility timeout — still charges twice. The check and the effect must be one atomic operation at the place where the effect happens.' },
      { when: function (x) { return x.c.design === 'idempotent' && (x.key === 'charge-1' || x.key === 'charge-2'); },
        title: 'Teaching assumption: the processor’s contract',
        text: 'The simulated processor stores the idempotency key and the charge outcome in one atomic transaction in its own durable database, outside the workers, and returns the stored outcome for any repeat of that key. The key comes from the message (stable), not from the attempt. Real providers differ in key scope, retention and request matching — check the actual contract.' },
      { when: function (x) { return x.key === 'receive-1'; },
        title: 'Receive is not delete',
        text: 'While a message is in flight it still belongs to the queue. If the worker never deletes it, SQS will offer it again when the visibility timeout ends.' }
    ],
    transfer: {
      question: 'Fresh situation — after a print order ships, a worker takes a “shipped” message from another SQS queue, asks an external email service to send the customer a shipping confirmation, and then deletes the message. A worker crashes after the email service accepted the email but before DeleteMessage. What will the customer experience? What would make the step safe to repeat — and what if the email service offers no idempotency key?',
      answer: [
        'The message becomes visible again after its visibility timeout and another worker sends the email again: the customer receives two identical confirmations. FIFO deduplication would not prevent it, for the same reason as the payment — nothing was sent to the queue twice.',
        'If the email service accepts an idempotency key, pass a stable one derived from the business event, such as shipment-notice-order-42 — never a value generated per attempt.',
        'If it offers none, no bookkeeping in the worker can make the external effect exactly-once. Recording “sent” after sending leaves the duplicate window; recording it before sending risks never sending if the worker crashes in between. Choose which failure is acceptable: for a courtesy email an occasional duplicate is usually tolerable; for a payment it is not — which is why the payment step relies on the processor’s idempotency.'
      ]
    },
    assumptions: [
      'Clock times are illustrative. The visibility timeout is the SQS default of 30 seconds.',
      'The processor’s idempotency contract is a teaching assumption (see the contextual note).',
      'Each worker loses its memory, including receipt handles, when it crashes. The queue, the processor and the network between them keep working.',
      'The “payment-43” step combines receive, charge and delete into one event; the mechanism is the one shown in detail for payment-42.'
    ],
    notModelled: 'Dead-letter queues and redrive, long polling, extending visibility during long work, concurrent workers racing, FIFO message groups, processor timeouts with unknown results, and how long idempotency keys are kept.'
  };

  /* ------------------------------------------------------------------ */
  /* Source map: teaching claim → guide section → AWS documentation   */
  /* ------------------------------------------------------------------ */

  var EC2 = 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/';
  var S3 = 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/';
  var RDS = 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/';
  var SQS = 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/';

  T.sources = {
    method: 'Each claim was checked on ' + CHECKED + ' against the AWS pages listed. Direct requests to docs.aws.amazon.com and aws.amazon.com were blocked by the build environment’s network policy, so the pages were read through a web-search index of those same AWS URLs. Pages marked “guide register” are the guide’s own Appendix F.4 sources. Re-open the links before relying on them; live pages change.',
    photo: [
      { claim: 'Instance-store data survives a reboot, but not stop, hibernation or termination.', guide: [['s6-1', '§6.1'], ['s7-1', '§7.1']],
        aws: [['EC2: data persistence for instance store volumes', EC2 + 'instance-store-lifetime.html'], ['EC2 instance lifecycle (guide register)', EC2 + 'ec2-instance-lifecycle.html']] },
      { claim: 'Auto Scaling replaces an unhealthy instance by terminating it and launching another; ELB health checks must be enabled for target health to count.', guide: [['s6-3', '§6.3']],
        aws: [['EC2 Auto Scaling health checks (guide register)', 'https://docs.aws.amazon.com/autoscaling/ec2/userguide/health-checks-overview.html']] },
      { claim: 'Stickiness routes a browser back to the same target; if that target is unhealthy or deregistered, the ALB selects a new one.', guide: [['w1', 'W1'], ['s6-3', '§6.3']],
        aws: [['ALB sticky sessions', 'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/sticky-sessions.html']] },
      { claim: 'After a successful PUT, later GET and LIST requests reflect it (strong read-after-write consistency).', guide: [['s7-2', '§7.2']],
        aws: [['S3 consistency model (guide register)', S3 + 'Welcome.html']] },
      { claim: 'S3 Standard stores objects redundantly across multiple Availability Zones (a minimum of three).', guide: [['s7-3', '§7.3']],
        aws: [['S3 storage classes (guide register)', S3 + 'storage-class-intro.html'], ['S3 data protection', S3 + 'DataDurability.html']] },
      { claim: 'Regional EFS is a shared NFS file system with mount targets per AZ, storing data redundantly across multiple AZs and usable concurrently from instances in several AZs.', guide: [['w1', 'W1'], ['s7-5', '§7.5'], ['w16', 'W16']],
        aws: [['How Amazon EFS works', 'https://docs.aws.amazon.com/efs/latest/ug/how-it-works.html']] }
    ],
    database: [
      { claim: 'A Multi-AZ DB instance keeps a synchronous standby in another AZ; the standby does not serve read traffic.', guide: [['s8-2', '§8.2']],
        aws: [['RDS Multi-AZ deployments (guide register)', RDS + 'Concepts.MultiAZ.html'], ['Multi-AZ DB instance deployments', RDS + 'Concepts.MultiAZSingleStandby.html']] },
      { claim: 'On failover RDS promotes the standby and changes the endpoint’s DNS record; clients re-establish connections; the duration depends on conditions.', guide: [['s8-2', '§8.2']],
        aws: [['Failing over a Multi-AZ DB instance', RDS + 'Concepts.MultiAZ.Failover.html']] },
      { claim: 'Replication protects a current copy, not an earlier state: without point-in-time recovery or backups it does not protect against data destruction.', guide: [['s8-2', '§8.2'], ['s11-1', '§11.1']],
        aws: [['Well-Architected REL13-BP02: recovery strategies', 'https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_planning_for_recovery_disaster_recovery.html'], ['DR options in the cloud (guide register)', 'https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html']] },
      { claim: 'A DB snapshot is a retained storage copy of the whole DB instance; manual snapshots persist until deleted.', guide: [['s8-2', '§8.2']],
        aws: [['Creating a DB snapshot', RDS + 'USER_CreateSnapshot.html'], ['Introduction to RDS backups', RDS + 'USER_WorkingWithAutomatedBackups.html']] },
      { claim: 'Restoring a snapshot creates a new DB instance with its own endpoint; it cannot restore over an existing instance. Switching the application is a separate step.', guide: [['s8-2', '§8.2']],
        aws: [['Restoring to a DB instance', RDS + 'USER_RestoreFromSnapshot.html']] },
      { claim: 'Point-in-time recovery restores to a chosen time within the retention period, creating a new DB instance.', guide: [['s8-2', '§8.2'], ['s11-1', '§11.1']],
        aws: [['Restoring a DB instance to a specified time', RDS + 'USER_PIT.html']] },
      { claim: 'Read replicas are asynchronous and readable; Multi-AZ DB clusters have two readable standbys with semisynchronous replication.', guide: [['s8-2', '§8.2']],
        aws: [['RDS read replicas (guide register)', RDS + 'USER_ReadRepl.html'], ['Multi-AZ DB clusters (guide register)', RDS + 'multi-az-db-clusters-concepts.html']] }
    ],
    payment: [
      { claim: 'ReceiveMessage does not delete: the message stays in the queue, hidden for the visibility timeout, until a consumer deletes it.', guide: [['s9-2', '§9.2']],
        aws: [['SQS visibility timeout', SQS + 'sqs-visibility-timeout.html']] },
      { claim: 'A message not deleted before its visibility timeout ends becomes visible again and can be received by another consumer. The default timeout is 30 seconds.', guide: [['s9-2', '§9.2'], ['w21', 'W21']],
        aws: [['SQS visibility timeout', SQS + 'sqs-visibility-timeout.html']] },
      { claim: 'Each receive returns a new receipt handle; DeleteMessage needs the most recent one.', guide: [['s9-2', '§9.2']],
        aws: [['DeleteMessage API', 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_DeleteMessage.html']] },
      { claim: 'The receive count shown is SQS’s ApproximateReceiveCount: receives of a message that has not been deleted. (Companion detail; not in the guide.)', guide: [],
        aws: [['ReceiveMessage API', 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_ReceiveMessage.html']] },
      { claim: 'Standard queues deliver at least once; occasionally a copy is delivered again even after a successful delete.', guide: [['s9-2', '§9.2']],
        aws: [['SQS at-least-once delivery', SQS + 'standard-queues-at-least-once-delivery.html']] },
      { claim: 'FIFO deduplication suppresses repeated sends with the same deduplication ID within 5 minutes; it does not stop an undeleted message being redelivered.', guide: [['s9-2', '§9.2'], ['w21', 'W21']],
        aws: [['Message deduplication ID', SQS + 'using-messagededuplicationid-property.html'], ['FIFO exactly-once processing (guide register)', SQS + 'FIFO-queues-exactly-once-processing.html']] },
      { claim: 'An idempotent operation returns the stored result for a repeated request with the same token instead of repeating the effect.', guide: [['s9-2', '§9.2'], ['w21', 'W21']],
        aws: [['Well-Architected REL04-BP04: make mutating operations idempotent', 'https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_prevent_interaction_failure_idempotent.html']] }
    ]
  };

  root.WhatSurvivesTeaching = T;
})(typeof globalThis !== 'undefined' ? globalThis : this);
