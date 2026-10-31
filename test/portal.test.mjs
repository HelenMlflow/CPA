import {test} from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:3000';
async function call(path,body,cookie,raw=false){const r=await fetch(base+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),'Content-Type':raw?'application/octet-stream':'application/json'},body:body===undefined?undefined:raw?body:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
test('account verification, uploads, isolation and logout',async()=>{
 const email=`test-${Date.now()}@example.com`,password='Synthetic-test-pass-2026';
 const a=await call('register',{name:'Synthetic Client',email,password});assert.equal(a.status,200);assert.ok(a.data.verificationLink);const cookie=a.cookie;
 let upload=await call('files?name=test.pdf&year=2026&category=Income',Buffer.from('%PDF-1.4\nSynthetic test only'),cookie,true);assert.equal(upload.status,403);
 const token=new URL(a.data.verificationLink).searchParams.get('verify');assert.equal((await call('verify',{token},cookie)).status,200);assert.equal((await call('verify',{token},cookie)).status,400);
 upload=await call('files?name=test.pdf&year=2026&category=Income',Buffer.from('%PDF-1.4\nSynthetic test only'),cookie,true);assert.equal(upload.status,201);
 assert.equal((await call('files',undefined,cookie)).data.files.length,1);
 assert.equal((await call('files?name=test.exe&year=2026&category=Income',Buffer.from('bad'),cookie,true)).status,400);
 const b=await call('register',{name:'Other Client',email:'other-'+email,password});assert.equal((await call('files',undefined,b.cookie)).data.files.length,0);
 assert.equal((await call('login',{email,password:'wrong-password'})).status,401);assert.equal((await call('login',{email,password})).status,200);
 await call('logout',{},cookie);assert.equal((await call('files',undefined,cookie)).status,401);
 assert.equal((await call('files')).status,401);
});
