export async function openDatabase(env=process.env,{migrate=true}={}){
  if(env.DATABASE_URL||env.DATABASE_DRIVER==='postgres'){
    const {postgres}=await import('./postgres.mjs');const db=postgres(env);
    if(migrate)await db.migrate();return db;
  }
  const {database}=await import('./database.mjs');return database(env.DATABASE_PATH||'./data/leonida.sqlite',{migrate});
}
export function log(event,details={}){console.log(JSON.stringify({at:new Date().toISOString(),event,...details}));}
