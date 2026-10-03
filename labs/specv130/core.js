(function(root){
'use strict';
const BLOCKS={trait:[4,4],mode:[4,4],stress:[4,4],competency:[16,2],axis:[5,10]};
const MODES=['A','experimentalABC'];
const STATES=['answered','no_opportunity','cannot_judge','unanswered'];
const numeric=v=>Number.isInteger(v)&&v>=1&&v<=7;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const mean=a=>a.reduce((sum,x)=>sum+x,0)/a.length;
function demand(ok,message){if(!ok)throw Error(message);}
function validateBank(bank){
  demand(object(bank)&&bank.format==='specv130-bank-v3','Bank format mismatch');
  for(const key of ['version','measurementVersion','scoringVersion'])demand(typeof bank[key]==='string'&&bank[key].length>0,'Missing bank revision');
  demand(/^[a-f0-9]{64}$/.test(bank.sha256),'Missing bank hash');
  demand(Array.isArray(bank.slots)&&bank.slots.length===130,'Expected 130 slots');
  const ids=new Set(),variants=new Set(),groups={};
  for(const s of bank.slots){
    demand(object(s)&&typeof s.id==='string'&&/^[A-Z0-9-]+$/.test(s.id)&&!ids.has(s.id),'Duplicate or invalid slot');ids.add(s.id);
    demand(Object.hasOwn(BLOCKS,s.block)&&typeof s.target==='string'&&s.target.length>0,'Invalid block/target');
    const key=s.block+':'+s.target;(groups[key]??=[]).push(s);
    demand(['agreement','frequency'].includes(s.scale)&&typeof s.reverse==='boolean','Invalid scale/direction');
    if(s.block==='competency')demand(['intent','behavior'].includes(s.role),'Invalid pair role');
    demand(Array.isArray(s.variants)&&s.variants.length===3,'Expected A/B/C');
    for(const [i,v]of s.variants.entries()){
      demand(object(v)&&v.label==='ABC'[i]&&v.id===s.id+'-'+v.label&&!variants.has(v.id),'Invalid variant identity');variants.add(v.id);
      for(const field of ['text','period','scene','opportunity','review'])demand(typeof v[field]==='string'&&v[field].length>0,'Missing variant metadata: '+field);
      demand(v.equivalence==='unverified','Equivalence is not established');
      demand(['candidate','hold'].includes(v.disposition),'Invalid review disposition');
      const kinds={trait:['preference'],mode:['behavior'],stress:['reaction','coping'],competency:s.role==='intent'?['intent','state']:['behavior'],axis:['state']};
      demand(kinds[s.block].includes(v.kind),'Invalid measurement kind');
      if(s.block==='competency'&&s.role==='intent'&&v.kind==='state')demand(v.disposition==='hold','State item cannot represent intent');
      demand(typeof v.reverse==='boolean'&&v.scale===s.scale,'Variant direction/scale missing');
      if(s.block==='stress')demand(['reaction','coping'].includes(v.kind)&&!v.reverse,'Stress requires direct reaction or separate coping');
    }
  }
  for(const [block,[targets,count]]of Object.entries(BLOCKS)){
    const matches=Object.entries(groups).filter(([k])=>k.startsWith(block+':'));
    demand(matches.length===targets&&matches.every(([,g])=>g.length===count),'Wrong target allocation: '+block);
    if(block==='competency')for(const [,g]of matches)demand(new Set(g.map(x=>x.role)).size===2,'Missing intent/behavior pair');
  }
  return bank;
}
function pick(rng,n){const x=rng();demand(Number.isFinite(x)&&x>=0&&x<1,'Invalid RNG');return Math.floor(x*n);}
function shuffle(items,rng){const a=items.slice();for(let i=a.length-1;i>0;i--){const j=pick(rng,i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function create(bank,context='職場',rng=Math.random,variantMode='A'){
  validateBank(bank);demand(MODES.includes(variantMode),'Invalid administration mode');
  demand(['職場','学業','地域活動','その他'].includes(context),'Invalid context');
  let sequence=bank.slots.map(s=>({slotId:s.id,variantId:s.variants[variantMode==='A'?0:pick(rng,3)].id}));
  if(variantMode==='experimentalABC')sequence=shuffle(sequence,rng);
  demand(root.crypto?.randomUUID,'UUID generator unavailable');
  return {format:'specv130-session-v3',assessmentId:root.crypto.randomUUID(),bankVersion:bank.version,bankHash:bank.sha256,
    measurementVersion:bank.measurementVersion,scoringVersion:bank.scoringVersion,startedAt:new Date().toISOString(),context,
    variantMode,sequence,index:0,demo:false,answers:Object.fromEntries(bank.slots.map(s=>[s.id,{status:'unanswered',value:null}]))};
}
function validate(bank,input){
  validateBank(bank);
  demand(object(input)&&input.format==='specv130-session-v3','Old session: retain original; explicit migration required');
  for(const [a,b]of [['bankVersion','version'],['bankHash','sha256'],['measurementVersion','measurementVersion'],['scoringVersion','scoringVersion']])demand(input[a]===bank[b],'Revision mismatch: '+a);
  demand(MODES.includes(input.variantMode)&&['職場','学業','地域活動','その他'].includes(input.context),'Invalid administration metadata');
  demand(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.assessmentId),'Invalid assessment ID');
  demand(typeof input.startedAt==='string'&&Number.isFinite(Date.parse(input.startedAt))&&typeof input.demo==='boolean','Invalid record metadata');
  demand(Number.isInteger(input.index)&&input.index>=0&&input.index<130,'Invalid position');
  demand(Array.isArray(input.sequence)&&input.sequence.length===130&&object(input.answers)&&Object.keys(input.answers).length===130,'Invalid record shape');
  const map=new Map(bank.slots.map(s=>[s.id,s])),seen=new Set(),answers={};
  const sequence=input.sequence.map((q,i)=>{
    const s=map.get(q?.slotId);demand(s&&!seen.has(s.id)&&s.variants.some(v=>v.id===q.variantId),'Invalid selection');seen.add(s.id);
    if(input.variantMode==='A')demand(q.variantId===s.id+'-A'&&s.id===bank.slots[i].id,'Fixed A selection/order changed');
    const a=input.answers[s.id];demand(object(a)&&STATES.includes(a.status)&&(a.status==='answered'?numeric(a.value):a.value===null),'Invalid answer');
    answers[s.id]={status:a.status,value:a.value};return {slotId:s.id,variantId:q.variantId};
  });
  // Whitelist record fields: imported derived scores/snapshots are never trusted.
  return {format:input.format,assessmentId:input.assessmentId,bankVersion:input.bankVersion,bankHash:input.bankHash,
    measurementVersion:input.measurementVersion,scoringVersion:input.scoringVersion,startedAt:input.startedAt,context:input.context,
    variantMode:input.variantMode,sequence,index:input.index,demo:input.demo,answers};
}
function oriented(variant,answer){
  if(answer.status!=='answered'||!numeric(answer.value)||variant.kind==='coping')return null;
  return variant.reverse?8-answer.value:answer.value;
}
function score(bank,input){
  const session=validate(bank,input),map=new Map(bank.slots.map(s=>[s.id,s]));
  const groups=Object.fromEntries(Object.keys(BLOCKS).map(b=>[b,Object.create(null)]));
  const missing=Object.fromEntries(STATES.map(x=>[x,0]));
  for(const [order,q]of session.sequence.entries()){
    const s=map.get(q.slotId),v=s.variants.find(v=>v.id===q.variantId),a=session.answers[s.id];missing[a.status]++;
    const g=groups[s.block][s.target]??={items:[]};
    g.items.push({slotId:s.id,variantId:v.id,order:order+1,role:s.role,kind:v.kind,scale:v.scale,direction:v.reverse?'R':'P',
      status:a.status,raw:a.value,oriented:s.block==='competency'?null:oriented(v,a),disposition:v.disposition});
  }
  for(const [block,targets]of Object.entries(groups))for(const g of Object.values(targets)){
    g.count=g.items.filter(x=>x.status==='answered').length;g.expected=g.items.length;g.complete=g.count===g.expected;
    g.mean=null;
    if(block==='competency'){
      g.intent=g.items.find(x=>x.role==='intent');g.behavior=g.items.find(x=>x.role==='behavior');g.reason='separate_scales';
    }else{
      g.reason=session.variantMode!=='A'?'experimental_variants':g.items.some(x=>x.disposition==='hold'||(block==='stress'&&x.kind!=='reaction'))?'construct_review':!g.complete?'missing':null;
      if(!g.reason)g.mean=mean(g.items.map(x=>x.oriented));
    }
  }
  return {groups,missing,answered:130-missing.unanswered,numeric:missing.answered,officialDrive:null,officialType:null,officialLevel:null,
    researchActionCandidate:null,stressRepresentative:null,firewallDecision:null,
    caveat:'独立試験版。測定妥当性・A/B/C同等性は未検証。81問版と比較しない。'};
}
function exportRecord(bank,input){
  const session=validate(bank,input),map=new Map(bank.slots.map(s=>[s.id,s]));
  return {...session,exportedAt:new Date().toISOString(),derived:score(bank,session),questionSnapshot:session.sequence.map((q,i)=>{
    const s=map.get(q.slotId),v=s.variants.find(v=>v.id===q.variantId);return {...q,order:i+1,block:s.block,target:s.target,role:s.role,...v};
  })};
}
const api={validateBank,create,validate,score,oriented,exportRecord};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SpecVLab=api;
})(typeof globalThis!=='undefined'?globalThis:this);
