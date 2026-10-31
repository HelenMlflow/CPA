import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import * as sp from './lib/sharepoint.mjs';
const dev=process.env.DEV_MODE==='1', port=Number(process.env.PORT||3000), base=process.env.PUBLIC_URL||`http://localhost:${port}`;
if(!dev && (!base.startsWith('https://') || !sp.configured() || !process.env.RESEND_API_KEY || !process.env.MAIL_FROM)) throw Error('Production requires HTTPS, Microsoft configuration, and verification email configuration. See .env.example.');
mkdirSync('.data/uploads',{recursive:true,mode:0o700});
const db=new DatabaseSync('.data/portal.sqlite'); db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,salt TEXT,hash TEXT,verified INTEGER DEFAULT 0,verify_hash TEXT,verify_expires INTEGER,guest_id TEXT,folder_id TEXT,provisioning TEXT DEFAULT "pending"); CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT,expires INTEGER); CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,user_id TEXT,name TEXT,size INTEGER,year TEXT,category TEXT,created TEXT,remote_id TEXT);');
const digest=v=>createHash('sha256').update(v).digest('hex');
const safe=u=>u?{id:u.id,name:u.name,email:u.email,verified:!!u.verified,provisioning:u.provisioning}:null;
const save=u=>db.prepare('UPDATE users SET guest_id=?,folder_id=?,provisioning=? WHERE id=?').run(u.guest_id||null,u.folder_id||null,u.provisioning,u.id);
const limits=new Map();
function rate(req){const key=req.socket.remoteAddress;const now=Date.now();let a=limits.get(key);if(!a||a.until<now)a={count:0,until:now+900000};a.count++;limits.set(key,a);if(a.count>40)throw Object.assign(Error('Too many attempts. Please try again later.'),{status:429});}
function fail(message,status=400){throw Object.assign(Error(message),{status});}
async function bytes(req,max=1048576){let chunks=[],n=0;for await(const c of req){n+=c.length;if(n>max)fail('File or request is too large.',413);chunks.push(c);}return Buffer.concat(chunks);}
async function json(req){try{return JSON.parse((await bytes(req)).toString());}catch(e){if(e.status)throw e;fail('Invalid request.');}}
function user(req){const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8);if(!token)return null;return db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.hash=? AND s.expires>?').get(digest(token),Date.now());}
function auth(req){const u=user(req);if(!u)fail('Please sign in.',401);return u;}
function session(res,u){const t=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(t),u.id,Date.now()+28800000);res.setHeader('Set-Cookie',`session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${dev?'':'; Secure'}`);}
const provisioningJobs=new Map();
async function provision(u){
 if(provisioningJobs.has(u.id))return provisioningJobs.get(u.id);
 const job=provisionOnce(u);provisioningJobs.set(u.id,job);try{return await job;}finally{provisioningJobs.delete(u.id);}
}
async function provisionOnce(u){if(dev){u.provisioning='development';save(u);return;}try{await sp.provision(u,save);}catch(e){u.provisioning='pending';save(u);throw e;}}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.mp4':'video/mp4','.jfif':'image/jpeg'};
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
 // Prevent the mirrored site's legacy analytics, chatbot and forms from transmitting client information.
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; media-src 'self' https:; connect-src 'self'; frame-src 'none'; form-action 'self'; base-uri 'self'; object-src 'none'");
 const url=new URL(req.url,base), path=url.pathname;
 const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 try{
 if(path.startsWith('/api/')){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET' && req.headers.origin!==new URL(base).origin)fail('Invalid request origin.',403);
  if(req.method==='GET' && /^\/api\/(blogs|podcasts)(\/[^/]+)?$/.test(path)){
   const parts=path.split('/'),kind=parts[2],lang=url.searchParams.get('lang')==='zh'?'zh':'en';
   const slug=parts[3] ? '-'+encodeURIComponent(decodeURIComponent(parts[3])) : '';
   const f=resolve('public/content',kind+'-'+lang+slug+'.json');
   if(!existsSync(f))return send(slug?{error:'Content not found'}:{items:[],total:0,page:1,page_size:6},slug?404:200);
   const data=JSON.parse(readFileSync(f));if(!slug){const page=Math.max(1,Number(url.searchParams.get('page'))||1),size=Math.min(100,Math.max(1,Number(url.searchParams.get('page_size'))||6));data.items=(data.items||[]).slice((page-1)*size,page*size);data.page=page;data.page_size=size;}
   return send(data);
  }
  if(path==='/api/me')return send({user:safe(user(req)),development:dev});
  if(path==='/api/register'&&req.method==='POST'){
   rate(req);const {name,email,password}=await json(req);if(typeof name!=='string'||name.trim().length<2||name.length>100||typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof password!=='string'||password.length<12||password.length>128)fail('Enter a name, valid email and password of 12–128 characters.');
   const normalized=email.toLowerCase().trim();if(db.prepare('SELECT id FROM users WHERE email=?').get(normalized))fail('This email is already registered. Please sign in.');
   const id=randomUUID(),salt=randomBytes(16).toString('hex'),verify=randomBytes(32).toString('hex');const link=base+'/portal?verify='+verify;
   if(!dev){const mail=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.MAIL_FROM,to:[normalized],subject:'Verify your CPA client account',text:`Verify your email to activate your client account. This link expires in 30 minutes: ${link}`})});if(!mail.ok)fail('Verification email could not be sent. Please try again.',503);}
   db.prepare('INSERT INTO users(id,email,name,salt,hash,verify_hash,verify_expires) VALUES(?,?,?,?,?,?,?)').run(id,normalized,name.trim(),salt,scryptSync(password,salt,64).toString('hex'),digest(verify),Date.now()+1800000);
   const u=db.prepare('SELECT * FROM users WHERE id=?').get(id);session(res,u);return send({user:safe(u),verificationLink:dev?link:undefined});
  }
  if(path==='/api/verify'&&req.method==='POST'){
   rate(req);const {token}=await json(req);if(typeof token!=='string')fail('Invalid verification link.');const u=db.prepare('SELECT * FROM users WHERE verify_hash=? AND verify_expires>?').get(digest(token),Date.now());if(!u)fail('This verification link is invalid or expired.');
   db.prepare('UPDATE users SET verified=1,verify_hash=NULL WHERE id=?').run(u.id);u.verified=1;session(res,u);try{await provision(u);}catch{}return send({user:safe(u)});
  }
  if(path==='/api/login'&&req.method==='POST'){
   rate(req);const {email,password}=await json(req);if(typeof email!=='string'||typeof password!=='string'||password.length>128)fail('Invalid email or password.',401);const u=db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase());const hash=scryptSync(password,u?.salt||'dummy-salt',64);if(!u||!timingSafeEqual(hash,Buffer.from(u.hash,'hex')))fail('Invalid email or password.',401);session(res,u);return send({user:safe(u)});
  }
  if(path==='/api/logout'&&req.method==='POST'){const t=req.headers.cookie?.match(/(?:^|;\s*)session=([^;]+)/)?.[1];if(t)db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(t));res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send({ok:true});}
  if(path==='/api/provision'&&req.method==='POST'){rate(req);const u=auth(req);if(!u.verified)fail('Verify your email first.',403);await provision(u);return send({user:safe(u)});}
  if(path==='/api/files'&&req.method==='GET'){const u=auth(req);return send({files:db.prepare('SELECT id,name,size,year,category,created FROM files WHERE user_id=? ORDER BY created DESC').all(u.id)});}
  if(path==='/api/files'&&req.method==='POST'){
   const u=auth(req);if(!u.verified)fail('Verify your email before uploading.',403);if(!['ready','development'].includes(u.provisioning))fail('Your SharePoint workspace is still being set up.',409);
   const name=url.searchParams.get('name')||'',year=url.searchParams.get('year')||'',category=url.searchParams.get('category')||'';
   if(!/^[^/\\\x00-\x1f]{1,150}\.(pdf|png|jpe?g|csv|xlsx|docx)$/i.test(name)||!/^20\d{2}$/.test(year)||!['Income','Deductions','Business','Other'].includes(category))fail('Choose a supported file, tax year and category.');
   const data=await bytes(req,20*1024*1024);if(!data.length)fail('Empty files cannot be uploaded.');const ext=extname(name).toLowerCase();if(ext==='.pdf'&&!data.subarray(0,5).equals(Buffer.from('%PDF-')))fail('The file does not contain a valid PDF header.');
   const id=randomUUID();const remote=dev?(writeFileSync(resolve('.data/uploads',id),data,{mode:0o600}),null):await sp.upload(u,`${year}-${id}-${name}`,data);
   db.prepare('INSERT INTO files VALUES(?,?,?,?,?,?,?,?)').run(id,u.id,name,data.length,year,category,new Date().toISOString(),remote?.id||null);return send({ok:true},201);
  }
  fail('Not found.',404);
 }
 const target=path==='/portal'? 'portal.html':path==='/'?'index.html':decodeURIComponent(path).slice(1);
 let file=resolve('public',target);if(!file.startsWith(resolve('public')+'/'))fail('Not found.',404);
 if(!existsSync(file)&&!extname(path))file=resolve('public/index.html');
 if(!existsSync(file))fail('Not found.',404);
 res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));
 }catch(e){send({error:e.status?e.message:'The service is temporarily unavailable. Please try again.'},e.status||503);}
});
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`CPA website: ${base} | Client portal: ${base}/portal ${dev?'(development: synthetic files only)':''}`));
