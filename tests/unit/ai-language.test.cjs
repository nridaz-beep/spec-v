const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', '..', 'specv_form_v6_integrated_56.html'),
  'utf8',
);

test('Primary AI prompt preserves observation, hypothesis, and confirmation order', () => {
  assert.match(source, /まず観測事実（入力された数値・本人の言葉）を示し、次に複数の背景仮説を並べ、最後に本人へ確認したい問いへ進む/);
  assert.match(source, /4\.8などの数値は全体の中で比較的高く表れていると書き、「極めて高い」「非常に優れている」などへ飛躍させない/);
  assert.match(source, /3点前後の項目は相対的に表れにくい可能性として扱い、能力欠如・人格評価へ変換しない/);
  assert.match(source, /「がんばるわ」「不満」などの短文は、我慢・前向きさ・諦め、環境要因・停滞感・役割不一致など複数の読みを残す/);
});

test('Secondary AI prompt keeps short comments as hypotheses, not diagnoses', () => {
  assert.match(source, /観測事実（数値・本人入力）→複数の背景仮説→本人に確認すべき問い/);
  assert.match(source, /4\.8などの数値は「全体の中で比較的高く表れている」と扱い、「極めて高い」などの断定に変換しない/);
  assert.match(source, /3点前後は能力欠如・人格評価に変換せず/);
  assert.match(source, /短文コメント1つから心理状態・動機・原因を決め打ちしない/);
  assert.match(source, /可能性|仮説|確認/);
});
