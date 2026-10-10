import ReceptionDashboard from "./reception-dashboard";
import { requireStaffPage } from "@/lib/require-staff-page";

export default async function Page() {
  await requireStaffPage(["manager", "reception"]);
  return <ReceptionDashboard />;
}
