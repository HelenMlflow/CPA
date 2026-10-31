import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {remoteDatabase} from '../lib/database.mjs';

test('Vercel starts without portal secrets and public pages remain available',async()=>{
 process.env.VERCEL='1';process.env.DEV_MODE='1';
 for(const key of ['MS_TENANT_ID','MS_CLIENT_ID','MS_CLIENT_SECRET','SHAREPOINT_DRIVE_ID','SHAREPOINT_PARENT_ID','TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','RESEND_API_KEY','MAIL_FROM'])delete process.env[key];
 const {default:handler}=await import('../api/index.mjs');
 const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const path of ['/','/about','/services/tax-preparation','/portal','/portal.js'])assert.equal((await fetch(base+path)).status,200,path);
  const state=await (await fetch(base+'/api/me')).json();assert.equal(state.available,false);assert.equal(state.development,false);assert.equal(state.user,null);
  const blocked=await fetch(base+'/api/register',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:'{}'});assert.equal(blocked.status,503);
  assert.equal((await fetch(base+'/api/podcasts?lang=en')).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('hosted database binds parameters and decodes typed SQL rows',async()=>{
 let request;
 const db=remoteDatabase('libsql://example.turso.io','synthetic-token',async(url,options)=>{
  request={url:String(url),...options};return new Response(JSON.stringify({results:[{type:'ok',response:{result:{cols:[{name:'id'},{name:'verified'},{name:'folder_id'}],rows:[[{type:'text',value:'client'},{type:'integer',value:'1'},{type:'null'}]]}}},{type:'ok',response:{type:'close'}}]}));
 });
 assert.deepEqual(await db.prepare('SELECT * FROM users WHERE id=?').get('client'),{id:'client',verified:1,folder_id:null});
 assert.equal(request.url,'https://example.turso.io/v2/pipeline');assert.deepEqual(JSON.parse(request.body).requests[0].stmt.args,[{type:'text',value:'client'}]);
 const broken=remoteDatabase('https://example.turso.io','synthetic-token',async()=>new Response(JSON.stringify({results:[{type:'error',error:{message:'private error'}}]})));
 await assert.rejects(broken.prepare('SELECT 1').all(),/Database query failed/);
});
