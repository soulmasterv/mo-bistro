const byId=id=>document.getElementById(id);
const buttons=[...document.querySelectorAll('[data-action]')];
let snapshot=null,busy=false,pendingAction=null,returnFocus=null;
const say=text=>{byId('message').textContent=text;};
const date=value=>value?new Date(value).toLocaleString('en-GB',{timeZone:'Africa/Cairo',dateStyle:'medium',timeStyle:'short'}):'—';
function render() {
  const license=snapshot?.license;
  byId('plan').textContent=license?.plan??'Unknown';
  byId('status').textContent=license?.status??'Unavailable';
  byId('expiry').textContent=date(license?.expires_at);
  const ready=!!snapshot?.ready && !!snapshot?.version && !!snapshot?.csrfToken && !busy;
  byId('activate').disabled=!ready || license?.status!=='unconfigured';
  byId('renew').disabled=!ready || !license || license.status==='unconfigured';
  byId('suspend').disabled=!ready || license?.status!=='active';
  byId('reactivate').disabled=!ready || license?.status!=='suspended' || new Date(license.expires_at).getTime()<=Date.now();
  byId('refresh').disabled=busy;
  byId('audit').disabled=busy || !snapshot?.writerReady;
}
async function json(url,options={}) {
  const response=await fetch(url,{cache:'no-store',redirect:'error',...options});
  const data=await response.json();
  if(!response.ok) throw Error(data.error||'Connection unavailable. Check current status before trying again.');
  return data;
}
async function load() {
  snapshot=null;render();
  try {
    snapshot=await json('/api/license');render();
    say(snapshot.ready?'Connected to Mo Bistro Preview. Review the current license before choosing an action.':'Connection needs setup. Verify the Preview deployment, matching database targets, license tables and administrator permissions.');
    return true;
  } catch {say('License connection unavailable. Check connection before choosing an action.');return false;}
}
function closeDialog() {
  byId('confirmation').hidden=true;document.body.classList.remove('modal-open');
  document.querySelector('main').inert=false;document.querySelector('header').inert=false;
  pendingAction=null;(returnFocus?.disabled?byId('refresh'):returnFocus)?.focus();
}
buttons.forEach(button=>button.addEventListener('click',()=>{
  if(busy || !snapshot?.ready) return;
  returnFocus=button;pendingAction={action:button.dataset.action,version:snapshot.version,csrfToken:snapshot.csrfToken};
  const reactivate=button.id==='reactivate';
  const title=pendingAction.action==='renew'?'Renew for one month?':pendingAction.action==='suspend'?'Suspend Mo Bistro Preview?':reactivate?'Reactivate Mo Bistro Preview?':'Activate Mo Bistro Preview?';
  byId('confirm-title').textContent=title;
  byId('confirm-description').textContent=pendingAction.action==='renew'
    ?'This adds one month to the later of today or the current expiry. It changes the Preview license only.'
    :pendingAction.action==='suspend'?'Protected restaurant actions in Preview will stop until the license is reactivated or renewed.'
    :reactivate?'This removes suspension and keeps the current expiry. It does not add another month.'
    :'This creates the first monthly Preview license.';
  byId('confirm').textContent=reactivate?'Reactivate':pendingAction.action==='renew'?'Renew one month':pendingAction.action==='suspend'?'Suspend':'Activate';
  byId('confirm').classList.toggle('danger',pendingAction.action==='suspend');
  byId('confirmation').hidden=false;document.body.classList.add('modal-open');
  document.querySelector('main').inert=true;document.querySelector('header').inert=true;byId('cancel').focus();
}));
byId('cancel').addEventListener('click',()=>{if(!busy) closeDialog();});
byId('confirmation').addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();if(!busy) closeDialog();}
  if(event.key==='Tab') {
    const first=byId('cancel'),last=byId('confirm');
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
  }
});
byId('confirm').addEventListener('click',async()=>{
  if(busy || !pendingAction) return;
  busy=true;render();byId('cancel').disabled=true;byId('confirm').disabled=true;
  byId('confirm').textContent=pendingAction.action==='renew'?'Renewing…':pendingAction.action==='suspend'?'Suspending…':'Activating…';
  try {
    const result=await json('/api/license/action',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':pendingAction.csrfToken},
      body:JSON.stringify({action:pendingAction.action,version:pendingAction.version,confirm:true})});
    if(result.success!==true) throw Error('Result unknown. Check current license status before another action.');
    const refreshed=await load();say(refreshed?'License action completed. Current status refreshed.':'Action completed, but status could not be refreshed. Check connection before another action.');
  } catch(error) {snapshot=null;render();say(error.message||'Result unavailable. Check current license status; do not automatically retry.');}
  finally {busy=false;byId('cancel').disabled=false;byId('confirm').disabled=false;closeDialog();render();}
});
byId('refresh').addEventListener('click',async()=>{if(busy)return;busy=true;render();await load();busy=false;render();});
byId('audit').addEventListener('click',async()=>{
  if(busy)return;busy=true;render();
  try {
    const data=await json('/api/license/audit');const list=byId('audit-list');list.replaceChildren();
    const entries=Array.isArray(data.entries)?data.entries:[];
    if(!entries.length) list.textContent='No license changes recorded yet.';
    for(const entry of entries) {
      const row=document.createElement('div');row.className='audit-entry';
      row.textContent=`${entry.action} · ${entry.previous_status??'unconfigured'} → ${entry.new_status} · ${date(entry.created_at)} · Expiry: ${date(entry.new_expiry)}`;
      list.append(row);
    }
    byId('audit-section').hidden=false;
  } catch {say('Audit history unavailable. No license change was made.');}
  finally {busy=false;render();}
});
void load();
