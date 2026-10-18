import ReceptionDashboard from "./reception-dashboard";
import WorkspaceHeader from "@/components/workspace-header";
import { requireStaffPage } from "@/lib/require-staff-page";
import {advancedEnabled,advancedPreview} from '@/lib/advanced/flags';
import AdvancedTableControls from '@/components/advanced-table-controls';
import ReceptionPolling from '@/components/reception-polling';

export default async function Page() {
  const staff = await requireStaffPage(["manager", "reception"]);
  return <><WorkspaceHeader username={staff.username} role={staff.role} workspace="Reception" /><ReceptionPolling>{advancedEnabled('tableOverride')&&<AdvancedTableControls/>}<ReceptionDashboard previewMessages={advancedPreview()} /></ReceptionPolling></>;
}
