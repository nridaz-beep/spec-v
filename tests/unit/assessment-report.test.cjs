const {test}=require('node:test');
const assert=require('node:assert/strict');
const {CURRENT}=require('../../assessment-contract');
const handler=require('../../api/deep-report');
const diagnostic={token_id:'P001',...CURRENT,assessment_id:'10000000-0000-4000-8000-000000000001'};
for(const k of ['suishinryoku','doku','kaihoudu','jikoniinti','tamashii','ai'])diagnostic['axis_'+k]=5;
for(const k of ['shimeikan','vision','seichou','senken','nebari','taisha','kyoukan','shinrai','shounin','kizohu','kouketsu','kanjou','makaseru','kougeki','shinri','tayousei'])diagnostic['comp_'+k]=5;
for(const k of ['age','position','industry','purpose','level','temperament','mode','stress'])diagnostic[k]='synthetic';
diagnostic.type_name='黎明型';
const report='# Test\n'+['現在地','中心的な力','同じ根','現在の詰まり','ストレス時','力が出る環境','本人の一手','周囲の一手','確認事項'].map(x=>'| '+x+' | synthetic |').join('\n')+'\n'+Array.from({length:4},(_,i)=>'## '+i+'\n'+Array.from({length:3},(_,j)=>'### '+i+'-'+j+'\n本文').join('\n')).join('\n');
async function invoke(d){let body,status;await handler({method:'POST',headers:{'x-admin-password':'isolated-admin'},body:{token_id:'P001',diagnostic:d}},{setHeader(){},status(n){status=n;return this;},json(d){body=d;}});return {status,body};}
test('admin report carries canonical metadata into AI and response; legacy is explicit and partial metadata stops before AI',async()=>{
  const oldFetch=global.fetch,oldAdmin=process.env.ADMIN_PASSWORD,oldAI=process.env.ANTHROPIC_API_KEY;const calls=[];
  process.env.ADMIN_PASSWORD='isolated-admin';process.env.ANTHROPIC_API_KEY='isolated-key';
  global.fetch=async(url,init)=>{assert.equal(url,'https://api.anthropic.com/v1/messages');calls.push(JSON.parse(init.body));return Response.json({content:[{type:'text',text:report}],stop_reason:'end_turn'});};
  try{
    const current=await invoke(diagnostic);assert.equal(current.status,200);assert.equal(current.body.assessment_id,diagnostic.assessment_id);assert.equal(current.body.scoring_version,CURRENT.scoring_version);assert.ok(calls[0].messages[0].content.includes(diagnostic.assessment_id));
    const partial={...diagnostic};delete partial.assessment_id;assert.equal((await invoke(partial)).status,422);assert.equal(calls.length,1);
    const legacy={...partial};delete legacy.measurement_version;delete legacy.scoring_version;const old=await invoke(legacy);assert.equal(old.status,200);assert.equal(old.body.cohort,'legacy');assert.equal(old.body.assessment_id,null);
  }finally{global.fetch=oldFetch;for(const [key,value] of [['ADMIN_PASSWORD',oldAdmin],['ANTHROPIC_API_KEY',oldAI]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
