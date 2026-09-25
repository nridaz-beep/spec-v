const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const formPath = path.join(__dirname, '..', '..', 'specv_form_v6_integrated_56.html');
const source = fs.readFileSync(formPath, 'utf8');

test('Android PDF pagination uses break-before and keeps the first page unbroken', () => {
  assert.match(source, /.pdf-page:first-child\s*\{[\s\S]*?break-before:\s*auto/);
  assert.match(source, /.pdf-page\s*\{[\s\S]*?page-break-before:\s*always/);
  assert.doesNotMatch(source, /.pdf-page\s*\{[\s\S]*?page-break-after:\s*always/);
});

test('PDF pagination removes header-only overflow pages', () => {
  assert.match(source, /const pdfPageHasContent=page=>/);
  assert.match(source, /data-overflow-page/);
  assert.match(source, /if\(sourcePage&&!pdfPageHasContent\(sourcePage\)\)sourcePage\.remove\(\)/);
});

test('Action Plan remains before the consultant note in the third logical page', () => {
  const p3 = source.indexOf('const p3html');
  const action = source.indexOf("Action Plan — 今日から動く", p3);
  const note = source.indexOf("Consultant Note — コンサルメモ", p3);
  assert.ok(p3 >= 0 && action > p3 && note > action);
});
