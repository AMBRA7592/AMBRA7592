# Amadeus Brandes

Independent researcher. I build reproducible measurement instruments for complex
dependency systems, with their assumptions made explicit. Kronberg, Germany.

---

## Criticality Spectrometer

**Node criticality is a curve, not a score.** Most network rankings assign one
importance number per node. This instrument removes each node, sweeps the horizon
at which substitutes become available, and records mission loss at every horizon -
separating a node that must be protected now and later from one whose risk can be
retired by enabling alternatives.

```bash
pip install criticality-spectrometer
```

`run` measures a node's impact curve; `explain` shows why - which requirement
groups fail, in what order, and which substitute restores the mission.

The same engine runs unchanged across two bounded domains, and the answer moves
with the *view*, not the code:

- **[AI-compute supply chain (52 nodes)](https://github.com/AMBRA7592/criticality-spectrometer/tree/v0.2.0/examples/ai_compute).**
  The modelled EUV lithography corridor is `persistent` - no substitute retires
  its criticality over the horizons tested - while a leading-edge foundry is
  `fully_adaptable`.
- **[Kubernetes / Istio Bookinfo](https://github.com/AMBRA7592/criticality-spectrometer/tree/v0.2.0/examples/kubernetes).**
  The `reviews_v1` component reads `none` under the declared Service selector
  (three versions are eligible) but `[1, 0] / fully_adaptable` under the route a
  separately preserved observed request took. Same component, two views,
  opposite reading - a static count of eligible backends cannot answer the
  adaptation-time question.

Two bounded domains are a transfer test, not a proof of universal applicability.
The repository states its [non-claims](https://github.com/AMBRA7592/criticality-spectrometer/blob/v0.2.0/docs/nonclaims.md)
explicitly. Every empirical figure is backed by an evidence ledger separating
sourced facts from modelling assumptions, and CI rejects stale committed generated
artifacts.

**[Repository](https://github.com/AMBRA7592/criticality-spectrometer)** |
[PyPI](https://pypi.org/project/criticality-spectrometer/) |
[DOI 10.5281/zenodo.21383918](https://doi.org/10.5281/zenodo.21383918) | MIT

A method paper drawing the instrument, its canonical fixture, and the two worked
domains into one account is in preparation.

---

[ORCID 0009-0009-9902-2587](https://orcid.org/0009-0009-9902-2587)
