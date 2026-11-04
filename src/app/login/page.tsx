import { redirect } from "next/navigation";
import PilotLogin from "@/components/pilot/login";
import { currentStaff } from "@/lib/staff-auth";
import { PILOT_STAFF_USERNAME } from "@/lib/pilot/config";

export const metadata = { referrer: "same-origin" as const };

export default async function Page({searchParams}:{searchParams:Promise<{error?:string}>}){
 const staff=await currentStaff();
 if(staff?.username.toLowerCase()===PILOT_STAFF_USERNAME)redirect('/queue');
 const {error}=await searchParams;
 const message=error==='credentials'?'Incorrect username or password.':error==='rate'?'Too many sign-in attempts. Try again in 15 minutes.':error==='request'?'Sign-in could not verify this request. Open the Pilot login page directly and try again.':error==='unavailable'?'Sign-in is temporarily unavailable. Please try again.':'';
 return <PilotLogin error={message}/>;
}
