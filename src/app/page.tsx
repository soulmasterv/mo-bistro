import { waiterEnabled } from "@/lib/feature-settings";
import ReceptionDashboard from "./reception-dashboard";
import WorkspaceHeader from "@/components/workspace-header";
import { requireStaffPage } from "@/lib/require-staff-page";
import {advancedEnabled} from '@/lib/advanced/flags';
import AdvancedTableControls from '@/components/advanced-table-controls';
import ReceptionPolling from '@/components/reception-polling';
import ReceptionBuild from "@/components/reception-build";

export default async function Page() {
  const staff = await requireStaffPage(["manager", "reception"]);
  return <><WorkspaceHeader showWaiter={await waiterEnabled()} username={staff.username} role={staff.role} workspace="Reception" /><ReceptionPolling>{advancedEnabled('tableOverride')&&<AdvancedTableControls/>}<ReceptionDashboard /></ReceptionPolling><ReceptionBuild environment="Preview" /></>;
}
