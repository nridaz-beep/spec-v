const {test,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {build}=require('../build.cjs'),{fixture}=require('./fixture.cjs'),core=require('../core');
const out=path.resolve(__dirname,'../../../tmp/specv130-ui');
fs.mkdirSync(out,{recursive:true});
const bankPath=process.env.SPECV130_BANK?path.resolve(process.env.SPECV130_BANK):path.join(out,'synthetic.reviewed.json');
if(!process.env.SPECV130_BANK)fs.writeFileSync(bankPath,JSON.stringify(fixture()));
const bank=JSON.parse(fs.readFileSync(bankPath,'utf8')),url=pathToFileURL(build(bankPath,out)).href;
let errors,external;
test.beforeEach(async({page})=>{errors=[];external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});await page.route(/^https?:/,route=>route.abort());page.on('dialog',d=>d.accept());await page.goto(url);});
test.afterEach(()=>{expect(errors).toEqual([]);expect(external).toEqual([]);});
async function exported(page){const pending=page.waitForEvent('download');await page.locator('#export').click();const file=await pending;return JSON.parse(fs.readFileSync(await file.path(),'utf8'));}
test('unanswered/NA/unknown, manual persistence, JSON resume and invalid import preserve original session',async({page})=>{
  await expect(page.locator('#variant')).toHaveValue('A');await page.locator('#start').click();await expect(page.locator('#next')).toBeDisabled();
  await page.locator('#choices button').nth(3).focus();await page.keyboard.press('Enter');await expect(page.locator('#next')).toBeEnabled();await page.locator('#clear').click();await expect(page.locator('#next')).toBeDisabled();
  await page.locator('#na').click();await page.locator('#next').click();await page.locator('#unknown').click();await page.locator('#next').click();
  await page.locator('#save').click();const first=await exported(page);expect(first.derived.missing).toEqual({answered:0,no_opportunity:1,cannot_judge:1,unanswered:128});
  await page.reload();await page.locator('#resume').click();await expect(page.locator('#counter')).toContainText('3 / 130');
  expect(core.validate(bank,await exported(page))).toEqual(core.validate(bank,first));
  const invalid={...first,bankVersion:'old'};await page.locator('#import').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await expect(page.locator('#status')).toContainText('読み込めません');
  expect(core.validate(bank,await exported(page))).toEqual(core.validate(bank,first));
  await page.locator('#restart').click();await page.locator('#import').setInputFiles({name:'resume.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...first,derived:{officialLevel:10}}))});await expect(page.locator('#counter')).toContainText('3 / 130');expect((await exported(page)).derived.officialLevel).toBeNull();
});
test('130 actual UI responses complete all slots; separate pairs and withheld summaries survive export',async({page})=>{
  await page.locator('#start').click();
  for(let i=0;i<130;i++){await expect(page.locator('#counter')).toContainText(`${i+1} / 130`);await page.locator('#choices button').nth(3).click();await page.locator('#next').click();}
  await expect(page.locator('#results')).toBeVisible();await expect(page.locator('#resultBody')).toContainText('平均・減算しません');await expect(page.locator('#resultBody')).toContainText('推進力・タイプ・Lv・行動発揮候補は算出しません');
  const record=await exported(page);expect(record.demo).toBe(false);expect(record.sequence).toHaveLength(130);expect(new Set(record.sequence.map(q=>q.slotId)).size).toBe(130);expect(record.questionSnapshot).toHaveLength(130);
  for(const g of Object.values(record.derived.groups.competency)){expect(g.mean).toBeNull();expect(g.gap).toBeUndefined();expect(g.intent.raw).toBe(4);expect(g.behavior.raw).toBe(4);}
  expect(record.derived.stressRepresentative).toBeNull();await page.screenshot({path:path.join(out,'completed.png'),fullPage:true});
});
test('mobile experimental demo records all choices/order and bank hash, pooling stays disabled',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.locator('#variant').selectOption('experimentalABC');await page.locator('#demo').click();await expect(page.locator('#resultDemo')).toBeVisible();await expect(page.locator('#resultMeta')).toContainText('同等性未検証');
  const record=await exported(page);expect(record.demo).toBe(true);expect(record.bankHash).toBe(bank.sha256);expect(record.variantMode).toBe('experimentalABC');
  for(const block of Object.values(record.derived.groups))for(const g of Object.values(block))expect(g.mean).toBeNull();
  expect(core.validate(bank,JSON.parse(JSON.stringify(record))).sequence).toEqual(record.sequence);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#edit').click();await page.locator('#choices button').first().click();await page.locator('#save').click();await page.reload();await page.locator('#resume').click();expect((await exported(page)).sequence).toEqual(record.sequence);
});
