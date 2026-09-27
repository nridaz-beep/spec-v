// Fail closed: bind a complete, non-retried test run to the deployed files and SHA.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const evidencePath = path.join(root, '.release-evidence.json');
function digestFiles(dir = root, prefix = '') {
  const records = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.env') || ['.git','.tools','.vercel','.release-evidence.json','node_modules','test-results','playwright-report','tmp'].includes(entry.name)) continue;
    const rel = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(records, digestFiles(path.join(dir,entry.name), rel + '/'));
    else records[rel] = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,entry.name))).digest('hex');
  }
  return records;
}
function validateReport(report) {
  assert.deepEqual(report.errors, [], 'Runner errors');
  const tests = [];
  function walk(suite) { for (const spec of suite.specs || []) for (const test of spec.tests || []) tests.push({ spec, test }); for (const child of suite.suites || []) walk(child); }
  for (const suite of report.suites || []) walk(suite);
  assert(tests.length >= 10, 'Missing regression cases');
  assert.equal(report.stats.unexpected, 0); assert.equal(report.stats.skipped, 0); assert.equal(report.stats.flaky, 0);
  for (const { spec, test } of tests) {
    assert.equal(spec.ok, true); assert.equal(test.expectedStatus, 'passed'); assert.equal(test.status, 'expected');
    assert.equal(test.results.length, 1); assert.equal(test.results[0].status, 'passed');
  }
  // Prevent --grep/--shard or deleting an entire family from manufacturing evidence.
  for (const phrase of ['81問','3回失敗','test=1','LATEST','claim','used_at','空本文','長文AI','再試行']) assert(tests.some(x => x.spec.title.includes(phrase)), `Missing required case: ${phrase}`);
  return tests.length;
}
function shouldRequireEvidence(env = process.env) {
  // Preview deployments are test artifacts, not promotion candidates. Keep the
  // fail-closed evidence gate for local/CI checks and Production deployments.
  return env.VERCEL_ENV !== 'preview';
}
function run(mode) {
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'release-policy.json')));
  const latest = fs.readFileSync(path.join(root, 'main.html'), 'utf8').match(/const\s+LATEST\s*=\s*['"]([^'"]+)['"]/)[1];
  if (mode === 'create') {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    assert.equal(process.env.GITHUB_SHA, sha, 'Evidence must be created for the checked-out CI SHA');
    assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Evidence must be created in CI');
    const count = validateReport(JSON.parse(fs.readFileSync(path.join(root, 'test-results/results.json'))));
    const evidence = { sha, candidate: policy.candidate, count, files: digestFiles() };
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    console.log(`Recorded ${count} passing tests for ${sha}`);
  } else if (mode === 'verify') {
    if (!shouldRequireEvidence()) {
      console.log('[release] Preview build: release evidence check skipped; Production remains gated');
      return;
    }
    const evidence = JSON.parse(fs.readFileSync(evidencePath));
    assert.equal(latest, policy.candidate, 'Normal promotion requires LATEST to point to the fully tested candidate; use deployment rollback for the old stable release');
    assert.equal(evidence.candidate, latest); assert(evidence.count >= 10);
    assert.equal(evidence.sha, process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA, 'Commit mismatch');
    assert.deepEqual(evidence.files, digestFiles(), 'Files changed after tests');
    console.log('[release] All deployed files match successful CI test evidence');
  } else throw new Error('Expected create or verify');
}
module.exports = { validateReport };
module.exports.shouldRequireEvidence = shouldRequireEvidence;
if (require.main === module) { try { run(process.argv[2]); } catch (error) { console.error('[release blocked]', error.message); process.exitCode = 1; } }
