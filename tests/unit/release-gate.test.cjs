const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateReport } = require('../../scripts/release-evidence.cjs');
function report() { return { errors: [], stats: { unexpected: 0, skipped: 0, flaky: 0 }, suites: [{ specs: ['81問','3回失敗','test=1','LATEST','claim','used_at','空本文','通知回復','長文AI','再試行'].map(title => ({ title, ok: true, tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed' }] }] })) }] }; }
test('Only a complete passing report can produce promotion evidence', () => assert.equal(validateReport(report()), 10));
for (const status of ['failed','timedOut','interrupted','skipped']) test(`Block ${status} test`, () => { const r = report(); r.suites[0].specs[0].tests[0].results[0].status = status; assert.throws(() => validateReport(r)); });
test('Block retried/flaky successes', () => { const r = report(); r.suites[0].specs[0].tests[0].results.unshift({ status: 'failed' }); assert.throws(() => validateReport(r)); });
test('Block empty and filtered test runs', () => { const r = report(); r.suites = []; assert.throws(() => validateReport(r)); });
test('Block expected failures and runner errors', () => { const r = report(); r.suites[0].specs[0].tests[0].expectedStatus = 'failed'; assert.throws(() => validateReport(r)); r.errors = ['runner failed']; assert.throws(() => validateReport(r)); });
