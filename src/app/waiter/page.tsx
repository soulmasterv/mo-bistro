import WaiterDashboard from "./waiter-dashboard";
import WorkspaceHeader from "@/components/workspace-header";
import { requireStaffPage } from "@/lib/require-staff-page";
import { notFound } from "next/navigation";
import { waiterEnabled } from "@/lib/feature-settings";

export default async function Page() {
  const staff = await requireStaffPage(["manager", "waiter"]);
  if (!await waiterEnabled()) notFound();
  return <><WorkspaceHeader username={staff.username} role={staff.role} workspace="Waiter" /><WaiterDashboard /></>;
}
