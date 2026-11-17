import {currentStaff} from "@/lib/staff-auth";
import {rejectCrossOrigin} from "@/lib/guest-api-security";
import {defaultSchedule,readSchedule,scheduleSchema,scheduleState,writeSchedule} from "@/lib/waitlist-schedule";

export async function GET() {
  const raw = await readSchedule();
  const staff = await currentStaff();
  return Response.json({closedMessage:scheduleState(raw),schedule:staff?.role==="manager" ? raw ? JSON.parse(raw) : defaultSchedule : undefined},{headers:{"Cache-Control":"private, no-store"}});
}

export async function PUT(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if ((await currentStaff())?.role !== "manager") return Response.json({error:"Manager access required."},{status:403});
  const result = scheduleSchema.safeParse(await request.json().catch(()=>null));
  if (!result.success) return Response.json({error:result.error.issues[0]?.message},{status:400});
  await writeSchedule(result.data);
  return Response.json({saved:true});
}
