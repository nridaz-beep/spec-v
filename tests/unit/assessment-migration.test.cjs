const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDb,up,down}=require('../helpers/assessment-db.cjs');
const org='10000000-0000-4000-8000-000000000001';
const aid='20000000-0000-4000-8000-000000000001';

test('migration preserves legacy rows; real PostgreSQL constraints/RLS, rollback retention and restore',async()=>{
  const db=await createDb({migrate:false});
  try {
    await db.query('INSERT INTO organizations VALUES ($1)',[org]);
    await db.query("INSERT INTO tokens(id,org_id) VALUES ('P-LEGACY',$1),('P-NEW',$1)",[org]);
    await db.query(`INSERT INTO organization_assessments(token_id,org_id,type_name,axis_suishinryoku,axis_doku,axis_kaihoudu,axis_jikoniinti,axis_tamashii,axis_ai) VALUES ('P-LEGACY',$1,'静水型',2,2,2,2,2,2)`,[org]);
    const before=(await db.query('SELECT * FROM organization_assessments')).rows;
    await db.exec(up());
    assert.deepEqual((await db.query('SELECT * FROM organization_assessments')).rows,before);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM assessment_results')).rows[0].n,0);
    const insert=`INSERT INTO assessment_results(assessment_id,token_id,org_id,measurement_version,scoring_version,completed_at,type_name,axis_suishinryoku,axis_doku,axis_kaihoudu,axis_jikoniinti,axis_tamashii,axis_ai) VALUES ($1,'P-NEW',$2,'81-slots-20261002','81-stress-20261002',now(),'黎明型',5,5,5,5,5,5)`;
    await db.exec('SET ROLE service_role');
    await db.query(insert,[aid,org]);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM assessment_results')).rows[0].n,1);
    await assert.rejects(()=>db.exec('UPDATE assessment_results SET axis_ai=1'),/permission denied/);
    await assert.rejects(()=>db.exec('DELETE FROM assessment_results'),/permission denied/);
    await db.exec('RESET ROLE');
    for(const role of ['anon','authenticated']){
      await db.exec('SET ROLE '+role);
      await assert.rejects(()=>db.exec('SELECT * FROM assessment_results'),/permission denied/);
      await db.exec('RESET ROLE');
    }
    await assert.rejects(()=>db.query(insert,[aid,org]),/duplicate key/);
    await assert.rejects(()=>db.exec("UPDATE assessment_results SET measurement_version=NULL"),/not-null/);
    await assert.rejects(()=>db.exec("UPDATE assessment_results SET scoring_version=''"),/check constraint/);
    await assert.rejects(()=>db.exec('UPDATE assessment_results SET axis_ai=8'),/check constraint/);
    await db.exec('BEGIN;'+down()+'COMMIT;');
    assert.equal((await db.query("SELECT to_regclass('public.assessment_results') AS table_name")).rows[0].table_name,null);
    assert.equal((await db.query('SELECT assessment_id FROM specv_rollback.assessment_results')).rows[0].assessment_id,aid);
    assert.deepEqual((await db.query('SELECT * FROM organization_assessments')).rows,before);
    await db.exec('BEGIN;'+up()+'COMMIT;');
    assert.equal((await db.query('SELECT assessment_id FROM assessment_results')).rows[0].assessment_id,aid);
    await db.exec(up()); // Retry-safe after a completed application.
    assert.equal((await db.query('SELECT count(*)::int AS n FROM assessment_results')).rows[0].n,1);
  }finally{await db.close();}
});
