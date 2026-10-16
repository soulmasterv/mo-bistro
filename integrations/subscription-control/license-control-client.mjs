// Import only in the port-5065 dashboard's authenticated server routes.
// Never expose the owner key or this configured instance to browser code.
export class LicenseControlError extends Error {
  constructor(message,status=503,uncertain=false) {super(message);this.name='LicenseControlError';this.status=status;this.uncertain=uncertain;}
}
export function createLicenseControlClient({baseUrl,adminKey,fetchImpl=fetch}) {
  if(typeof window!=='undefined') throw Error('License control is server-only');
  const base=new URL(baseUrl);
  if(base.origin!=='https://preview.mo-bistro.labbing.space' || base.pathname!=='/' || base.search || base.hash || base.username || base.password)
    throw Error('Only the approved Mo Bistro Preview origin is supported');
  if(!/^[a-f0-9]{64}$/i.test(adminKey??'')) throw Error('A valid private owner key is required');
  async function call(path,method='GET',version) {
    let response;
    try {
      response=await fetchImpl(new URL(path,base),{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),
        headers:{Authorization:`Bearer ${adminKey}`,Accept:'application/json',...(version?{'If-Match':version}:{})}});
    } catch {
      throw new LicenseControlError(method==='POST'?'License action result unknown. Read setup again before deciding what to do; do not automatically retry.':'License setup unavailable.',503,method==='POST');
    }
    let data;
    try {data=await response.json();} catch {throw new LicenseControlError('License response is invalid; verify the target and do not retry an action automatically.',503,method==='POST');}
    if(response.status===412) throw new LicenseControlError('License changed. Refresh the panel and confirm the action again.',412);
    if(!response.ok) throw new LicenseControlError(`License ${method==='POST'?'action':'setup'} unavailable (HTTP ${response.status}). No automatic retry.`,response.status,method==='POST'&&response.status>=500);
    return data;
  }
  return {
    // Read-only: safe to use for a Connection / Check setup button.
    inspect:()=>call('/api/license/admin/setup'),
    audit:()=>call('/api/license/admin/audit'),
    // Use the version from the snapshot shown to the owner in the custom confirmation.
    // Caller must retain existing Cloudflare Access + server authorization and CSRF checks.
    act:async(action,version)=>{
      if(!['activate','renew','suspend','suspend-notice'].includes(action)) throw Error('Unsupported license action');
      if(!/^"license-[a-f0-9]{64}"$/.test(version??'')) throw Error('Refresh license setup and confirm its version first');
      return call('/api/license/admin/'+action,'POST',version);
    },
  };
}
