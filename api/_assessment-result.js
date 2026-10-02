// Minimal immutable results only: never store answer text or personal profile here.
const { normalize, isCurrent } = require('../assessment-contract');
const AXES=['axis_suishinryoku','axis_doku','axis_kaihoudu','axis_jikoniinti','axis_tamashii','axis_ai'];
function validateResult(d) {
  const meta=normalize(d);
  if(meta.cohort==='legacy')return meta;
  if(!isCurrent(meta))throw new Error('unsupported_assessment_version');
  if(!['黎明型','潤い型','静水型','孤炎型'].includes(d.type_name) || AXES.some(k=>typeof d[k]!=='number'||!Number.isFinite(d[k])||d[k]<1||d[k]>7))throw new Error('invalid_assessment_scores');
  if(typeof d.timestamp!=='string'||!Number.isFinite(Date.parse(d.timestamp)))throw new Error('invalid_assessment_timestamp');
  return meta;
}
async function saveResult(db,d,meta) {
  const tokenId=String(d.token_id).trim().toUpperCase();
  const {data:token,error:tokenError}=await db.from('tokens').select('id, org_id, department_id').eq('id',tokenId).maybeSingle();
  if(tokenError)throw tokenError;
  if(!token)throw new Error('assessment_token_not_found');
  if(meta.cohort==='legacy') {
    if(!token.org_id || !d.type_name)return {ok:true,skipped:true,cohort:'legacy'};
    const row={token_id:token.id,org_id:token.org_id,department_id:token.department_id||null,completed_at:d.timestamp||new Date().toISOString(),type_name:String(d.type_name).trim()};
    for(const k of AXES){const n=Number(d[k]);row[k]=Number.isFinite(n)&&n>=0&&n<=7?n:0;}
    // Old notifications remain in the old table. Preserve any existing legacy snapshot.
    const {error}=await db.from('organization_assessments').upsert(row,{onConflict:'token_id',ignoreDuplicates:true});
    if(error)throw error;
    return {ok:true,cohort:'legacy'};
  }
  const {cohort,...identity}=meta;
  const row={...identity,token_id:token.id,org_id:token.org_id||null,department_id:token.department_id||null,completed_at:d.timestamp,type_name:d.type_name};
  for(const k of AXES)row[k]=d[k];
  // A token buys one assessment. Ignore retry INSERTs, then verify the stored identity
  // and scores; never use an upsert that rewrites an existing result.
  const {error}=await db.from('assessment_results').upsert(row,{onConflict:'token_id',ignoreDuplicates:true});
  if(error)throw error;
  const {data:saved,error:readError}=await db.from('assessment_results').select('*').eq('token_id',token.id).single();
  if(readError)throw readError;
  for(const k of ['assessment_id','measurement_version','scoring_version','type_name',...AXES]) {
    if(saved[k]!==row[k] && !(AXES.includes(k)&&Number(saved[k])===row[k]))throw new Error('assessment_identity_conflict');
  }
  return {ok:true,cohort,...identity};
}
module.exports={validateResult,saveResult,AXES};
