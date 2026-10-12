import Link from "next/link";
import { ClipboardList, UtensilsCrossed, Settings2, ArrowRight } from "lucide-react";
import WorkspaceHeader from "@/components/workspace-header";
import { requireStaffPage } from "@/lib/require-staff-page";

export default async function ManagerHome() {
  const staff = await requireStaffPage(["manager"]);
  const modes = [
    { name: "Reception", description: "Manage guests and seating", href: "/", Icon: ClipboardList },
    { name: "Waiter", description: "Manage table readiness", href: "/waiter", Icon: UtensilsCrossed },
    { name: "Management", description: "Settings and staff accounts", href: "/management", Icon: Settings2 },
  ];
  return <><WorkspaceHeader role={staff.role} workspace="Workspaces" /><main className="min-h-0 flex-1 bg-[#0D1218] px-5 py-12 text-white"><div className="mx-auto max-w-4xl"><p className="text-xs font-bold tracking-[0.3em] text-slate-400">MO BISTRO</p><h1 className="mt-4 text-4xl font-semibold">Choose a workspace</h1><p className="mt-2 text-[#647057]">Where would you like to work today?</p><div className="mt-9 grid gap-5 md:grid-cols-3">{modes.map(({ name, description, href, Icon }) => <Link key={name} href={href} className="rounded-2xl border border-white/10 bg-[#17202A] p-7 text-[#F5F0E7] hover:border-[#C5A77B]/50"><Icon size={34} className="text-[#D6B681]"/><h2 className="mt-8 text-2xl font-semibold">{name}</h2><p className="mt-2 text-sm text-[#D0D3C9]">{description}</p><ArrowRight className="mt-8 text-[#D6B681]"/></Link>)}</div></div></main></>;
}
