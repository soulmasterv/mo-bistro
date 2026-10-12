import ReceptionDashboard from "./reception-dashboard";
import WorkspaceHeader from "@/components/workspace-header";
import { requireStaffPage } from "@/lib/require-staff-page";

export default async function Page() {
  const staff = await requireStaffPage(["manager", "reception"]);
  return <><WorkspaceHeader role={staff.role} workspace="Reception" /><ReceptionDashboard /></>;
}
