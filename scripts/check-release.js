#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];

function fail(file, message) { failures.push({ file, message }); }
function assert(cond, file, message) { if (!cond) fail(file, message); }
function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) { fail(rel, 'file not found'); return ''; }
  return fs.readFileSync(p, 'utf8');
}
function highestIntegratedForm() {
  return fs.readdirSync(root)
    .map(name => {
      const m = name.match(/^specv_form_v6_integrated_(\d+)\.html$/);
      return m ? { name, version: Number(m[1]) } : null;
    })
    .filter(Boolean)
    .sort((a,b) => b.version - a.version)[0] || null;
}

const latest = highestIntegratedForm();
assert(latest, 'Spec-V', 'integrated form not found');

const main = read('main.html');
const m = main.match(/const\s+LATEST\s*=\s*['"]specv_form_v6_integrated_(\d+)\.html['"]/);
assert(m, 'main.html', 'LATEST constant missing or malformed');
if (m && latest) {
  const prodVersion = Number(m[1]);
  assert(prodVersion <= latest.version, 'main.html', 'LATEST points beyond repository latest version');
  assert(fs.existsSync(path.join(root, 'specv_form_v6_integrated_' + prodVersion + '.html')), 'main.html', 'LATEST target v' + prodVersion + ' does not exist');
}

const html = latest ? read(latest.name) : '';
const tokenApi = read('api/token.js');
const notifyApi = read('api/notify.js');

function has(needle, file) {
  assert(html.includes(needle), file || (latest && latest.name) || 'latest form', 'missing release guard: ' + needle);
}

// 1) Test mode must never become a public auth bypass.
has("window.SPECV_TEST_REQUESTED = new URLSearchParams(location.search).get('test') === '1';");
has('window.SPECV_TEST_AUTHORIZED = false;');
has('data.test_allowed === true');
assert(/SPECV_LOCAL_DEV[\s\S]{0,300}localhost[\s\S]{0,120}127\.0\.0\.1/.test(html), (latest && latest.name) || 'latest form', 'local DEV bypass is not restricted to localhost/127.0.0.1');
assert(/if\(!window\.SPECV_TEST_AUTHORIZED\)/.test(html), (latest && latest.name) || 'latest form', 'runSpecVTest authorization guard missing');

// 2) Per-question comments must survive navigation and be included in outputs.
has("questionComments=questions.map(()=>'');");
has("questionComments[curIdx]=String(qc.value||'').trim();");
has("if(qc)qc.value=questionComments[curIdx]||'';");
has('question_comments:questionComments');
has('設問コメント：${questionComments.map');

// 3) Diagnosis completion and token lifecycle must stay decoupled from AI availability.
has('await markCurrentTokenUsed();');
has("sendDiagnosisData(scores,ti,compi,kish,mode,aiText||'','',null);");
const markPos = html.indexOf('await markCurrentTokenUsed();');
const notifyPos = html.indexOf("sendDiagnosisData(scores,ti,compi,kish,mode,aiText||'','',null);");
assert(markPos >= 0 && notifyPos >= 0 && markPos < notifyPos, (latest && latest.name) || 'latest form', 'token used update must happen before async notification dispatch');
assert(/used_at\s*:\s*new Date\(\)\.toISOString\(\)/.test(tokenApi), 'api/token.js', 'used_at update missing');
assert(/used_at\s*:\s*new Date\(\)\.toISOString\(\)/.test(notifyApi), 'api/notify.js', 'notification fallback used_at update missing');

// 4) test=1 authorization metadata must remain server-controlled.
assert(/test_allowed\s*:\s*testAllowed/.test(tokenApi), 'api/token.js', 'test_allowed response missing');
assert(/note/.test(tokenApi) && /(E2E_TEST|TEST_ONLY|テスト|てすと)/.test(tokenApi), 'api/token.js', 'test token note authorization rule missing');

// 5) AI resilience + deep analysis regressions.
has('for(let attempt=0;attempt<3 && !aiText;attempt++)');
has('async function runSecondAnalysis()');
has('if(normalized.length<2)return true;');
assert(!html.includes('if(normalized.length<8)return true;'), (latest && latest.name) || 'latest form', 'old 8-character deep-analysis gate regressed');
assert((html.match(/fetch\('\/api\/analyze'/g) || []).length >= 2, (latest && latest.name) || 'latest form', 'AI primary/deep analyze routes missing');

// 6) Core production surfaces must remain present.
for (const id of ['scr-start','scr-q','scr-result','userComment','runSecondAnalysis','specv-test-panel']) {
  assert(html.includes('id="' + id + '"'), (latest && latest.name) || 'latest form', 'critical UI surface missing: #' + id);
}

if (failures.length) {
  for (const x of failures) console.error('[release-guard] ' + x.file + ': ' + x.message);
  process.exit(1);
}
console.log('[release-guard] production v' + (m ? m[1] : '?') + ' / candidate v' + (latest ? latest.version : '?') + ': critical regression guards OK');
