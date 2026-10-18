import { testEnvironmentAllowed } from "@/lib/test-environment";
import ManagementDashboard from "./management-dashboard";
import WorkspaceHeader from "@/components/workspace-header";
import { requireStaffPage } from "@/lib/require-staff-page";
import {advancedEnabled} from '@/lib/advanced/flags';
import AdvancedTableControls from '@/components/advanced-table-controls';

export default async function Page() {
  const staff = await requireStaffPage(["manager"]);
  return <><WorkspaceHeader username={staff.username} role={staff.role} workspace="Management" />{advancedEnabled('tableEditor')&&<AdvancedTableControls editor/>}<ManagementDashboard showDemo={testEnvironmentAllowed()} /></>;
}
