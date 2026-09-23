#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const failures = [];

function fail(filename, message) {
  failures.push({ filename, message });
}

function checkJavaScript(source, filename) {
  try {
    new vm.Script(source, { filename });
  } catch (error) {
    fail(filename, error.message);
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && full.endsWith('.js')) {
      checkJavaScript(fs.readFileSync(full, 'utf8'), path.relative(root, full));
    }
  }
}

function checkHtmlScripts(htmlName) {
  const htmlPath = path.join(root, htmlName);
  if (!fs.existsSync(htmlPath)) {
    fail(htmlName, 'file not found');
    return '';
  }
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scriptPattern = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let match;
  let scriptIndex = 0;
  while ((match = scriptPattern.exec(html))) {
    scriptIndex += 1;
    if (match[1].trim()) {
      checkJavaScript(match[1], `${htmlName}#script${scriptIndex}`);
    }
  }
  return html;
}

function highestIntegratedForm() {
  const matches = fs.readdirSync(root)
    .map(name => {
      const m = name.match(/^specv_form_v6_integrated_(\d+)\.html$/);
      return m ? { name, version: Number(m[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.version - a.version);
  return matches[0]?.name || null;
}

function assertContains(source, needle, filename, label) {
  if (!source.includes(needle)) fail(filename, `missing regression guard: ${label}`);
}

walk(path.join(root, 'api'));
checkJavaScript(
  fs.readFileSync(path.join(root, 'admin-deep-report.js'), 'utf8'),
  'admin-deep-report.js'
);

const latestForm = highestIntegratedForm();
if (!latestForm) {
  fail('Spec-V', 'latest integrated form not found');
} else {
  const html = checkHtmlScripts(latestForm);

  // Critical regression guards: these have broken before and must never silently disappear.
  assertContains(html, 'questionComments=questions.map', latestForm, 'per-question comment storage');
  assertContains(html, 'saveCurrentQuestionComment()', latestForm, 'comment save before navigation');
  assertContains(html, 'await markCurrentTokenUsed()', latestForm, 'token completion at diagnosis finish');
  assertContains(html, 'question_comments:questionComments', latestForm, 'comment notification payload');
  assertContains(html, "for(let attempt=0;attempt<3 && !aiText;attempt++)", latestForm, 'AI retry loop');
}

// Keep admin JavaScript under syntax coverage as well.
checkHtmlScripts('admin_v2.html');

if (failures.length) {
  for (const failure of failures) {
    console.error(`[check] ${failure.filename}: ${failure.message}`);
  }
  process.exit(1);
}

console.log(`[check] API + ${latestForm} + admin_v2 syntax/regression guards: OK`);
