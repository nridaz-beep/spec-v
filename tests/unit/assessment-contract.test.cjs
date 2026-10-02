const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalize,CURRENT,comparable}=require('../../assessment-contract');
const {validateResult}=require('../../api/_assessment-result');
const id='20000000-0000-4000-8000-000000000001';
test('identity normalizes canonical/camel fields without guessing partial metadata',()=>{
  assert.deepEqual(normalize({assessmentId:id,measurementVersion:CURRENT.measurement_version,scoringVersion:CURRENT.scoring_version}),{assessment_id:id,...CURRENT,cohort:'versioned'});
  assert.equal(normalize({}).cohort,'legacy');
  for(const input of [{...CURRENT},{assessment_id:id},{...CURRENT,assessment_id:''},{...CURRENT,assessment_id:id,measurementVersion:'other'},{measurement_version:'',scoring_version:''}])assert.throws(()=>normalize(input));
});
test('history accepts explicit equal revisions, including pre-ID history, but never unknown or mixed',()=>{
  assert.equal(comparable(CURRENT,{measurementVersion:CURRENT.measurement_version,scoringVersion:CURRENT.scoring_version}),true);
  assert.equal(comparable({},{}),false);
  assert.equal(comparable(CURRENT,{...CURRENT,scoring_version:'other'}),false);
  assert.equal(comparable({...CURRENT,measurementVersion:'other'},CURRENT),false);
});
test('new result rejects unsupported versions and incomplete scores instead of converting missing to zero',()=>{
  const valid={...CURRENT,assessment_id:id,timestamp:'2026-10-03T00:00:00Z',type_name:'静水型',axis_suishinryoku:4,axis_doku:4,axis_kaihoudu:4,axis_jikoniinti:4,axis_tamashii:4,axis_ai:4};
  assert.equal(validateResult(valid).cohort,'versioned');
  assert.throws(()=>validateResult({...valid,axis_ai:null}),/invalid_assessment_scores/);
  assert.throws(()=>validateResult({...valid,measurement_version:'130-trial'}),/unsupported_assessment_version/);
  assert.throws(()=>validateResult({...valid,timestamp:'?'}),/invalid_assessment_timestamp/);
});
