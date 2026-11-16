import Link from "next/link";
import { ClipboardList, UtensilsCrossed, Settings2, ArrowRight, SlidersHorizontal } from "lucide-react";
import { featureEditorEnabled, waiterEnabled } from "@/lib/feature-settings";
import WorkspaceHeader from "@/components/workspace-header";
import { requireStaffPage } from "@/lib/require-staff-page";

export default async function ManagerHome() {
  const staff = await requireStaffPage(["manager"]);
  const showWaiter = await waiterEnabled();
  const modes = [
    { name: "Reception", description: "Manage guests and seating", href: "/", Icon: ClipboardList },
    ...(showWaiter ? [{ name: "Waiter", description: "Manage table readiness", href: "/waiter", Icon: UtensilsCrossed }] : []),
    { name: "Management", description: "Settings and staff accounts", href: "/management", Icon: Settings2 },
    ...(featureEditorEnabled() ? [{ name: "Feature settings", description: "Choose available workflows", href: "/features", Icon: SlidersHorizontal }] : []),
  ];
  return <><WorkspaceHeader username={staff.username} role={staff.role} workspace="Workspaces" /><main className="min-h-0 flex-1 bg-[#111111] px-5 py-12 text-white max-sm:py-5"><div className="mx-auto max-w-4xl"><p className="text-xs font-bold tracking-[0.3em] text-[#D6B681]">MO BISTRO</p><h1 className="mt-4 text-4xl font-semibold max-sm:mt-2 max-sm:text-2xl">Choose a workspace</h1><div className="mt-9 grid gap-5 md:grid-cols-3 max-sm:mt-4 max-sm:gap-2">{modes.map(({ name, description, href, Icon }) => <Link key={name} href={href} className="rounded-2xl border border-white/10 bg-[#191919] p-7 text-[#F5F0E7] hover:border-[#C5A77B]/50 max-sm:grid max-sm:grid-cols-[auto_1fr_auto] max-sm:items-center max-sm:gap-x-3 max-sm:p-3"><Icon size={34} className="text-[#D6B681] max-sm:row-span-2 max-sm:h-5 max-sm:w-5"/><h2 className="mt-8 text-2xl font-semibold max-sm:m-0 max-sm:text-lg">{name}</h2><p className="mt-2 text-sm text-[#D0CCC4] max-sm:col-start-2 max-sm:mt-0 max-sm:text-xs">{description}</p><ArrowRight className="mt-8 text-[#D6B681] max-sm:col-start-3 max-sm:row-start-1 max-sm:row-span-2 max-sm:m-0 max-sm:h-4 max-sm:w-4"/></Link>)}</div></div></main></>;
}
