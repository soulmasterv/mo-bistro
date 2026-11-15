'use client';
import {useCallback,useEffect,useState} from 'react';
import { useConfirmation } from '@/components/confirmation-provider';
import styles from './advanced-table-controls.module.css';
type Table={id:number;name:string;seats:number;area:'indoor'|'outdoor';status:string;advanced_revision:number};
type Override={area:'indoor'|'outdoor';available_count:number;revision:number};
const empty={name:'',seats:2,area:'indoor' as 'indoor'|'outdoor'};
export default function AdvancedTableControls({editor=false}:{editor?:boolean}){
 const confirm = useConfirmation();
 const [tables,setTables]=useState<Table[]>([]),[counts,setCounts]=useState<Override[]>([]);
 const [draft,setDraft]=useState(empty),[editing,setEditing]=useState<Table|null>(null);
 const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const path=editor?'/api/advanced/tables':'/api/advanced/table-overrides';
 const refresh=useCallback(async()=>{
  const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw Error('Unable to load table controls.');
  const data=await response.json();if(editor)setTables(data);else setCounts(data);
 },[path,editor]);
 useEffect(()=>{const timer=setTimeout(()=>{void refresh().catch(e=>setNotice(e.message));},0);return()=>clearTimeout(timer);},[refresh]);
 async function save(method:string,body:object){
  if(busy)return;setBusy(true);setNotice('');
  try{
   const response=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to save.');
   await refresh();setEditing(null);setDraft(empty);setNotice('Saved.');
   window.dispatchEvent(new Event('mo-bistro-tables-changed'));
  }catch(e){setNotice(e instanceof Error?e.message:'Unable to save.');}finally{setBusy(false);}
 }
 return <section className={styles.panel} aria-label={editor?'Edit tables':'Available table override'}>
  <h2>{editor?'Edit tables':'Available tables'}</h2>
  <p>{editor?'Changes are recorded with your staff account. Only free tables can be changed.':'Manual counts by location. Highlighted parties fit a configured table size; counts do not assign or reserve tables.'}</p>
  {!editor?(['indoor','outdoor'] as const).map(area=>{
   const row=counts.find(r=>r.area===area);
   function saveCount(form: HTMLFormElement) {
    if (busy || !form.reportValidity()) return;
    const count = Number(new FormData(form).get('count'));
    if (count !== (row?.available_count ?? 0)) void save('PUT', {area, available_count: count, revision: row?.revision ?? 0});
   }
   return <form key={area+':'+(row?.revision??0)} className={styles.row} onSubmit={e=>{e.preventDefault();saveCount(e.currentTarget);}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))saveCount(e.currentTarget);}}>
    <label>{area==='indoor'?'Indoor':'Outdoor'} <input aria-label={area+' available tables'} name="count" type="number" min="0" max="500" required defaultValue={row?.available_count??0}/></label>
   </form>;
  }):<>
   <form className={styles.row} onSubmit={e=>{e.preventDefault();void save(editing?'PATCH':'POST',{...draft,...(editing?{id:editing.id,revision:editing.advanced_revision}:{})});}}
    onBlur={e=>{
     if (!editing || e.currentTarget.contains(e.relatedTarget) || !e.currentTarget.reportValidity()) return;
     if (draft.name !== editing.name || draft.seats !== editing.seats || draft.area !== editing.area) {
      void save('PATCH', {...draft, id: editing.id, revision: editing.advanced_revision});
     }
    }}>
    <label>Name<input required maxLength={40} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
    <label>Capacity<input required type="number" min="1" max="30" value={draft.seats} onChange={e=>setDraft({...draft,seats:Number(e.target.value)})}/></label>
    <label>Location<select value={draft.area} onChange={e=>setDraft({...draft,area:e.target.value as Table['area']})}><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option></select></label>
    {!editing&&<button disabled={busy}>Add table</button>}
    {editing&&<button type="button" onClick={()=>{setEditing(null);setDraft(empty);}}>Cancel edit</button>}
   </form>
   <ul>{tables.map(table=><li key={table.id} className={styles.row}>
    <span>{table.name} · {table.seats} seats · {table.area} · {table.status}</span>
    <button disabled={busy||table.status!=='free'} onClick={()=>{setEditing(table);setDraft({name:table.name,seats:table.seats,area:table.area});}}>Edit</button>
    <button disabled={busy||table.status!=='free'} onClick={async()=>{
     if (await confirm({title:'Remove table?',message:`Remove ${table.name} from available tables? Its history will be retained.`,confirmLabel:'Remove table',destructive:true})) {
      await save('DELETE',{id:table.id,revision:table.advanced_revision});
     }
    }}>Delete</button>
   </li>)}</ul>
  </>}
  <p role="status">{notice}</p>
 </section>;
}
