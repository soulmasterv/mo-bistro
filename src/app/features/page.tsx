import { notFound, redirect } from "next/navigation";
import WorkspaceHeader from "@/components/workspace-header";
import { requireStaffPage } from "@/lib/require-staff-page";
import { featureEditorEnabled, saveWaiterEnabled, waiterEnabled } from "@/lib/feature-settings";

async function save(form: FormData) {
  "use server";
  if (!featureEditorEnabled()) notFound();
  await requireStaffPage(["manager"]);
  await saveWaiterEnabled(form.get("waiter") === "on");
  redirect("/features?saved=1");
}

export default async function FeatureSettings({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  if (!featureEditorEnabled()) notFound();
  const staff = await requireStaffPage(["manager"]);
  const enabled = await waiterEnabled();
  const { saved } = await searchParams;
  return <>
    <WorkspaceHeader username={staff.username} role={staff.role} workspace="Feature settings" showWaiter={enabled} />
    <main className="min-h-screen bg-[#111111] px-5 py-10 text-[#F5F0E7]">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-3xl font-semibold">Feature settings</h1>
        <form action={save} className="space-y-5 rounded-xl border border-white/20 bg-[#191919] p-5">
          <label className="flex items-center gap-3 font-semibold">
            <input type="checkbox" name="waiter" defaultChecked={enabled} />
            Waiter workspace
          </label>
          <p className="text-sm text-[#D0CCC4]">Turning this off blocks the Waiter workspace and new waiter requests. Reception can still resolve pending requests.</p>
          <button type="submit" className="rounded-lg bg-[#D6B681] px-4 py-2 font-semibold text-[#222]">Save settings</button>
          {saved === "1" && <p role="status" className="text-sm">Settings saved.</p>}
        </form>
      </div>
    </main>
  </>;
}
