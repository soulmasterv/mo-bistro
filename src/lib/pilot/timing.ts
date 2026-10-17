import 'server-only';
type DbMeasure = <T>(work:()=>Promise<T>)=>Promise<T>;
let firstHandlerRequest=true;
// Opt-in test diagnostics. DB-path time includes pool wait, network and SQL work;
// it is not a claim about Postgres engine execution time or Vercel cold starts.
export async function timedPilotRoute(handler:(db:DbMeasure)=>Promise<Response>) {
 if(process.env.PILOT_LOAD_DIAGNOSTICS!=='true')return handler(work=>work());
 const first=firstHandlerRequest;firstHandlerRequest=false;
 const start=performance.now();let databaseMs=0;
 const db:DbMeasure=async work=>{const began=performance.now();try{return await work();}finally{databaseMs+=performance.now()-began;}};
 const response=await handler(db);
 response.headers.set('Server-Timing',`db_path;dur=${databaseMs.toFixed(1)}, handler;dur=${(performance.now()-start).toFixed(1)}`);
 response.headers.set('X-Pilot-Handler-First',first?'1':'0');
 response.headers.set('X-Pilot-Process-Age-Ms',String(Math.round(process.uptime()*1000)));
 return response;
}
