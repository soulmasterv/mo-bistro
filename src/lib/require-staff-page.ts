import "server-only";
import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/staff-auth";
import type { StaffRole } from "@/lib/staff-session-shared";

export async function requireStaffPage(allowed: StaffRole[]) {
  const staff = await currentStaff();
  if (!staff) redirect("/login");
  if (!allowed.includes(staff.role)) {
    redirect(staff.role === "waiter" ? "/waiter" : staff.role === "manager" ? "/manager" : "/");
  }
  return staff;
}
