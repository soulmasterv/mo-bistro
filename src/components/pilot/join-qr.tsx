"use client";
import {useEffect,useRef} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {PILOT_ORIGIN} from '@/lib/pilot/config';
import styles from './pilot.module.css';

export default function JoinQR({onClose}:{onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const element=dialog.current;if(!element)return;
  const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const previous=document.body.style.overflow;
  document.body.style.overflow='hidden';element.showModal();
  return()=>{element.close();document.body.style.overflow=previous;opener?.focus();};
 },[]);
 return <dialog ref={dialog} className={styles.joinScreen} aria-labelledby="pilot-qr-heading" aria-describedby="pilot-qr-instructions" onClose={onClose} onKeyDown={event=>{
  if(event.key!=='Tab')return;
  const items=event.currentTarget.querySelectorAll<HTMLElement>('button,a[href]');
  const first=items[0],last=items[items.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 }}>
  <div className={styles.joinCard}>
   <button type="button" className={styles.secondary} onClick={onClose}>Close QR code</button>
   <h2 id="pilot-qr-heading">Join the waitlist</h2>
   <p id="pilot-qr-instructions">Scan this QR code with your phone to register your party.</p>
   <QRCodeSVG value={PILOT_ORIGIN+'/join'} size={280} marginSize={4} title="Mo Bistro guest registration QR code"/>
   <a className={styles.secondary} href="/join" target="_blank" rel="noreferrer">Open join page</a>
  </div>
 </dialog>;
}
