import ManagementDashboard from "./management-dashboard";
import { requireStaffPage } from "@/lib/require-staff-page";

export default async function Page() {
  await requireStaffPage(["manager"]);
  return <ManagementDashboard />;
}
