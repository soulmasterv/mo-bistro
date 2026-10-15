import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

const PANEL_ORIGIN='https://subscribtion.labbing.space';
const VERSION=/^"license-[a-f0-9]{64}"$/;
export function createApp({authorize,client,publicDir}) {
  if(typeof authorize!=='function' || !publicDir) throw Error('Owner authentication and public assets are required');
  const app=express();
  const csrfSecret=randomBytes(32);
  app.disable('x-powered-by');
  app.use(helmet({contentSecurityPolicy:{directives:{
    defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],connectSrc:["'self'"],
    imgSrc:["'self'"],fontSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],baseUri:["'none'"],formAction:["'self'"],
  }}}));
  app.use(authorize); // Preserve the existing RS256 issuer/audience + owner-email verification.
  app.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  app.use(express.json({limit:'4kb'}));
  const digest=(req,stamp)=>createHmac('sha256',csrfSecret)
    .update(`${req.adminEmail}|${req.get('cf-access-jwt-assertion')??''}|${stamp}`).digest('hex');
  function csrf(req) {const stamp=String(Date.now());return `${stamp}.${digest(req,stamp)}`;}
  function validCsrf(req) {
    const match=/^(\d{13})\.([a-f0-9]{64})$/.exec(req.get('x-csrf-token')??'');
    if(!match || Date.now()-Number(match[1])>10*60_000 || Number(match[1])>Date.now()) return false;
    return timingSafeEqual(Buffer.from(match[2],'hex'),Buffer.from(digest(req,match[1]),'hex'));
  }
  app.get('/health',(_req,res)=>res.json({status:'ok',service:'subscription-control'}));
  app.use('/api', (req,res,next)=>req.adminEmail?next():res.status(403).json({error:'Owner access required.'}));
  app.use('/api',rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-8',legacyHeaders:false,keyGenerator:req=>req.adminEmail}));
  app.get('/api/license',async(req,res)=>{
    if(!client) return res.status(503).json({error:'Private license API connection is not configured.'});
    try {res.json({...await client.inspect(),csrfToken:csrf(req),environment:'Preview'});}
    catch {res.status(503).json({error:'License connection unavailable. Check the Preview deployment and private owner-key configuration.'});}
  });
  app.get('/api/license/audit',async(_req,res)=>{
    if(!client) return res.status(503).json({error:'Private license API connection is not configured.'});
    try {res.json(await client.audit());} catch {res.status(503).json({error:'License audit unavailable.'});}
  });
  app.post('/api/license/action',rateLimit({windowMs:60000,limit:8,standardHeaders:'draft-8',legacyHeaders:false,keyGenerator:req=>req.adminEmail}),async(req,res)=>{
    if(req.get('origin')!==PANEL_ORIGIN || (req.get('sec-fetch-site') && req.get('sec-fetch-site')!=='same-origin') || !validCsrf(req))
      return res.status(403).json({error:'Refresh the panel and confirm this action from its own page.'});
    const body=req.body;
    if(!body || Object.keys(body).length!==3 || body.confirm!==true || !['activate','renew','suspend'].includes(body.action) || !VERSION.test(body.version??''))
      return res.status(400).json({error:'A supported action, current license version and explicit confirmation are required.'});
    if(!client) return res.status(503).json({error:'Private license API connection is not configured.'});
    try {res.json(await client.act(body.action,body.version));}
    catch(error) {
      const stale=error.status===412;
      res.status(stale?412:503).json({error:stale?'License changed. Refresh and confirm again.':error.uncertain
        ?'Action result unknown. Check current license status before deciding what to do. Do not automatically retry.'
        :'License action was not confirmed. Check connection and current status before trying again.',uncertain:!!error.uncertain});
    }
  });
  app.use(express.static(publicDir,{etag:false,maxAge:0}));
  app.use((_req,res)=>res.status(404).json({error:'Not found'}));
  app.use((error,_req,res,next)=>{void next;res.status(error.type==='entity.too.large'?413:400).json({error:'Invalid request'});});
  return app;
}
