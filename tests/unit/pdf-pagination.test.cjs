const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../specv_form_v6_integrated_57.html'), 'utf8');
const printRules = html.match(/\/\* PDF専用DOM：[\s\S]*?<\/style>/)?.[0];

test('印刷ページは固定A4高さと末尾強制改ページを併用しない', () => {
  assert.ok(printRules, 'PDF print styles must exist');
  const pageRules = printRules.match(/#pdf-view \.pdf-page\s*\{([^}]+)\}/)?.[1];
  assert.ok(pageRules, 'PDF page rules must exist');
  assert.match(pageRules, /height:\s*auto\s*!important/);
  assert.match(pageRules, /max-height:\s*none\s*!important/);
  assert.match(pageRules, /overflow:\s*visible\s*!important/);
  assert.doesNotMatch(pageRules, /(?:page-break-after:\s*always|break-after:\s*page)/);
  assert.match(printRules, /#pdf-view \.pdf-page:not\(:first-child\)\s*\{[^}]*break-before:\s*page\s*!important/);
});
