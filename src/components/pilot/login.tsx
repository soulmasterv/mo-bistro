"use client";
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './pilot.module.css';

export default function PilotLogin() {
 const router=useRouter(), pending=useRef(false);
 const [username,setUsername]=useState(''),[password,setPassword]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event:React.FormEvent) {
  event.preventDefault(); if(pending.current)return; pending.current=true;setBusy(true);setError('');
  try {
   const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,credential:password})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to sign in.');
   router.replace('/');router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Unable to sign in.');pending.current=false;setBusy(false);}
 }
 return <main className={styles.page}><section className={`${styles.panel} ${styles.guest}`}>
  <p className={styles.brand}>Mo Bistro - District 5</p><h1>Reception login</h1><p className={styles.hint}>Sign in with the shared staff account.</p>
  <form className={styles.form} onSubmit={submit} aria-busy={busy}>
   <label>Username<input required autoComplete="username" value={username} disabled={busy} onChange={e=>setUsername(e.target.value)}/></label>
   <label>Password<input required type="password" autoComplete="current-password" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>
   {error&&<p role="alert" className={styles.notice}>{error}</p>}
   <button className={styles.button} disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
  </form>
 </section></main>;
}
