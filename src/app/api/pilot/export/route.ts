import { exportRows,csv } from '@/lib/pilot/store';
import { pilotStaff,pilotUnavailable } from '@/lib/pilot/http';
export async function GET(){
 const denied=await pilotStaff();if(denied)return denied;
 try{const rows=await exportRows();if(rows.length>50000)return Response.json({error:'Export exceeds 50,000 parties. Ask the operator for a complete export.'},{status:413});
  return new Response(csv(rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="mo-bistro-pilot.csv"','Cache-Control':'no-store'}});
 }catch{return pilotUnavailable();}
}
