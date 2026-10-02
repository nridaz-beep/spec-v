# 81-question sampling and scoring correction

Base: origin/main e1a1ed2dd834d757cc69c8421a940886e538e03f. The entry point still targets v57, whose original blob is fa0348bb62a7c3e2e6aef9d7bd7177283d0d220c.

The sampler now preserves seven original temperament positions (1/2/2/1 plus one shared position), each positive mode, each stress category, all 16 competencies, and ten items per independent axis. Unanswered values begin as null and require explicit selection, including neutral. Missing competencies no longer inherit another axis.

Stress uses its own reviewed item direction, category means, ties and missingness. Screen, PDF, AI input and notification/local records use the same cached result. The AI response validator checks all tied labels and missingness. Propulsion reversal, six-axis means, type thresholds and the level formula remain unchanged for identical complete inputs. Sampling changes are separately versioned; measurement equivalence is not claimed.

Measurement version: `81-slots-20261002`. Scoring version: `81-stress-20261002`. Notification JSON and local measurement records carry both, stress scores/counts/labels, item IDs and raw answers. History keys are versioned; legacy before/after records remain untouched. Comparisons reject incompatible revisions.

Longer tied labels exposed a PDF regression: the existing paginator covered only the third section. All report sections now paginate against physical A4 height, preserving the full text and page order.

## Validation

Run `npm run check`, `npm run test:unit`, and `npm run test:e2e`. New checks cover 1,000 draws, stress polarity/means/ties/missingness, baseline scoring golden outputs, explicit answers, output consistency, preservation of legacy local history and AI tie/missingness validation. External services are isolated by the test server.

## Release limitations

This branch is for review, not production promotion. The organization aggregation table currently has no measurement/scoring version columns. Before rollout, add nullable version fields and an assessment identity, update the notification writer and version-filtered organization aggregation together, and retain old rows as unknown legacy revisions. Do not infer versions or recompute historical values without the original responses. The local review report contains the detailed migration and future-form impact analysis; private source materials and question banks are excluded from this repository.

Several existing stress items do not directly measure their category labels. This patch fixes arithmetic and extraction, not construct validity. New measurement content, scoring policy and measurement validation need separate human review. No production database, payment or live email verification was performed.

Final local run (2026-10-02): syntax/release/policy checks passed, 14 unit tests passed, and 19 Chromium E2E tests passed. Android behavior was emulated, not tested on a physical device. The local environment invoked the package scripts directly through Node because npm was absent from PATH.
