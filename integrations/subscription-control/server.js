import 'dotenv/config';
import {fileURLToPath} from 'node:url';
import {requireCloudflareAccess} from './cloudflare-auth.js';
import {createApp} from './app.js';
import {createLicenseControlClient} from './license-control-client.mjs';

let client=null;
try {
  client=createLicenseControlClient({baseUrl:'https://preview.mo-bistro.labbing.space',adminKey:process.env.LICENSE_ADMIN_TOKEN});
} catch {console.error('License API configuration is incomplete; mutations remain unavailable.');}
const app=createApp({authorize:requireCloudflareAccess,client,publicDir:fileURLToPath(new URL('./public/',import.meta.url))});
app.listen(5065,'127.0.0.1',()=>console.log('Subscription Control listening on 127.0.0.1:5065 (Mo Bistro Preview only)'));
