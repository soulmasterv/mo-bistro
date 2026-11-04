import { loginPostgres } from "@/lib/login-postgres";
import { PILOT_STAFF_USERNAME } from "@/lib/pilot/config";

function redirectTo(location:string){
 return new Response(null,{status:303,headers:{Location:location,"Cache-Control":"no-store"}});
}

export async function POST(request:Request){
 const form=request.headers.get('content-type')?.split(';')[0]==='application/x-www-form-urlencoded';
 try{
  const body=form?Object.fromEntries(await request.formData()):await request.clone().json().catch(()=>null);
  if(typeof body?.username!=='string'||body.username.trim().toLowerCase()!==PILOT_STAFF_USERNAME){
   return form?redirectTo('/login?error=credentials'):Response.json({error:'Invalid login details.'},{status:401});
  }
  if(!form)return loginPostgres(request);
  const headers=new Headers(request.headers);
  headers.set('content-type','application/json');
  headers.delete('content-length');
  const result=await loginPostgres(new Request(request.url,{method:'POST',headers,body:JSON.stringify(body)}));
  if(result.ok)return redirectTo('/queue');
  return redirectTo('/login?error='+(result.status===429?'rate':result.status>=500?'unavailable':'credentials'));
 }catch{
  return form?redirectTo('/login?error=unavailable'):Response.json({error:'Unable to log in.'},{status:500});
 }
}
