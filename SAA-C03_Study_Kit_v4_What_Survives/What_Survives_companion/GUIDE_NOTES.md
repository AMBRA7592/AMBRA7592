# Notes against the frozen guide

**Guide:** SAA-C03 One-Guide Study Kit, Revision 4 (6 October 2026), fact-checked 5–6 October 2026.
**Companion:** AWS — What Survives 1.0. **Checked:** 2026-10-06.

The guide files are unchanged. This file records, separately from the guide, what the companion's verification found that the frozen guide states differently, says less precisely or does not cover. **No factual conflict was found** in the guide's teaching of the mechanisms the companion covers: §1.6/W1, §6.3, §7.1, §7.5, §8.2, §9.2/W21, §11.1 and Appendix E exercises 1, 3 and 5.

## How claims were checked

The guide's Appendix F.4 register was the starting point. The build environment blocked direct requests to `docs.aws.amazon.com` and `aws.amazon.com`, so the AWS pages listed in `SOURCE_MAP.md` were read through a web-search index of those same URLs on 2026-10-06. That is weaker evidence than reading the live page. Re-open the links before treating any claim as re-verified.

## Clarifications (consistent with the guide)

1. **W1, "the photo disappears".** The phrase describes what the customer sees. The companion separates *not reachable by this request*, when the photo is still intact on Server A, from *destroyed*, when instance-store data is erased as the instance is terminated. This is consistent with §6.1, the instance-lifecycle table, and §6.3, on state. The companion also states its storage assumption: an instance-store volume.
2. **Failover duration.** AWS's Multi-AZ failover page gives typical durations that depend on conditions. The guide gives none. The companion shows the order of the steps (interruption, promotion with a DNS change, reconnection, restored access) and never states a duration.
3. **Standard queues after a confirmed delete.** AWS's at-least-once page notes that, rarely, a copy of a message can be delivered again after a successful delete. Guide §9.2 states at-least-once delivery in general. The companion mentions this at the "after confirmed deletion" crash point but does not simulate it.
4. **FIFO deduplication.** Guide §9.2 says "five-minute send deduplication". AWS's wording is that a message sent with the same deduplication ID within the 5-minute interval is *accepted but not delivered*. The companion uses AWS's wording. Both agree that this does not prevent redelivery of a message that was never deleted (W21).
5. **Receive count.** The companion shows SQS's `ApproximateReceiveCount`. The guide does not mention it. It is a companion detail with its own source.
6. **After a writer failure.** Neither the guide nor the companion describes how RDS re-establishes a standby after an actual host failure, so the companion does not model it. The search summaries only confirmed that, during maintenance, the old primary becomes the new standby. The forced "reboot with failover" in incident B follows that pattern.
7. **Restored instance placement.** The AZ and Multi-AZ setting of a restored DB instance are chosen when restoring. The companion draws the restored instance as a single box and does not model these choices.

## Coverage note (a newer AWS feature, not a conflict)

- **Amazon S3 Files.** AWS announced this in April 2026 ([What's New](https://aws.amazon.com/about-aws/whats-new/2026/04/amazon-s3-files/), [User Guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-files.html)). It presents S3 general purpose buckets as NFS file systems to EC2, ECS, EKS and Lambda. The frozen guide does not mention it. For "shared filesystem paths, no object APIs", the guide recommends Regional EFS (W1, W16, §7.5), and the companion's transfer explanation keeps that answer. Under the guide's three-month FAQ rule (F.2), a feature that became generally available in April 2026 would have a calculated earliest exam date in July 2026. That is a lower bound, not a prediction. Only the announcement summary was checked; the exact GA date, semantics and limits were **not** verified. Verify them before teaching it as an alternative.

## For pilot coordinators

- Appendix E.1 assesses the frozen route. Treat use of this companion as an **additional teaching condition**. Record which studies a learner used, when, and roughly for how long, and keep those learners' results apart from results attributed to the guide alone.
- These Appendix C items exercise mechanisms that the companion rehearses: **Q4, Q24, Q29, Q37 and Q51**. Results on those items from learners who used the companion belong to the extended route. The companion does not reproduce Appendix C questions or reveal its answer key; `checks/model-checks.mjs` confirms that no transfer question shares a seven-word sequence with Appendix C.
- Learning effectiveness has not been established. No learner has used the companion.
