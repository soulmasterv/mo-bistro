import { redirect } from "next/navigation";
import PilotReception from "@/components/pilot/reception";
import ReceptionBuild from "@/components/reception-build";
import { PILOT_STAFF_USERNAME } from "@/lib/pilot/config";
import { currentStaff } from "@/lib/staff-auth";

export default async function Page() {
  const staff = await currentStaff();
  if (!staff || staff.username.toLowerCase() !== PILOT_STAFF_USERNAME) redirect("/login");
  return <PilotReception username={staff.username} role={staff.role}><ReceptionBuild environment="Development" /></PilotReception>;
}
