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

const htmlPath = path.join(root, 'specv_form_v6_integrated_47.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scriptPattern = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
let match;
let scriptIndex = 0;
while ((match = scriptPattern.exec(html))) {
  scriptIndex += 1;
  if (match[1].trim()) {
    checkJavaScript(match[1], `${path.relative(root, htmlPath)}#script${scriptIndex}`);
  }
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`[syntax] ${failure.filename}: ${failure.message}`);
  }
  process.exit(1);
}

console.log('[syntax] API JavaScript and deployed inline JavaScript: OK');
