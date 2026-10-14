import WaiterDashboard from "./waiter-dashboard";
import WorkspaceHeader from "@/components/workspace-header";
import { requireStaffPage } from "@/lib/require-staff-page";

export default async function Page() {
  const staff = await requireStaffPage(["manager", "waiter"]);
  return <><WorkspaceHeader username={staff.username} role={staff.role} workspace="Waiter" /><WaiterDashboard /></>;
}
