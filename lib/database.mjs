import {mkdirSync} from 'node:fs';
const schema=[
 'CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,salt TEXT,hash TEXT,verified INTEGER DEFAULT 0,verify_hash TEXT,verify_expires INTEGER,guest_id TEXT,folder_id TEXT,provisioning TEXT DEFAULT \'pending\')',
 'CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT,expires INTEGER)',
 'CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,user_id TEXT,name TEXT,size INTEGER,year TEXT,category TEXT,created TEXT,remote_id TEXT)'
];
export function remoteDatabase(url,token,request=fetch){
 const endpoint=new URL(url.replace(/^(libsql|turso):/, 'https:'));if(endpoint.protocol!=='https:')throw Error('Database URL must use HTTPS.');
 endpoint.pathname='/v2/pipeline';
 async function execute(sql,args=[]){
  const typed=args.map(value=>value==null?{type:'null'}:typeof value==='number'?{type:Number.isInteger(value)?'integer':'float',value:String(value)}:{type:'text',value:String(value)});
  const r=await request(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({requests:[{type:'execute',stmt:{sql,args:typed}},{type:'close'}]}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Database connection failed.');const data=await r.json();const result=data.results?.[0];if(result?.type!=='ok')throw Error('Database query failed.');
  const out=result.response.result;
  return (out.rows||[]).map(row=>Object.fromEntries(out.cols.map((col,i)=>[col.name,row[i].type==='null'?null:['integer','float'].includes(row[i].type)?Number(row[i].value):row[i].value])));
 }
 return {prepare(sql){return {run:(...args)=>execute(sql,args),all:(...args)=>execute(sql,args),get:async(...args)=>(await execute(sql,args))[0]}}};
}
let opening;
export async function database(){
 if(!opening)opening=open().catch(e=>{opening=null;throw e});return opening;
}
async function open(){
 let db;
 if(process.env.TURSO_DATABASE_URL&&process.env.TURSO_AUTH_TOKEN)db=remoteDatabase(process.env.TURSO_DATABASE_URL,process.env.TURSO_AUTH_TOKEN);
 else{
  if(process.env.VERCEL)throw Error('Configure a persistent database before enabling the portal.');
  const {DatabaseSync}=await import('node:sqlite');mkdirSync('.data/uploads',{recursive:true,mode:0o700});db=new DatabaseSync('.data/portal.sqlite');db.exec('PRAGMA journal_mode=WAL');
 }
 for(const sql of schema)await db.prepare(sql).run();return db;
}
