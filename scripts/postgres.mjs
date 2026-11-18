import pg from 'pg';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// All integer columns carry counts or UTC epoch milliseconds, bounded to JS safe integers.
pg.types.setTypeParser(20,v=>{const n=Number(v);if(!Number.isSafeInteger(n))throw new Error('Database integer exceeds JS safe range');return n;});
export function parameterize(sql){
  let index=0;
  let normalized=sql.replace(/INSERT OR IGNORE INTO/gi,'INSERT INTO');
  if(/INSERT OR IGNORE INTO/i.test(sql))normalized+=' ON CONFLICT DO NOTHING';
  // Ignore quoted SQL text and identifiers; convert only actual placeholders.
  return normalized.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g,t=>t==='?'?`$${++index}`:t);
}
export function postgres(env=process.env){
  const pool=new pg.Pool({
    ...(env.DATABASE_URL?{connectionString:env.DATABASE_URL}:{host:env.POSTGRES_HOST||'database',port:Number(env.POSTGRES_PORT)||5432,database:env.POSTGRES_DB||'gtavi',user:env.POSTGRES_USER||'gtavi',password:env.POSTGRES_PASSWORD}),
    max:Number(env.DB_POOL_SIZE)||5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,statement_timeout:20000,
    application_name:`leonida-${env.APP_ROLE||'app'}`,
  });
  pool.on('error',()=>console.error(JSON.stringify({event:'database_pool_error',at:new Date().toISOString()})));
  let closing;
  const result=r=>({results:r.rows,meta:{changes:r.rowCount||0}});
  class Statement{
    constructor(sql,values=[]){this.sql=parameterize(sql);this.values=values;}
    bind(...values){const stmt=Object.create(Statement.prototype);stmt.sql=this.sql;stmt.values=values;return stmt;}
    async first(){return(await pool.query(this.sql,this.values)).rows[0]??null;}
    async all(){return result(await pool.query(this.sql,this.values));}
    async run(){return result(await pool.query(this.sql,this.values));}
  }
  return{
    prepare(sql){return new Statement(sql);},
    async batch(statements){
      const client=await pool.connect();
      try{await client.query('BEGIN');const results=[];for(const s of statements)results.push(result(await client.query(s.sql,s.values)));await client.query('COMMIT');return results;}
      catch(e){await client.query('ROLLBACK');console.error(JSON.stringify({event:'database_transaction_error',code:e.code,position:e.position}));throw e;}finally{client.release();}
    },
    async migrate(){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(618246010)');
        await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at BIGINT NOT NULL)');
        const dir=new URL('../migrations/postgres/',import.meta.url);
        for(const name of(await readdir(dir)).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
          const sql=await readFile(new URL(name,dir),'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
          const exists=(await client.query('SELECT checksum FROM schema_migrations WHERE name=$1',[name])).rows[0];
          if(exists){if(exists.checksum!==checksum)throw new Error(`Migration checksum mismatch: ${name}`);continue;}
          await client.query(sql);await client.query('INSERT INTO schema_migrations(name,checksum,applied_at) VALUES($1,$2,$3)',[name,checksum,Date.now()]);
        }
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    },
    async close(){await (closing??=pool.end());},pool,
  };
}
