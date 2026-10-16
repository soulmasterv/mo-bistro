"use client";
import {useEffect,useRef} from 'react';
import {ArrowUpRight,Clock3,MessageCircle,MoreHorizontal,Phone,Users,X} from 'lucide-react';
import styles from './pilot.module.css';

export type Party={id:number;name:string;phone:string;party_size:number;preference:string;status:string;joined_at:string;called_at:string|null;whatsapp_consent:boolean;message_status:string|null;message_error:string|null;pending_exit_kind:'cancel'|'no_show'|null;pending_exit_at:string|null;pending_exit_token:string|null};
export type QueueAction='notify'|'seated'|'cancel'|'no_show'|'undo';
const failedStates=['failed','unknown','skipped','simulated'];
export const messageFailed=(p:Party)=>failedStates.includes(p.message_status||'')||!!p.message_error;
export const needsPhone=(p:Party)=>!p.whatsapp_consent||messageFailed(p);
export function messageLabel(p:Party){
 if(p.message_status==='sent')return 'Message sent';
 if(p.message_status==='simulated')return 'Test mode — message not sent';
 if(messageFailed(p))return 'Message failed';
 return p.status==='called'?'Sending message…':p.whatsapp_consent?'Subscribed':'Not subscribed';
}
function failureDetail(p:Party){
 const reasons:Record<string,string>={guest_not_opted_in:'Guest has not subscribed to WhatsApp. Call them directly.',guest_unsubscribed:'Guest unsubscribed. Call them directly.',customer_service_window_closed:'The guest needs to send a new WhatsApp message before we can reply. Call them directly.',window_text_disabled:'WhatsApp text sending is disabled. Call this guest.',preview_recipient_not_allowed:'Dev can message only the configured test number. Call this guest.',scheduler_unavailable:'Message scheduling failed. Call this guest.',whatsapp_disabled:'WhatsApp is disabled. Call this guest.'};
 return p.message_error?reasons[p.message_error]||'The message could not be confirmed. Call this guest.':'';
}
const time=(value:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
const whatsapp=(p:Party)=>'https://wa.me/'+(p.phone.startsWith('0')?'2'+p.phone:p.phone);
const wait=(p:Party,now:number)=>Math.max(0,Math.floor((now-new Date(p.joined_at).getTime())/60000));
const waitStyle=(minutes:number)=>minutes>=30?styles.waitRed:minutes>=15?styles.waitAmber:'';

function Primary({party,busy,onAction}:{party:Party;busy:boolean;onAction:(id:number,action:QueueAction)=>void}){
 const action=party.status==='called'?'seated':'notify';
 return <button className={styles.button} disabled={busy||!!party.pending_exit_kind} onClick={()=>onAction(party.id,action)} aria-label={`${action==='seated'?'Seat guest':'Notify'} ${party.name}`}>
  {busy?'Saving…':action==='seated'?'Seat guest':'Notify'}<ArrowUpRight size={15}/>
 </button>;
}
function Undo({party,now,busy,onAction}:{party:Party;now:number;busy:boolean;onAction:(id:number,action:QueueAction)=>void}){
 if(!party.pending_exit_kind)return null;
 const seconds=Math.max(0,Math.ceil((new Date(party.pending_exit_at!).getTime()-now)/1000));
 return <div className={styles.undo} role="status"><span>{party.pending_exit_kind==='no_show'?'No-show':'Cancellation'} {seconds?'pending':'saving…'}</span>
  <button className={styles.secondary} disabled={busy||!seconds} onClick={()=>onAction(party.id,'undo')}>Undo{seconds?` (${seconds}s)`:''}</button>
 </div>;
}
export function PilotQueue({parties,now,busy,onAction,onOpen}:{parties:Party[];now:number;busy:number[];onAction:(id:number,action:QueueAction)=>void;onOpen:(id:number)=>void}){
 return <div className={styles.tableWrap}><table className={styles.queueTable} aria-label="Reception queue">
  <thead><tr><th># · Guest</th><th>Party size</th><th>Preference</th><th>Wait time</th><th>Status</th><th>Actions</th></tr></thead>
  <tbody>{parties.map((p,index)=>{const disabled=busy.includes(p.id)||!!p.pending_exit_kind;const minutes=wait(p,now);return <tr key={p.id} className={index===0?styles.nextRow:''}>
   <td className={styles.guestCell}><span className={styles.rowNumber}>{String(index+1).padStart(2,'0')}</span><div><div className={styles.guestName}><button onClick={()=>onOpen(p.id)}>{p.name}</button>{index===0&&<span className={styles.nextTag}>Next</span>}</div><a className={styles.rowPhone} href={'tel:'+p.phone}>{p.phone}</a></div></td>
   <td data-label="Party"><span className={styles.inline}><Users size={14}/>{p.party_size}</span></td>
   <td data-label="Preference">{p.preference==='indoor'?'Indoor':'Outdoor'}</td>
   <td data-label="Wait time"><span className={waitStyle(minutes)}>{minutes} min</span></td>
   <td data-label="Status"><div className={styles.statusCell}><span className={`${styles.pill} ${p.status==='called'?styles.pillNotified:''}`}>{p.called_at?`Notified ${time(p.called_at)}`:'Waiting'}</span>{p.status==='called'&&<small className={messageFailed(p)?styles.failed:styles.hint}>{messageLabel(p)}</small>}</div></td>
   <td className={styles.rowActions}><div className={styles.actions} aria-busy={busy.includes(p.id)}>
    <a href={'tel:'+p.phone} aria-label={`Call ${p.name}`} className={`${styles.secondary} ${needsPhone(p)?styles.callProminent:''}`} aria-disabled={disabled} onClick={e=>{if(disabled)e.preventDefault();}}><Phone size={15}/>Call</a>
    <Primary party={p} busy={busy.includes(p.id)} onAction={onAction}/>
    <button className={styles.secondary} aria-label={`Guest details for ${p.name}`} onClick={()=>onOpen(p.id)}><MoreHorizontal size={18}/></button>
   </div><Undo party={p} now={now} busy={busy.includes(p.id)} onAction={onAction}/></td>
  </tr>;})}</tbody>
 </table></div>;
}
export function PilotDrawer({party,now,busy,onAction,onClose}:{party:Party;now:number;busy:boolean;onAction:(id:number,action:QueueAction)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const element=dialog.current;if(!element)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';element.showModal();return()=>{element.close();document.body.style.overflow=previous;};},[]);
 const disabled=busy||!!party.pending_exit_kind;
 return <dialog ref={dialog} className={styles.drawer} aria-labelledby="pilot-guest-heading" onClose={e=>{if(!e.currentTarget.open)onClose();}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}}>
  <header className={styles.drawerHeader}><div><h2 id="pilot-guest-heading">{party.name}</h2><p>{party.called_at?`Notified ${time(party.called_at)}`:'Waiting'} · Booking #{party.id}</p></div><button className={styles.iconButton} onClick={onClose} aria-label="Close guest details"><X size={21}/></button></header>
  <dl className={styles.drawerFacts}>
   <div><dt><Users size={17}/>Party</dt><dd>{party.party_size} guests · {party.preference}</dd></div>
   <div><dt><Phone size={17}/>Phone</dt><dd><a href={'tel:'+party.phone}>{party.phone}</a></dd></div>
   <div><dt><MessageCircle size={17}/>WhatsApp</dt><dd className={messageFailed(party)?styles.failed:''}>{messageLabel(party)}</dd></div>
   <div><dt><Clock3 size={17}/>Joined</dt><dd>{time(party.joined_at)}</dd></div>
  </dl>
  {needsPhone(party)&&<p className={styles.callNotice}>{failureDetail(party)||'No WhatsApp subscription. Call this guest directly.'}</p>}
  <div className={styles.drawerControls} aria-busy={busy}>
   <Primary party={party} busy={busy} onAction={onAction}/>
   <div className={styles.two}><a href={'tel:'+party.phone} aria-disabled={disabled} onClick={e=>{if(disabled)e.preventDefault();}} className={`${styles.secondary} ${needsPhone(party)?styles.callProminent:''}`}><Phone size={17}/>Call guest</a>
    <a className={styles.secondary} href={whatsapp(party)} target="_blank" rel="noreferrer" aria-disabled={disabled} onClick={e=>{if(disabled)e.preventDefault();}}><MessageCircle size={17}/>Open WhatsApp</a></div>
  </div>
  <div className={styles.drawerDanger}><Undo party={party} now={now} busy={busy} onAction={onAction}/><div className={styles.two}>
   <button className={styles.danger} disabled={disabled||!party.called_at} onClick={()=>onAction(party.id,'no_show')} title={!party.called_at?'Available after Notify':undefined}>No-show</button>
   <button className={styles.danger} disabled={disabled||!!party.called_at} onClick={()=>onAction(party.id,'cancel')} title={party.called_at?'Use No-show after Notify':undefined}>Cancel booking</button>
  </div></div>
 </dialog>;
}
