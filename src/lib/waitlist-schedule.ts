import {z} from "zod";
import {getPostgres} from "@/lib/postgres-db";
import {getSetting} from "@/lib/staff-auth";
import db from "@/lib/db";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const scheduleSchema = z.object({enabled:z.boolean(),open:time,close:time,cutoff:time}).refine(s => {
  const span = (minutes(s.close) - minutes(s.open) + 1440) % 1440;
  const cutoff = (minutes(s.cutoff) - minutes(s.open) + 1440) % 1440;
  return !s.enabled || (cutoff > 0 && cutoff <= span);
}, "Last registration must fall within restaurant hours.");

export const defaultSchedule = {enabled:false,open:"12:00",close:"01:00",cutoff:"23:30"};
export const scheduleKey = "pilot_public_waitlist_schedule";

export function scheduleState(raw: string | undefined, now = new Date()) {
  if (!raw) return null;
  const schedule = scheduleSchema.parse(JSON.parse(raw));
  if (!schedule.enabled) return null;
  const clock = new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Cairo",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now);
  const elapsed = (minutes(clock) - minutes(schedule.open) + 1440) % 1440;
  const cutoff = (minutes(schedule.cutoff) - minutes(schedule.open) + 1440) % 1440;
  const close = (minutes(schedule.close) - minutes(schedule.open) + 1440) % 1440;
  return elapsed < cutoff ? null : elapsed < close
    ? "The restaurant is open, but the waitlist is closed for new registrations."
    : "The waitlist opens at " + schedule.open + " Cairo time.";
}

export async function readSchedule() {
  if (process.env.MO_BISTRO_DB !== "postgres") return getSetting(scheduleKey);
  const [row] = await getPostgres()`SELECT value FROM restaurant_settings WHERE key=${scheduleKey}`;
  return row?.value as string | undefined;
}

export async function writeSchedule(schedule: z.infer<typeof scheduleSchema>) {
  const raw = JSON.stringify(schedule);
  if (process.env.MO_BISTRO_DB !== "postgres") {
    getSetting(scheduleKey);
    db.prepare("INSERT INTO restaurant_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(scheduleKey,raw);
    return;
  }
  await getPostgres()`INSERT INTO restaurant_settings(key,value) VALUES (${scheduleKey},${raw}) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`;
}
