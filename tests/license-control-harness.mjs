import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {load,requireDependency} from './handler-harness.mjs';
const {PGlite}=requireDependency('@electric-sql/pglite');
export const TEST_KEY='ab'.repeat(32);
export async function licenseHarness() {
  const db=new PGlite();
  await db.exec(fs.readFileSync('migrations/002_licensing.sql','utf8'));
  const queries=[];
  function adapter(connection) {
    const sql=async(strings,...values)=>{
      const query=strings.reduce((q,p,i)=>q+p+(i<values.length?'$'+(i+1):''),'');
      queries.push(query);
      if(query.includes('pg_advisory_xact_lock')) return []; // No independent PG sessions in embedded test.
      return (await connection.query(query,values)).rows;
    };
    sql.begin=fn=>connection.transaction(tx=>fn(adapter(tx)));
    return sql;
  }
  const sql=adapter(db),cache=new Map();
  const env={MO_BISTRO_DB:'postgres',MO_BISTRO_POSTGRES_URL:'postgresql://reader:synthetic@ep-test.example.neon.tech/mo_bistro_2',
    LICENSE_ADMIN_DATABASE_URL:'postgresql://writer:synthetic@ep-test-pooler.example.neon.tech/mo_bistro_2',
    LICENSE_ADMIN_KEY_SHA256:createHash('sha256').update(TEST_KEY).digest('hex')};
  const mocks={postgres:()=>sql,'@/lib/staff-auth':{currentStaff:async()=>null}};
  const globals={process:{env}};
  const core=load('src/lib/licensing/core.ts',mocks,globals,cache);
  const admin=load('src/app/api/license/admin/[action]/route.ts',mocks,globals,cache);
  const status=load('src/app/api/license/status/route.ts',mocks,globals,cache);
  const enforce=load('src/lib/licensing/enforce.ts',mocks,globals,cache);
  async function backendFetch(url,options={}) {
    const request=new Request(url,options);
    const action=new URL(url).pathname.split('/').at(-1);
    if(new URL(url).pathname==='/api/license/status') return status.GET(request);
    return admin[request.method](request,{params:Promise.resolve({action})});
  }
  return {db,sql,queries,env,core,admin,status,enforce,backendFetch,close:()=>db.close()};
}
