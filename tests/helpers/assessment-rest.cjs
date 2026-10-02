// Small PostgREST boundary adapter for the isolated test server, backed by PostgreSQL.
// Production Supabase SDK calls and SQL constraints still run; no live credentials exist.
const {createDb}=require('./assessment-db.cjs');
const TABLES=new Set(['assessment_results','organization_assessments','organization_map_access','departments']);
const identifier=s=>{if(!/^[a-z_]+$/.test(s))throw Error('Invalid test SQL identifier');return '"'+s+'"';};
async function seed(db,state){
  await db.exec('TRUNCATE assessment_results, organization_assessments, organization_map_access, tokens, departments, organizations CASCADE');
  for(const row of state.organizations||[])await db.query('INSERT INTO organizations(id) VALUES ($1)',[row.id]);
  for(const row of state.departments||[])await db.query('INSERT INTO departments(id,org_id,name) VALUES ($1,$2,$3)',[row.id,row.org_id,row.name]);
  for(const row of state.tokens)await db.query('INSERT INTO tokens(id,org_id,department_id) VALUES ($1,$2,$3)',[row.id,row.org_id||null,row.department_id||null]);
  for(const [table,rows] of [['organization_map_access',state.mapAccess],['organization_assessments',state.legacyAssessments],['assessment_results',state.assessments]]){
    for(const row of rows||[]){const keys=Object.keys(row);await db.query(`INSERT INTO ${identifier(table)} (${keys.map(identifier)}) VALUES (${keys.map((_,i)=>'$'+(i+1))})`,Object.values(row));}
  }
}
async function rest(db,table,req,res,url,state){
  if(!TABLES.has(table))return false;
  try{
    if(state.assessmentDbFailures>0&&table==='assessment_results'){state.assessmentDbFailures--;res.status(503).json({code:'XX000',message:'Injected assessment storage failure'});return true;}
    if(req.method==='POST'){
      const keys=Object.keys(req.body),values=Object.values(req.body);
      const conflict=url.searchParams.get('on_conflict');
      const ignore=req.headers.prefer?.includes('resolution=ignore-duplicates');
      if(!ignore)throw Error('Test adapter forbids mutating result upserts');
      const sql=`INSERT INTO ${identifier(table)} (${keys.map(identifier)}) VALUES (${keys.map((_,i)=>'$'+(i+1))}) ON CONFLICT (${identifier(conflict)}) DO NOTHING`;
      // Enforce the same role grants/RLS as production for new results.
      if(table==='assessment_results')await db.exec('SET ROLE service_role');
      try{await db.query(sql,values);}finally{await db.exec('RESET ROLE');}
      res.status(201).json(null);return true;
    }
    const clauses=[],values=[];
    for(const [key,value] of url.searchParams){
      if(['select','order','limit'].includes(key))continue;
      if(value.startsWith('eq.')){values.push(value.slice(3));clauses.push(identifier(key)+'=$'+values.length);}
      else if(value==='is.null')clauses.push(identifier(key)+' IS NULL');
      else throw Error('Unsupported test filter: '+key);
    }
    const projection=url.searchParams.get('select')||'*';
    const fields=projection==='*'?'*':projection.split(',').map(x=>identifier(x.trim())).join(',');
    let sql=`SELECT ${fields} FROM ${identifier(table)}`+(clauses.length?' WHERE '+clauses.join(' AND '):'');
    const order=url.searchParams.get('order');if(order){const [key,dir]=order.split('.');sql+=' ORDER BY '+identifier(key)+(dir==='desc'?' DESC':' ASC');}
    const limit=url.searchParams.get('limit');if(limit){if(!/^\d+$/.test(limit))throw Error('Invalid test limit');sql+=' LIMIT '+limit;}
    const {rows}=await db.query(sql,values);
    if(req.headers.accept?.includes('vnd.pgrst.object')){if(rows.length===1)res.json(rows[0]);else res.status(406).json({code:'PGRST116',details:'The result contains 0 rows'});}
    else res.json(rows);
  }catch(error){res.status(error.code==='23505'?409:400).json({code:error.code||'TEST_SQL',message:error.message});}
  return true;
}
module.exports={createDb,seed,rest};
