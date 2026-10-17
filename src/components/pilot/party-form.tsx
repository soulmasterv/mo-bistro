"use client";
import { useRef,useState } from 'react';
import styles from './pilot.module.css';
export default function PartyForm({staff=false,onCreated}:{staff?:boolean;onCreated:(party:{id:number;token:string})=>void}){
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[size,setSize]=useState('2'),[preference,setPreference]=useState('indoor');
 const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const pending=useRef(false);
 async function submit(event:React.FormEvent){event.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setError('');
  try{const r=await fetch(staff?'/api/pilot/queue':'/api/pilot/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,phone,party_size:Number(size),preference,whatsapp_consent:!staff&&consent})});const data=await r.json();if(!r.ok)throw Error(data.error||'Unable to join.');onCreated(data);if(staff){setName('');setPhone('');}}
  catch(e){setError(e instanceof Error?e.message:'Unable to join.');}finally{pending.current=false;setBusy(false);}
 }
 return <form className={styles.form} onSubmit={submit} aria-busy={busy}>
  <label>Name<input required minLength={2} maxLength={100} autoComplete="name" value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
  <label>Phone Number<input required type="tel" inputMode="tel" pattern="01[0125][0-9]{8}" placeholder="01xxxxxxxxx" autoComplete="tel" value={phone} disabled={busy} onChange={e=>setPhone(e.target.value)}/></label>
  <div className={styles.two}><label>Party size<input required type="number" min={1} max={30} value={size} disabled={busy} onChange={e=>setSize(e.target.value)}/></label>
  <label>Seating<select value={preference} disabled={busy} onChange={e=>setPreference(e.target.value)}><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option></select></label></div>
  {!staff&&<label className={styles.consent}><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/><span>Send me one WhatsApp message when reception calls my party. No marketing. Reply STOP to unsubscribe.</span></label>}
  {error&&<p role="alert" className={styles.notice}>{error}</p>}
  <button className={styles.button} disabled={busy}>{busy?'Saving…':staff?'Add walk-in':'Join the queue'}</button>
  <small className={styles.hint}>Reception uses these details to manage this visit. Booking does not require WhatsApp.</small>
 </form>;
}
