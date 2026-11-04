"use client";
import {useEffect,useRef,useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {PILOT_ORIGIN} from '@/lib/pilot/config';
import styles from './pilot.module.css';

export default function JoinQR({onClose}:{onClose:()=>void}){
 const link=PILOT_ORIGIN+'/join';
 const [copyStatus,setCopyStatus]=useState('');
 async function copyLink(){
  try{await navigator.clipboard.writeText(link);setCopyStatus('Link copied');}
  catch{setCopyStatus('Could not copy. Select the registration link to copy it manually.');}
 }
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
   <span className={styles.joinEyebrow}>Welcome to the table</span>
   <h2 id="pilot-qr-heading">Mo Bistro</h2>
   <p id="pilot-qr-instructions">Scan this QR code to join the waitlist.</p>
   <div className={styles.joinCode}><QRCodeSVG value={link} size={220} marginSize={4} title="Mo Bistro guest registration QR code"/></div>
   <p className={styles.joinLinkLabel}>Registration link</p>
   <a className={styles.joinLink} href={link} target="_blank" rel="noreferrer">{link}</a>
   <div className={styles.joinActions}>
    <button type="button" className={styles.secondary} onClick={()=>void copyLink()}>Copy link</button>
    <button type="button" className={styles.button} onClick={onClose}>Close</button>
   </div>
   {copyStatus&&<p role="status">{copyStatus}</p>}
  </div>
 </dialog>;
}
