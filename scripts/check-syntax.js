#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const failures = [];

function checkJavaScript(source, filename) {
  try {
    new vm.Script(source, { filename });
  } catch (error) {
    failures.push({ filename, message: error.message });
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && full.endsWith('.js')) {
      checkJavaScript(fs.readFileSync(full, 'utf8'), path.relative(root, full));
    }
  }
}

walk(path.join(root, 'api'));
checkJavaScript(
  fs.readFileSync(path.join(root, 'admin-deep-report.js'), 'utf8'),
  'admin-deep-report.js'
);

const scriptPattern = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
for (const htmlName of ['specv_form_v6_integrated_47.html', 'admin.html']) {
  const htmlPath = path.join(root, htmlName);
  const html = fs.readFileSync(htmlPath, 'utf8');
  let match;
  let scriptIndex = 0;
  while ((match = scriptPattern.exec(html))) {
    scriptIndex += 1;
    if (match[1].trim()) {
      checkJavaScript(match[1], `${path.relative(root, htmlPath)}#script${scriptIndex}`);
    }
  }
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`[syntax] ${failure.filename}: ${failure.message}`);
  }
  process.exit(1);
}

console.log('[syntax] API JavaScript and deployed inline JavaScript: OK');
