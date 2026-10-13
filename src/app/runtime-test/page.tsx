import { notFound } from "next/navigation";
import { testEnvironmentAllowed } from "@/lib/test-environment";
import Diagnostic from "./diagnostic-client";
export const dynamic = "force-dynamic";
export default function Page() {
  if(!testEnvironmentAllowed())notFound();
  return <Diagnostic />;
}
