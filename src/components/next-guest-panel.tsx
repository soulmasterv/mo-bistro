"use client";
import {receptionRead,watchReception} from "@/lib/reception-feed";

import {useEffect,useState} from "react";
type Suggestion={area:string;available:boolean;guest:{id:number;name:string;party_size:number}|null};
export default function NextGuestPanel() {
 const [items,setItems]=useState<Suggestion[]>([]);
 const [error,setError]=useState("");
 useEffect(()=>{
  let controller:AbortController|null=null;
  async function refresh() {
   controller?.abort();const current=new AbortController();controller=current;
   try {
    const response=await receptionRead("/api/reception/next-guest?areas=all",{cache:"no-store",signal:current.signal});
    if(!response.ok)throw Error("Next guest recommendations unavailable.");
    const results=(await response.json()).areas;
    if(!current.signal.aborted){setItems(results);setError("");}
   }catch{if(!current.signal.aborted){setItems([]);setError("Next guest recommendations unavailable.");}}
  }
  const initial=setTimeout(()=>void refresh(),0);
  const unsubscribe=watchReception(()=>void refresh());
  return()=>{controller?.abort();clearTimeout(initial);unsubscribe();};
 },[]);
 return <section className="next-guest-panel" aria-label="Next guests for free tables">
 {error&&<p role="status">{error}</p>}
 {items.filter(item=>item.available).map(item=><article key={item.area}><strong>{item.area==="indoor"?"Indoor":"Outdoor"} · Table available</strong><p>{item.guest?<>Next guest is <b>{item.guest.name}</b> · {item.guest.party_size} guests</>:"No suitable guests waiting."}</p></article>)}
 </section>;
}
