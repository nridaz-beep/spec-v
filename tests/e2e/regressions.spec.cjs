const { test, expect } = require('@playwright/test');
const { PDFDocument } = require('pdf-lib');
const fs = require('node:fs');
const path = require('node:path');
const candidate = '/' + require('../../release-policy.json').candidate;
const state = async request => (await request.get('/__test/state')).json();
test.beforeEach(async ({ page, request }) => {
  await request.post('/__test/reset', { data: {} });
  await request.post('/__test/admin-config', { data: { enabled: true } });
  await page.route('https://cdn.jsdelivr.net/npm/chart.js', route => route.fulfill({ path: path.resolve('node_modules/chart.js/dist/chart.umd.js'), contentType: 'text/javascript' }));
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.fulfill({ body: '', contentType: 'text/css' }));
  await page.addInitScript(() => {
    let seed = 42; Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    window.print = () => { window.__printRequested = true; };
  });
});
async function diagnosis(page, token = 'P-E2E') {
  await page.goto(`${candidate}?token=${token}`);
  await expect(page.locator('#token-gate')).toBeHidden();
  for (const id of ['inAge','inRole','inIndustry','inJob']) await page.locator('#' + id).selectOption({ index: 1 });
  await page.getByRole('button', { name: /自己理解/ }).click();
  await page.locator('#btnStart').click();
  await page.locator('#qComment').fill('最初の設問のコメント。相談して進めました。');
  await page.locator('#btnNext').click();
  await page.locator('#qComment').fill('二問目のコメント。役割を確認しました。');
  await page.getByRole('button', { name: '← 戻る', exact: true }).click();
  await expect(page.locator('#qComment')).toHaveValue('最初の設問のコメント。相談して進めました。');
  await page.locator('#qSlider').fill('3');
  await page.locator('#btnNext').click();
  await expect(page.locator('#qComment')).toHaveValue('二問目のコメント。役割を確認しました。');
  for (let i = 1; i < 81; i++) {
    await expect(page.locator('#qNum')).toHaveText(`${i + 1} / 81`);
    await page.locator('#qSlider').fill(String(3 + i % 3));
    if (i === 80) await page.locator('#qComment').fill('最後のコメントも保存する。');
    await page.locator('#btnNext').click();
  }
  await page.locator('#temporalTamashii').fill('半年前は一人で抱え込みましたが、今は同僚に相談します。');
  await page.locator('#temporalAi').fill('半年前は言い出せず、今は相手の考えを聞いて進めます。');
  await page.getByRole('button', { name: '回答して診断を完了する →' }).click();
  if (await page.locator('#scr-episode').isVisible()) {
    for (const input of await page.locator('#episodeFields textarea').all()) await input.fill('昨日の打合せで同僚に相談し、作業の期限を一緒に決めました。');
    await page.getByRole('button', { name: 'エピソードを添えて結果を見る →' }).click();
  }
  await expect(page.locator('#scr-result')).toBeVisible();
}
async function printAndCheck(page, testInfo) {
  await page.getByRole('button', { name: /診断結果をPDFで保存する/ }).click();
  await expect.poll(() => page.evaluate(() => window.__printRequested)).toBe(true);
  await page.emulateMedia({ media: 'print' });
  const pageCount=await page.locator('#pdf-view .pdf-page').count();
  expect(pageCount).toBeGreaterThanOrEqual(3);
  expect(pageCount).toBeLessThanOrEqual(12);
  const overflow = await page.locator('.pdf-page').evaluateAll(pages => pages.map(page => {
    const box = page.getBoundingClientRect();
    const escaped = [...page.querySelectorAll('*')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width && r.height && (r.bottom > box.bottom + 1 || r.right > box.right + 1 || r.left < box.left - 1);
    });
    return { id: page.id, vertical: page.scrollHeight > page.clientHeight + 1, horizontal: page.scrollWidth > page.clientWidth + 1, escaped: escaped.map(el => el.className) };
  }));
  expect(overflow).toEqual(overflow.map(x => ({ id: x.id, vertical: false, horizontal: false, escaped: [] })));
  for (let i = 1; i <= pageCount; i++) {
    const section = page.locator('#pdf-view .pdf-page').nth(i-1);
    await expect(section).toContainText('SPEC-V DIAGNOSTIC REPORT');
    await section.screenshot({ path: testInfo.outputPath(`print-page-${i}.png`) });
  }
  const bytes = await page.pdf({ path: testInfo.outputPath('diagnosis.pdf'), preferCSSPageSize: true, printBackground: true });
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(pageCount);
  for (const p of pdf.getPages()) { expect(p.getWidth()).toBeCloseTo(595.28, 0); expect(p.getHeight()).toBeCloseTo(841.89, 0); }
  await testInfo.attach('diagnosis.pdf', { body: bytes, contentType: 'application/pdf' });
  await page.emulateMedia({ media: 'screen' });
}
test('81問 → コメント保持 → 一次/短文二次AI → used/used_at → 管理画面 → PDF', async ({ page, request }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await diagnosis(page);
  await expect(page.locator('#aiBlocks')).toContainText('具体的な行動');
  await expect.poll(async () => (await state(request)).tokens[0].status).toBe('used');
  await expect.poll(async () => (await state(request)).notifications.length).toBeGreaterThan(0);
  let s = await state(request);
  expect(Date.parse(s.tokens[0].used_at)).toBeGreaterThan(Date.now() - 120000);
  expect(s.ai[0].messages[0].content).toContain('最初の設問のコメント');
  expect(s.ai[0].messages[0].content).toContain('最後のコメントも保存する');
  expect(s.notifications[0].question_comments).toEqual([
    { question_no: 1, comment: '最初の設問のコメント。相談して進めました。' },
    { question_no: 2, comment: '二問目のコメント。役割を確認しました。' },
    { question_no: 81, comment: '最後のコメントも保存する。' },
  ]);
  await page.locator('#userComment').fill('しんどい');
  await page.locator('#runSecondAnalysis').click();
  await expect(page.locator('#secondAnalysisBlocks')).toContainText('具体的な行動');
  s = await state(request);
  expect(s.ai.at(-1).messages[0].content).toContain('しんどい');
  await printAndCheck(page, testInfo);
  await page.goto('/admin.html');
  await page.locator('#adminPasswordInput').fill('isolated-admin');
  await page.locator('#adminPasswordInput').press('Enter');
  await expect(page.locator('tr').filter({ hasText: 'P-E2E' })).toContainText('受診済');
  await page.goto(candidate + '?token=P-E2E');
  await expect(page.locator('#tg-msg')).toContainText('すでに使用済み');
  expect(errors).toEqual([]);
});
test('一次AIが3回失敗しても結果・used/used_at・通知・PDFに到達する', async ({ page, request }, testInfo) => {
  await request.post('/__test/options', { data: { aiFailures: 10 } });
  await diagnosis(page);
  await expect.poll(async () => (await state(request)).tokens[0].status).toBe('used');
  await expect.poll(async () => (await state(request)).notifications.length).toBeGreaterThan(0);
  const s = await state(request); expect(s.ai).toHaveLength(3); expect(s.tokens[0].used_at).toBeTruthy();
  await printAndCheck(page, testInfo);
});
test('token更新の3回失敗を通知APIが回復する', async ({ page, request }) => {
  await request.post('/__test/options', { data: { dbFailures: 3 } });
  await diagnosis(page);
  await expect.poll(async () => (await state(request)).tokens[0].status).toBe('used');
  expect((await state(request)).tokens[0].used_at).toBeTruthy();
});
test('長文AIでもPDF全文を保持して改ページでき、再印刷でページが増殖しない', async ({ page, request }, testInfo) => {
  await request.post('/__test/options', { data: { longAI: true } });
  await diagnosis(page);
  await expect(page.locator('#aiBlocks')).toContainText('具体的な行動');
  await page.locator('#userComment').fill('しんどい');
  await page.locator('#runSecondAnalysis').click();
  await expect(page.locator('#secondAnalysisBlocks')).toContainText('具体的な行動');
  await printAndCheck(page, testInfo);
  const count=await page.locator('#pdf-view .pdf-page').count();
  const text=await page.locator('#pdf-view').innerText();
  await printAndCheck(page, testInfo);
  expect(await page.locator('#pdf-view .pdf-page').count()).toBe(count);
  expect(await page.locator('#pdf-view').innerText()).toBe(text);
});
test('二次AIの失敗後に再試行でき、空欄は外部AIへ送らない', async ({ page, request }) => {
  await diagnosis(page);
  await expect(page.locator('#aiBlocks')).toContainText('具体的な行動');
  const before=(await state(request)).ai.length;
  await page.locator('#userComment').fill('　 ');
  await page.locator('#runSecondAnalysis').click();
  await expect(page.locator('#secondAnalysisBlocks')).toContainText('材料');
  expect((await state(request)).ai.length).toBe(before);
  await request.post('/__test/options', { data: { aiFailures: 1 } });
  await page.locator('#userComment').fill('しんどい');
  await page.locator('#runSecondAnalysis').click();
  await expect(page.locator('#runSecondAnalysis')).toBeEnabled();
  await expect(page.locator('#secondAnalysisBlocks')).not.toContainText('具体的な行動');
  await page.locator('#runSecondAnalysis').click();
  await expect(page.locator('#secondAnalysisBlocks')).toContainText('具体的な行動');
});
test('test=1は認証を迂回せず、許可済みテストtokenだけ操作できる', async ({ page }) => {
  await page.goto(candidate + '?test=1');
  await expect(page.locator('#token-gate')).toBeVisible();
  await expect(page.locator('#specv-test-panel')).toBeHidden();
  await page.goto(candidate + '?test=1&token=F-REGULAR');
  await expect(page.locator('#token-gate')).toBeHidden();
  await expect(page.locator('#specv-test-panel')).toBeHidden();
  expect(await page.evaluate(() => window.SPECV_TEST_AUTHORIZED)).toBe(false);
  await page.goto(candidate + '?test=1&token=F-TEST');
  await expect(page.locator('#specv-test-panel')).toBeVisible();
});
test('LATESTの実URLと旧安定版は認証ゲートへ到達する', async ({ page }) => {
  const latest = fs.readFileSync('main.html', 'utf8').match(/const LATEST = '([^']+)'/)[1];
  await page.goto('/main.html?test=1');
  await expect(page).toHaveURL(new RegExp(latest + '\\?test=1'));
  await expect(page.locator('#token-gate')).toBeVisible();
  await page.goto('/specv_form_v6_integrated_55.html?test=1');
  await expect(page.locator('#token-gate')).toBeVisible();
});
test('API: claim偽造・token乗換え・管理認証未設定を拒否する', async ({ request }) => {
  const auth = await (await request.get('/api/token?id=P-E2E')).json();
  expect(auth.valid).toBe(true);
  expect((await request.post('/api/token', { data: { token_id: 'P-E2E', claim: auth.claim + 'x' } })).status()).toBe(403);
  expect((await request.get('/api/token?id=F-TEST', { headers: { 'x-specv-bound-token': 'P-E2E' } })).status()).toBe(403);
  expect((await request.post('/api/analyze', { headers: { 'x-specv-dev': '1' }, data: {} })).status()).toBe(401);
  expect((await request.get('/api/admin-tokens')).status()).toBe(401);
  await request.post('/__test/admin-config', { data: { enabled: false } });
  for (const name of ['admin-tokens','admin-departments']) expect((await request.get('/api/' + name)).status()).toBe(401);
  expect((await state(request)).tokens[0].status).toBe('unused');
});
test('API: used_atが更新され、無効な更新と二重消費で成功を返さない', async ({ request }) => {
  const { claim } = await (await request.get('/api/token?id=P-E2E')).json();
  const data = { token_id: 'P-E2E', claim };
  expect((await request.post('/api/token', { data })).status()).toBe(200);
  const first = (await state(request)).tokens[0].used_at;
  expect(Number.isFinite(Date.parse(first))).toBe(true);
  expect((await request.post('/api/token', { data })).status()).toBe(409);
  expect((await state(request)).tokens[0].used_at).toBe(first);
  expect((await request.post('/api/notify', { data })).status()).toBe(200);
  expect((await state(request)).tokens[0].used_at).toBe(first);
});
test('API: AIの空本文と途中終了を成功扱いしない', async ({ request }) => {
  const { claim } = await (await request.get('/api/token?id=P-E2E')).json();
  const headers = { 'x-specv-token': 'P-E2E', 'x-specv-claim': claim };
  const data = { model: 'test', max_tokens: 3000, messages: [{ role: 'user', content: '【SUMMARY】【STRENGTH】【HONEST】【NEXT】【OVERALL】' }] };
  for (const option of ['aiEmpty','aiTruncated']) {
    await request.post('/__test/options', { data: { aiEmpty: false, aiTruncated: false, [option]: true } });
    const response = await request.post('/api/analyze', { headers, data });
    expect(response.status()).toBe(502);
    expect((await response.json()).code).toBe(option === 'aiEmpty' ? 'ANTHROPIC_EMPTY_TEXT' : 'AI_OUTPUT_TRUNCATED');
  }
});
