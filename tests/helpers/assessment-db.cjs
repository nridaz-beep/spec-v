// Isolated in-memory PostgreSQL (WASM). Never reads credentials or connects to Supabase.
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const MIGRATION='20261002210843_assessment_versions';
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const up=()=>read('supabase/migrations/'+MIGRATION+'.sql');
const down=()=>read('supabase/rollback/'+MIGRATION+'.sql');
async function createDb({migrate=true}={}) {
  const db=new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.organizations(id uuid PRIMARY KEY);
    CREATE TABLE public.departments(id uuid PRIMARY KEY,org_id uuid REFERENCES organizations(id),name text,target_count integer,created_at timestamptz DEFAULT now());
    CREATE TABLE public.tokens(id text PRIMARY KEY,org_id uuid REFERENCES organizations(id),department_id uuid REFERENCES departments(id));
  `);
  await db.exec(read('supabase_organization_map_migration.sql'));
  if(migrate)await db.exec(up());
  return db;
}
module.exports={createDb,up,down,MIGRATION};
