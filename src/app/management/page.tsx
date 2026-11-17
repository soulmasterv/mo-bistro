import Link from "next/link";
import { redirect } from "next/navigation";
import WaitlistSchedule from "@/components/waitlist-schedule";
import { PILOT_STAFF_USERNAME } from "@/lib/pilot/config";
import { currentStaff } from "@/lib/staff-auth";

export default async function PilotManagement() {
  const staff = await currentStaff();
  if (!staff || staff.username.toLowerCase() !== PILOT_STAFF_USERNAME) redirect("/login");
  if (staff.role !== "manager") redirect("/queue");

  return (
    <main className="min-h-screen bg-[#101111] px-5 py-8 text-[#f4f0e7]">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Management</h1>
          <Link href="/queue" className="rounded-lg border border-white/20 px-4 py-2 text-sm">Back to Reception</Link>
        </header>
        <WaitlistSchedule endpoint="/api/pilot/waitlist-hours" />
      </div>
    </main>
  );
}
