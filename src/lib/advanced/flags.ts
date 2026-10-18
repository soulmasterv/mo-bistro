import 'server-only';
const keys = {
  waitEstimate: 'ADV_WA_WAIT_ESTIMATE',
  reminders: 'ADV_WA_REMINDERS',
  tableOverride: 'ADV_TABLE_OVERRIDE',
  tableEditor: 'ADV_TABLE_EDITOR',
} as const;
export type AdvancedFeature = keyof typeof keys;
export function advancedPreview(){
  return process.env.VERCEL_ENV === 'preview' && process.env.MO_BISTRO_DB === 'postgres';
}
export function advancedEnabled(feature: AdvancedFeature) {
  return advancedPreview() && process.env[keys[feature]] === 'true';
}
function integer(key:string,fallback:number,min:number,max:number) {
  const value=Number(process.env[key]);
  return Number.isSafeInteger(value)&&value>=min&&value<=max?value:fallback;
}
export function advancedConfig() {
  return {
    historyLimit:integer('ADV_WA_HISTORY_LIMIT',50,10,500),
    minSamples:integer('ADV_WA_MIN_SAMPLES',10,10,500),
    reminderMinutes:integer('ADV_WA_REMINDER_MINUTES',10,1,120),
    preNotifyMax:integer('ADV_WA_PRE_NOTIFY_MAX_MESSAGES',3,1,10),
  };
}
