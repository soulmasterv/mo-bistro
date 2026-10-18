'use client';
import {useEffect,useState} from 'react';
import {receptionFeed,refreshReception} from '@/lib/reception-feed';
export default function ReceptionPolling({children}:{children:React.ReactNode}){
 const [updating,setUpdating]=useState(false);
 const [signedOut,setSignedOut]=useState(false);
 useEffect(()=>{
  const feed=receptionFeed();const unsubscribe=feed.subscribe(()=>{setUpdating(feed.state().updating);setSignedOut(feed.state().stopped);});
  const stop=feed.start();const visible=()=>feed.visibilityChanged();
  const changed=()=>{void refreshReception().catch(()=>{});};
  document.addEventListener('visibilitychange',visible);window.addEventListener('mo-bistro-tables-changed',changed);
  return()=>{unsubscribe();stop();document.removeEventListener('visibilitychange',visible);window.removeEventListener('mo-bistro-tables-changed',changed);};
 },[]);
 if(signedOut)return <p role="alert" className="reception-updating">Your session has ended. <a href="/login">Sign in again</a>.</p>;
 return <>{updating&&<p role="status" className="reception-updating">Updating reception… Showing the last available information.</p>}{children}</>;
}
