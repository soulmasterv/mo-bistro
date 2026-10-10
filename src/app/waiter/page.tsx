import WaiterDashboard from "./waiter-dashboard";
import { requireStaffPage } from "@/lib/require-staff-page";

export default async function Page() {
  await requireStaffPage(["manager", "waiter"]);
  return <WaiterDashboard />;
}
