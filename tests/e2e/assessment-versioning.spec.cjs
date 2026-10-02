const {test,expect}=require('@playwright/test');
const {randomUUID,createHash}=require('node:crypto');
const {CURRENT}=require('../../assessment-contract');
const org='10000000-0000-4000-8000-000000000001';
const department='10000000-0000-4000-8000-000000000002';
const key='isolated-map-key';
const axes=value=>Object.fromEntries(['suishinryoku','doku','kaihoudu','jikoniinti','tamashii','ai'].map(k=>['axis_'+k,value]));
const result=(id,value=5)=>({assessment_id:id,...CURRENT,type_name:'黎明型',timestamp:'2026-10-03T00:00:00Z',...axes(value)});
const tokens=Array.from({length:12},(_,i)=>({id:'P-V'+i,type:'paid',status:'unused',org_id:org,department_id:department,issued_at:'2026-01-01T00:00:00Z',note:''}));
const oldRows=Array.from({length:5},(_,i)=>({token_id:'P-V'+i,org_id:org,department_id:department,type_name:'静水型',...axes(2)}));
const url=params=>'/api/organization-map?'+new URLSearchParams({org_id:org,...params});
const auth={'x-org-map-key':key};
const state=async request=>(await request.get('/__test/state')).json();
async function notify(request,token,body){
  const {claim}=await (await request.get('/api/token?id='+token)).json();
  return {claim,response:await request.post('/api/notify',{data:{token_id:token,claim,...body}})};
}
test.beforeEach(async({request})=>{
  await request.post('/__test/reset',{data:{tokens,organizations:[{id:org}],departments:[{id:department,org_id:org,name:'Test department'}],mapAccess:[{org_id:org,access_key_hash:createHash('sha256').update(key).digest('hex')}],legacyAssessments:oldRows}});
});
test('new results persist identity; cohort queries exclude legacy and other scoring revisions; retries cannot rewrite',async({request})=>{
  const ids=[];
  for(let i=0;i<5;i++){
    const id=randomUUID();ids.push(id);
    const {response,claim}=await notify(request,'P-V'+i,result(id));
    expect(response.status()).toBe(200);
    expect((await response.json()).assessment).toMatchObject({...CURRENT,assessment_id:id});
    const retry=await request.post('/api/notify',{data:{token_id:'P-V'+i,claim,...result(id),deep_input:'synthetic follow-up'}});
    expect(retry.status()).toBe(200);
    const conflict=await request.post('/api/notify',{data:{token_id:'P-V'+i,claim,...result(randomUUID(),6)}});
    expect(conflict.status()).toBe(409);
  }
  const s=await state(request);
  expect(s.savedAssessments).toHaveLength(5);
  expect(s.savedLegacyAssessments).toHaveLength(5);
  expect(s.savedLegacyAssessments.every(x=>Number(x.axis_ai)===2)).toBe(true);
  expect(s.savedAssessments.map(x=>x.assessment_id).sort()).toEqual(ids.slice().sort());
  expect(s.savedAssessments.every(x=>x.measurement_version===CURRENT.measurement_version&&x.scoring_version===CURRENT.scoring_version)).toBe(true);
  expect(s.mails[0].text).toContain(ids[0]);
  const current=await (await request.get(url(CURRENT),{headers:auth})).json();
  expect(current).toMatchObject({...CURRENT,sample_size:5,summary:{overall:5}});
  const legacy=await (await request.get(url({}),{headers:auth})).json();
  expect(legacy).toMatchObject({cohort:'legacy',measurement_version:null,sample_size:5,summary:{overall:2}});
  const explicit=await (await request.get(url({cohort:'legacy'}),{headers:auth})).json();
  expect(explicit).toEqual(legacy);
  const other=await (await request.get(url({...CURRENT,scoring_version:'other'}),{headers:auth})).json();
  expect(other.is_suppressed).toBe(true);
  expect((await request.get(url({measurement_version:CURRENT.measurement_version}),{headers:auth})).status()).toBe(400);
  expect((await request.get(url(CURRENT))).status()).toBe(401);
});
test('partial metadata is rejected before side effects; storage failure is retryable; legacy retry preserves original',async({request})=>{
  const {claim}=await (await request.get('/api/token?id=P-V0')).json();
  const bad=await request.post('/api/notify',{data:{token_id:'P-V0',claim,...CURRENT}});
  expect(bad.status()).toBe(422);
  expect((await state(request)).mails).toHaveLength(0);
  expect((await state(request)).tokens[0].status).toBe('unused');
  const legacy=await request.post('/api/notify',{data:{token_id:'P-V0',claim,type_name:'黎明型',...axes(7)}});
  expect(legacy.status()).toBe(200);
  expect((await state(request)).savedLegacyAssessments.every(x=>Number(x.axis_ai)===2)).toBe(true);
  const {claim:claim1}=await (await request.get('/api/token?id=P-V1')).json();
  const payload={token_id:'P-V1',claim:claim1,...result(randomUUID())};
  await request.post('/__test/options',{data:{assessmentDbFailures:1}});
  const failed=await request.post('/api/notify',{data:payload});expect(failed.status()).toBe(503);
  expect((await state(request)).savedAssessments).toHaveLength(0);
  expect((await request.post('/api/notify',{data:payload})).status()).toBe(200);
  expect((await state(request)).savedAssessments).toHaveLength(1);
});
test('organization screen selects current explicitly and can switch to legacy even with no current sample',async({page})=>{
  await page.goto('/organization-map.html');
  await page.locator('#orgId').fill(org);await page.locator('#accessKey').fill(key);
  await page.getByRole('button',{name:'組織マップを表示'}).click();
  await expect(page.locator('#suppressedState')).toBeVisible();
  await expect(page.locator('#cohortNote')).toContainText(CURRENT.measurement_version);
  await page.locator('#versionFilter').selectOption('legacy');
  await expect(page.locator('#mapContent')).toBeVisible();
  await expect(page.locator('#memberCount')).toHaveText('5人');
  await expect(page.locator('#orgAverage')).toHaveText('2.00');
  await expect(page.locator('#cohortNote')).toContainText('旧データ専用');
});

test('two populated scoring cohorts remain separate, including department filters and authenticated legacy compatibility',async({request})=>{
  const assessments=Array.from({length:10},(_,i)=>({assessment_id:randomUUID(),token_id:'P-V'+i,org_id:org,department_id:department,...CURRENT,scoring_version:i<5?CURRENT.scoring_version:'synthetic-revision',completed_at:'2026-10-03T00:00:00Z',type_name:'黎明型',...axes(i<5?5:7)}));
  await request.post('/__test/reset',{data:{tokens,organizations:[{id:org}],departments:[{id:department,org_id:org,name:'Test department'}],mapAccess:[{org_id:org,access_key_hash:createHash('sha256').update(key).digest('hex')}],legacyAssessments:oldRows,assessments}});
  for(const [params,average] of [[CURRENT,5],[{...CURRENT,scoring_version:'synthetic-revision'},7],[{cohort:'legacy'},2]]){
    const response=await request.get(url({...params,department_id:department}),{headers:auth});expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({sample_size:5,summary:{overall:average}});
  }
  expect((await request.get(url({...CURRENT,department_id:'10000000-0000-4000-8000-000000000099'}),{headers:auth})).status()).toBe(404);
  expect((await request.get(url(CURRENT),{headers:{'x-org-map-key':'incorrect'}})).status()).toBe(401);
});
