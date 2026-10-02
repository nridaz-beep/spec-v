(function(root){
  'use strict';
  const CURRENT = Object.freeze({measurement_version:'81-slots-20261002',scoring_version:'81-stress-20261002'});
  const uuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const version = value => typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value);
  function normalize(input={}) {
    const fields={assessment_id:'assessmentId',measurement_version:'measurementVersion',scoring_version:'scoringVersion'};
    const result={};
    for(const [key,alias] of Object.entries(fields)) {
      if(input[key]!=null && input[alias]!=null && input[key]!==input[alias])throw new Error('conflicting_assessment_metadata');
      result[key]=input[key]??input[alias]??null;
    }
    if(Object.values(result).every(v=>v===null))return {...result,cohort:'legacy'};
    if(!uuid(result.assessment_id)||!version(result.measurement_version)||!version(result.scoring_version))throw new Error('incomplete_assessment_metadata');
    return {...result,assessment_id:result.assessment_id.toLowerCase(),cohort:'versioned'};
  }
  function isCurrent(meta) {return meta.measurement_version===CURRENT.measurement_version && meta.scoring_version===CURRENT.scoring_version;}
  // Comparison does not require an assessment ID: pre-ID local history with an explicit
  // version remains comparable. Unknown/partial/conflicting versions are never comparable.
  function comparable(a,b) {
    const versions = x => {
      const m=x?.measurement_version??x?.measurementVersion,s=x?.scoring_version??x?.scoringVersion;
      if(x?.measurement_version!=null&&x?.measurementVersion!=null&&x.measurement_version!==x.measurementVersion)return null;
      if(x?.scoring_version!=null&&x?.scoringVersion!=null&&x.scoring_version!==x.scoringVersion)return null;
      return version(m)&&version(s)?[m,s]:null;
    };
    const x=versions(a),y=versions(b);return !!(x&&y&&x[0]===y[0]&&x[1]===y[1]);
  }
  const api={CURRENT,normalize,isCurrent,comparable,validVersion:version};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SpecVAssessment=api;
})(typeof globalThis!=='undefined'?globalThis:this);
