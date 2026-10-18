// Guest-supplied names must never become links, markup or extra message lines.
export function firstName(value:unknown):string|null{
 if(typeof value!=='string')return null;
 const clean=value.normalize('NFKC')
  .replace(/(?:https?:\/\/|www\.)\S+|(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?:\/\S*)?|\S+@\S+/giu,' ')
  .replace(/[\p{Cc}\p{Cf}]/gu,' ')
  .replace(/[^\p{L}\p{M}\s'-]/gu,' ');
 const token=clean.trim().split(/\s+/).find(part=>/\p{L}/u.test(part));
 if(!token)return null;
 return Array.from(token.replace(/^['-]+|['-]+$/g,'')).slice(0,24).join('')||null;
}
export function greeting(value:unknown){const name=firstName(value);return name?`Hi ${name},`:'Hi there,';}
export function acknowledgement(name:unknown,id:number,estimate:string|null){
 return `${greeting(name)}\n\nThanks for joining Mo Bistro's waitlist!\n\nYour booking: #${id}`+
  (estimate?`\nEstimated wait: ${estimate}.`:'')+"\n\nWe'll message you when your table is ready.";
}
export function reminderCopy(kind:'timer'|'next',name:unknown,id:number){
 return kind==='next'?`${greeting(name)}\n\nBooking #${id} is next in the queue.\n\nPlease stay nearby. Reception will confirm when your table is ready.`
 :`${greeting(name)}\n\nA quick update on booking #${id}: you're still in the queue.\n\nThanks for waiting. We'll let you know when your table is ready.`;
}
export const etaCopy=(name:unknown,id:number,minutes:number)=>`${greeting(name)}\n\nAn update on booking #${id}: your table is now expected in about ${minutes} ${minutes===1?'minute':'minutes'} (an estimate). We'll confirm when it's ready.`;
export const nearlyReadyCopy=(name:unknown,id:number)=>`${greeting(name)}\n\nYour table for booking #${id} is expected in about 10 minutes (an estimate). Please stay nearby and wait for our confirmation.`;
export const reviewCopy=(name:unknown)=>`${greeting(name)}\n\nThanks for visiting Mo Bistro! If you have a moment, we'd love your feedback.\n\nOur review page is coming soon.`;
// Approved wording for the proposed manual preset; no automatic ready event is introduced.
export const tableReadyCopy=(name:unknown,id:number)=>`${greeting(name)}\n\nYour table is ready! Please come to reception and mention booking #${id}.`;
