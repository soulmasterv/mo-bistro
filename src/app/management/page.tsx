import { testEnvironmentAllowed } from "@/lib/test-environment";
import ManagementDashboard from "./management-dashboard";
import WorkspaceHeader from "@/components/workspace-header";
import { requireStaffPage } from "@/lib/require-staff-page";

export default async function Page() {
  const staff = await requireStaffPage(["manager"]);
  return <><WorkspaceHeader role={staff.role} workspace="Management" /><ManagementDashboard showDemo={testEnvironmentAllowed()} /></>;
}
