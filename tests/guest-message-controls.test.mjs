import test from 'node:test';
import assert from 'node:assert/strict';
import {load,requireDependency} from './handler-harness.mjs';
const React=requireDependency('react');
function elements(tree){
 if(!tree||typeof tree!=='object')return [];
 return [tree,...React.Children.toArray(tree.props?.children).flatMap(elements)];
}
function editor({subscribed=true,confirmed=true,preset='almost_ready',minutes=''}={}){
 const requests=[],dialogs=[];
 let stateIndex=0;
 const component=load('src/components/guest-eta-editor.tsx',{
  react:{...React,useState:value=>{const index=stateIndex++;return [index===0?minutes:index===3?preset:value,()=>{}];},useRef:value=>({current:value})},
  '@/components/confirmation-provider':{useConfirmation:()=>async options=>{dialogs.push(options);return confirmed;}},
 },{crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},fetch:async(url,init)=>{requests.push({url,...JSON.parse(init.body)});return Response.json({manual_nearly_ready:'queued'});}}).default;
 const tree=component({guestId:98,onSaved(){},manualNearlyReady:true,canMessage:subscribed});
 const button=elements(tree).find(e=>e.type==='button'&&e.props.children==='Send preset update');
 return {tree,button,requests,dialogs};
}
test('preset updates are disabled without subscription and do not issue requests',async()=>{
 const h=editor({subscribed:false});assert.equal(h.button.props.disabled,true);
 await h.button.props.onClick();assert.equal(h.requests.length,0);assert.equal(h.dialogs.length,0);
});
test('cancelled in-app confirmation does not send or change ETA',async()=>{
 const h=editor({confirmed:false});await h.button.props.onClick();
 assert.equal(h.dialogs.length,1);assert.equal(h.requests.length,0);
});
test('confirmed preset queues the immutable nearly-ready message through the existing ETA route',async()=>{
 const h=editor();await h.button.props.onClick();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.dialogs[0].confirmLabel,'Send update');assert.equal(h.requests.length,1);
 assert.equal(h.requests[0].url,'/api/guests/98/eta');assert.equal(h.requests[0].minutes,10);
 assert.equal(h.requests[0].message,'almost_ready');
});
test('native dial links normalize supported mobile formats and reject unsafe inputs',()=>{
 const {guestDialHref}=load('src/lib/guest-phone.ts');
 for(const number of ['01012345678','010 1234 5678','+20 1012345678','00201012345678'])assert.equal(guestDialHref(number),'tel:+201012345678');
 assert.equal(guestDialHref('+44 7700 900123'),'tel:+447700900123');
 for(const input of ['',null,'javascript:alert(1)','01012345678;123','https://evil.example'])assert.equal(guestDialHref(input),null);
});
test('updated-wait preset validates minutes and sends the selected value',async()=>{
 const invalid=editor({preset:'eta_update',minutes:''});await invalid.button.props.onClick();
 assert.equal(invalid.dialogs.length,0);assert.equal(invalid.requests.length,0);
 const valid=editor({preset:'eta_update',minutes:'15'});await valid.button.props.onClick();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(valid.requests.length,1);assert.equal(valid.requests[0].message,'eta_update');assert.equal(valid.requests[0].minutes,15);
});
