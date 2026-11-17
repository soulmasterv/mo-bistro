import Link from "next/link";
import { ArrowLeft, UtensilsCrossed } from "lucide-react";
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
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[#353636] pb-5">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#dfbd84]"><UtensilsCrossed size={15} aria-hidden="true" /> MO BISTRO</p>
            <h1 className="text-3xl font-bold">Management</h1>
          </div>
          <Link href="/queue" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/25 px-4 text-sm"><ArrowLeft size={16} aria-hidden="true" /> Back to Reception</Link>
        </header>
        <WaitlistSchedule endpoint="/api/pilot/waitlist-hours" />
      </div>
    </main>
  );
}
