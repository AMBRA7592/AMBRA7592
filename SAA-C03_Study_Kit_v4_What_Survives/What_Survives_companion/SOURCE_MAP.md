# Source map — AWS — What Survives

Each teaching claim, the guide section that teaches it, the AWS documentation that supports it, and the date it was checked.
Generated from `source/teaching.js` by `source/build.mjs`; the same table appears under **Sources & assumptions** in the companion.

**How the claims were checked.** Each claim was checked on 2026-10-06 against the AWS pages listed. Direct requests to docs.aws.amazon.com and aws.amazon.com were blocked by the build environment’s network policy, so the pages were read through a web-search index of those same AWS URLs. Pages marked “guide register” are the guide’s own Appendix F.4 sources. Re-open the links before relying on them; live pages change.

## Study 1 · The missing photograph

| Teaching claim | Guide | AWS documentation | Checked |
|---|---|---|---|
| Instance-store data survives a reboot, but not stop, hibernation or termination. | [§6.1](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s6-1), [§7.1](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s7-1) | [EC2: data persistence for instance store volumes](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-store-lifetime.html)<br>[EC2 instance lifecycle (guide register)](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-lifecycle.html) | 2026-10-06 |
| Auto Scaling replaces an unhealthy instance by terminating it and launching another; ELB health checks must be enabled for target health to count. | [§6.3](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s6-3) | [EC2 Auto Scaling health checks (guide register)](https://docs.aws.amazon.com/autoscaling/ec2/userguide/health-checks-overview.html) | 2026-10-06 |
| Stickiness routes a browser back to the same target; if that target is unhealthy or deregistered, the ALB selects a new one. | [W1](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#w1), [§6.3](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s6-3) | [ALB sticky sessions](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/sticky-sessions.html) | 2026-10-06 |
| After a successful PUT, later GET and LIST requests reflect it (strong read-after-write consistency). | [§7.2](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s7-2) | [S3 consistency model (guide register)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html) | 2026-10-06 |
| S3 Standard stores objects redundantly across multiple Availability Zones (a minimum of three). | [§7.3](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s7-3) | [S3 storage classes (guide register)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html)<br>[S3 data protection](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DataDurability.html) | 2026-10-06 |
| Regional EFS is a shared NFS file system with mount targets per AZ, storing data redundantly across multiple AZs and usable concurrently from instances in several AZs. | [W1](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#w1), [§7.5](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s7-5), [W16](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#w16) | [How Amazon EFS works](https://docs.aws.amazon.com/efs/latest/ug/how-it-works.html) | 2026-10-06 |

**Teaching assumptions**

- Clock times are illustrative, not AWS timings.
- The ALB’s target for each request is fixed by the schedule; a real ALB chooses with its routing algorithm.
- In the local design, /uploads is on an instance-store volume.
- In the S3 design, each instance’s IAM role allows PutObject and GetObject on the bucket, and the network path to S3 works.
- The Auto Scaling group uses ELB health checks, so it replaces an instance that the ALB reports unhealthy. Grace periods and thresholds are not modelled.
- Launching the replacement succeeds: EC2 capacity, quotas and subnet addresses are assumed available.

**Not modelled:** Retries, DNS and TLS, caching or CloudFront, the ALB’s real routing algorithm, health-check timing, and how long launching takes.

## Study 2 · The perfectly replicated mistake

| Teaching claim | Guide | AWS documentation | Checked |
|---|---|---|---|
| A Multi-AZ DB instance keeps a synchronous standby in another AZ; the standby does not serve read traffic. | [§8.2](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s8-2) | [RDS Multi-AZ deployments (guide register)](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html)<br>[Multi-AZ DB instance deployments](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html) | 2026-10-06 |
| On failover RDS promotes the standby and changes the endpoint’s DNS record; clients re-establish connections; the duration depends on conditions. | [§8.2](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s8-2) | [Failing over a Multi-AZ DB instance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.Failover.html) | 2026-10-06 |
| Replication protects a current copy, not an earlier state: without point-in-time recovery or backups it does not protect against data destruction. | [§8.2](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s8-2), [§11.1](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s11-1) | [Well-Architected REL13-BP02: recovery strategies](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_planning_for_recovery_disaster_recovery.html)<br>[DR options in the cloud (guide register)](https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html) | 2026-10-06 |
| A DB snapshot is a retained storage copy of the whole DB instance; manual snapshots persist until deleted. | [§8.2](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s8-2) | [Creating a DB snapshot](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_CreateSnapshot.html)<br>[Introduction to RDS backups](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html) | 2026-10-06 |
| Restoring a snapshot creates a new DB instance with its own endpoint; it cannot restore over an existing instance. Switching the application is a separate step. | [§8.2](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s8-2) | [Restoring to a DB instance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_RestoreFromSnapshot.html) | 2026-10-06 |
| Point-in-time recovery restores to a chosen time within the retention period, creating a new DB instance. | [§8.2](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s8-2), [§11.1](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s11-1) | [Restoring a DB instance to a specified time](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html) | 2026-10-06 |
| Read replicas are asynchronous and readable; Multi-AZ DB clusters have two readable standbys with semisynchronous replication. | [§8.2](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s8-2) | [RDS read replicas (guide register)](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html)<br>[Multi-AZ DB clusters (guide register)](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/multi-az-db-clusters-concepts.html) | 2026-10-06 |

**Teaching assumptions**

- Clock times are illustrative; failover, restore and DNS timings are not modelled.
- The operator’s DELETE is valid SQL with the wrong value; the database executes it correctly.
- Reconnection works as soon as the endpoint leads to the promoted instance (DNS caching and connection pools are not modelled).
- The restored instance’s AZ placement and Multi-AZ setting are chosen at restore and not modelled.
- Re-establishing a standby after the writer failure is RDS’s job and is not modelled.
- The restore succeeds: capacity, quotas, encryption keys and network access for the new DB instance are assumed available.

**Not modelled:** Failover and restore durations, DNS TTLs, RDS Proxy, how replication works internally, read replicas and Multi-AZ DB clusters (contextual note only), and reconciliation tooling.

## Study 3 · The second payment

| Teaching claim | Guide | AWS documentation | Checked |
|---|---|---|---|
| ReceiveMessage does not delete: the message stays in the queue, hidden for the visibility timeout, until a consumer deletes it. | [§9.2](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s9-2) | [SQS visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html) | 2026-10-06 |
| A message not deleted before its visibility timeout ends becomes visible again and can be received by another consumer. The default timeout is 30 seconds. | [§9.2](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s9-2), [W21](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#w21) | [SQS visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html) | 2026-10-06 |
| Each receive returns a new receipt handle; DeleteMessage needs the most recent one. | [§9.2](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s9-2) | [DeleteMessage API](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_DeleteMessage.html) | 2026-10-06 |
| The receive count shown is SQS’s ApproximateReceiveCount: receives of a message that has not been deleted. (Companion detail; not in the guide.) | — (companion detail) | [ReceiveMessage API](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_ReceiveMessage.html) | 2026-10-06 |
| Standard queues deliver at least once; occasionally a copy is delivered again even after a successful delete. | [§9.2](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s9-2) | [SQS at-least-once delivery](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html) | 2026-10-06 |
| FIFO deduplication suppresses repeated sends with the same deduplication ID within 5 minutes; it does not stop an undeleted message being redelivered. | [§9.2](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s9-2), [W21](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#w21) | [Message deduplication ID](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/using-messagededuplicationid-property.html)<br>[FIFO exactly-once processing (guide register)](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html) | 2026-10-06 |
| An idempotent operation returns the stored result for a repeated request with the same token instead of repeating the effect. | [§9.2](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#s9-2), [W21](../SAA-C03_One-Guide_Study_Kit_v4/SAA-C03_Beginner_Guide_2026-10-06_v4.html#w21) | [Well-Architected REL04-BP04: make mutating operations idempotent](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_prevent_interaction_failure_idempotent.html) | 2026-10-06 |

**Teaching assumptions**

- Clock times are illustrative. The visibility timeout is the SQS default of 30 seconds.
- The processor’s idempotency contract is a teaching assumption (see the contextual note).
- Each worker loses its memory, including receipt handles, when it crashes. The queue, the processor and the network between them keep working.
- The “payment-43” step combines receive, charge and delete into one event; the mechanism is the one shown in detail for payment-42.

**Not modelled:** Dead-letter queues and redrive, long polling, extending visibility during long work, concurrent workers racing, FIFO message groups, processor timeouts with unknown results, and how long idempotency keys are kept.
