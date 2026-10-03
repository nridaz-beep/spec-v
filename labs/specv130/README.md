# 130-question isolated measurement lab

This directory contains code and **synthetic fixtures only**. It is not imported by the production form or API. Do not commit a question bank, respondent export, source master, or generated standalone HTML here.

The private reviewed bank and item-level audit are local artifacts under ignored `output/specv-130-lab-review-20261003/`. Original ZIP/master files are unchanged. The user-specified `output/Spec-V_130問設計・基本版A_20261002.md` was not located; the new review is a supplemental design, not a claimed revision of that unseen document.

## Run

```sh
node --test labs/specv130/tests/core.test.cjs
node node_modules/@playwright/test/cli.js test --config labs/specv130/tests/playwright.config.cjs
node labs/specv130/build.cjs PRIVATE_REVIEWED_BANK PRIVATE_OUTPUT_DIR
```

Open the generated `SpecV_130_trial.html` locally. No server, production credentials, external assets or network connection is needed. The CSP denies network connections. `SPECV130_BANK` can point tests at a private reviewed bank; when omitted, tests create synthetic items. Test output stays in ignored tmp/test-results directories. The builder checks the bank hash and writes only to the specified output directory, never to the input bank path.

## Measurement boundaries

- 130 fixed slots, each with A/B/C: 16 trait, 16 mode, 16 stress, 32 paired items, 50 independent-axis items. Never choose 130 indiscriminately from 390.
- Default A uses fixed variants and fixed order. Experimental ABC chooses one variant per slot and shuffles order; the complete selection and order are recorded. Equivalence remains unverified, and experimental pooled means are withheld.
- Trait asks natural preferences with role/evaluation put aside; mode asks actual behavior in the selected setting. No innate essence or suppression inference.
- Intent and behavior are kept as separate raw responses with different scales; no pair average, numeric gap, reversed behavior proxy, automatic discrepancy rank or credibility decision.
- Coping items remain individually recorded and never reverse into reaction scores. Stress means require all four numeric, eligible reaction items. No representative stress label is selected, including ties, low responses or absent situations.
- A-only descriptive means require every item to be numeric and eligible. Reviewed construct holds prevent calculation; missing items are not filled or silently dropped.
- No official drive/type/level, research action candidate, Firewall penalty, reliability gate, or cross-version comparison. Null contract fields explicitly mark these as not calculated.

## Record and bank contracts

`specv130-bank-v3` has separate bank, measurement and scoring revisions plus SHA-256 over the entire JSON object excluding the `sha256` field (in serialized property order). Variant metadata records scale, direction, period, scene, opportunity, construct kind, review disposition and `equivalence: unverified`. Changing wording or metadata requires a new bank revision/hash. A review disposition is a content-audit decision, not psychometric validation.

`specv130-session-v3` stores UUID, context, revisions/hash, variant mode, ordered slot/variant selection, cursor, DEMO flag, and 130 explicit answer objects. Status is `answered` (integer 1–7), `no_opportunity`, `cannot_judge`, or `unanswered` (all three use null). Export adds authoritative question snapshots and recalculated derived output. Import ignores supplied snapshots/derived values and validates against the active bank. Incorrect revisions, altered fixed-A order, missing/duplicate slots and invalid answers are rejected before replacing the current session.

Old v0.2 exports/local storage are neither migrated nor overwritten. Their pair averages/gaps and old stress inversions cannot be relabeled as v0.3 results. Manual storage is opt-in and has a new versioned key. An interrupted record resumes exactly the recorded variant order; elapsed time and session context changes are not yet modeled.

## Review status and limitations

The local audit covers all 130 source slots and 390 variants, with original text, P/R, time/scene cues, opportunity, concrete differences and revision suggestions. Four stress slots contain coping instead of reaction. All 50 inherited independent-axis slots are retained for wording review, with aggregate interpretation withheld pending construct/direction/variant decisions. The intent slot that asks achieved emotional recovery is also marked as a construct hold. Proposed replacements remain separate from the active bank.

Masters were consulted in INDEX order: 00 priority/current differences, 01 current definitions/design and unresolved issues, 02 output constitution and detailed interpretation rules, then relevant 03 historical references. Earlier master assertions about detecting lies, automatic suppression patterns or source-code versions do not override the user's current six design decisions. Current implementation facts remain based on Git; production 81-question code and DB contracts are unchanged.

Human decisions remaining: approve/rewrite four reaction replacements; choose which target each incompatible A/B/C set should measure; align periods/settings/opportunities; decide how to phrase intent versus state items; approve a study protocol for comprehension, response processes, reliability and variant equivalence. The initial A trial is exploratory, not a validated baseline. The UI/SQL/function tests do not prove measurement accuracy. Production integration is out of scope.

## Verification recorded 2026-10-03

Synthetic unit tests: 10 passed. Private real-bank unit tests: 11 passed. Chromium UI tests: 3 passed on each bank (130-response completion, explicit missing states, JSON/manual-storage resume, fixed A/experimental ABC, mobile width). Existing production unit tests: 19 passed; syntax/release/policy guards passed. No production/API/DB file changed. Original 390 texts and 130 IDs were compared and remain unchanged. Private test exports/screenshots are excluded from Git.

The separate `specv130-lab-check.yml` workflow runs only synthetic lab checks and never deploys. It does not certify measurement validity. The provided standalone HTML is for local review only; the private bank and audit are intentionally not pushed.
