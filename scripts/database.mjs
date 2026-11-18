import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
export function database(path=':memory:'){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
  class Statement{
    constructor(sql,values=[]){this.sql=sql;this.values=values;}
    bind(...values){return new Statement(this.sql,values);}
    async first(){return db.prepare(this.sql).get(...this.values)??null;}
    async all(){return {results:db.prepare(this.sql).all(...this.values),meta:{}};}
    async run(){const result=db.prepare(this.sql).run(...this.values);return {results:[],meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};}
  }
  return {
    prepare(sql){return new Statement(sql);},
    async batch(statements){
      db.exec('BEGIN IMMEDIATE');
      try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}
      catch(e){db.exec('ROLLBACK');throw e;}
    },
    close(){db.close();},raw:db,
  };
}
