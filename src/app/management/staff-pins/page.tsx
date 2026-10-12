import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/staff-auth";
import WorkspaceHeader from "@/components/workspace-header";
import StaffPinsClient from "./staff-pins-client";

export const dynamic = "force-dynamic";

export default async function StaffPinsPage() {
  const staff = await currentStaff();

  if (!staff) {
    redirect("/login");
  }

  if (staff.role !== "manager") {
    redirect(
      staff.role === "waiter"
        ? "/waiter"
        : "/"
    );
  }

  return <><WorkspaceHeader role={staff.role} workspace="Management" /><StaffPinsClient /></>;
}
