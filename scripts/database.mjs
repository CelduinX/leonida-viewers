import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
export function database(path=':memory:',{migrate=true}={}){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;');
  if(migrate){
    db.exec('BEGIN IMMEDIATE');
    try{
      db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at INTEGER NOT NULL)');
      const dir=new URL('../migrations/',import.meta.url);
      for(const name of readdirSync(dir).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
        const sql=readFileSync(new URL(name,dir),'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
        const existing=db.prepare('SELECT checksum FROM schema_migrations WHERE name=?').get(name);
        if(existing){if(existing.checksum!==checksum)throw new Error(`Migration checksum mismatch: ${name}`);continue;}
        db.exec(sql);db.prepare('INSERT INTO schema_migrations(name,checksum,applied_at) VALUES (?,?,?)').run(name,checksum,Date.now());
      }
      db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');db.close();throw e;}
  }
  class Statement{
    constructor(sql,values=[]){this.sql=sql;this.values=values;}
    bind(...values){return new Statement(this.sql,values);}
    async first(){return db.prepare(this.sql).get(...this.values)??null;}
    async all(){return {results:db.prepare(this.sql).all(...this.values),meta:{}};}
    execute(){const r=db.prepare(this.sql).run(...this.values);return{results:[],meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
    async run(){return this.execute();}
  }
  return {
    prepare(sql){return new Statement(sql);},
    async batch(statements){
      // No await inside this transaction: other requests cannot interleave on this connection.
      db.exec('BEGIN IMMEDIATE');
      try{const result=statements.map(s=>s.execute());db.exec('COMMIT');return result;}
      catch(e){db.exec('ROLLBACK');throw e;}
    },
    async migrate(){},close(){db.close();},raw:db,
  };
}
