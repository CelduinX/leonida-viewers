// One-time, transactional migration of an existing SQLite installation to empty PostgreSQL.
import{DatabaseSync}from'node:sqlite';
import{postgres}from'./postgres.mjs';
import{log}from'./runtime.mjs';
const sourcePath=process.argv[2];if(!sourcePath){console.error('Usage: node scripts/import-sqlite.mjs /path/to/leonida.sqlite');process.exit(1);}
const source=new DatabaseSync(sourcePath,{readOnly:true});source.exec('BEGIN');const destination=postgres();
const tables=['country_mappings','snapshots','snapshot_chunks','profiles','collector_state','viewer_peaks','recording_state','monitor_status'];
const client=await destination.pool.connect();
try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(618246010)');
  for(const table of tables){const {rows}=await client.query(`SELECT COUNT(*) AS n FROM ${table}`);if(Number(rows[0].n)>0)throw new Error('Destination must be empty; stop Web and Worker before import.');}
  let count=0;
  for(const table of tables){
    if(!source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;
    const columns=source.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
    if(columns.some(c=>!/^[_a-z0-9]+$/.test(c)))throw new Error('Unexpected source schema');
    let batch=[];
    async function flush(){if(!batch.length)return;let n=0;const values=batch.flatMap(row=>columns.map(c=>row[c]));await client.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${batch.map(()=>`(${columns.map(()=>`$${++n}`).join(',')})`).join(',')}`,values);count+=batch.length;batch=[];}
    for(const row of source.prepare(`SELECT * FROM ${table}`).iterate()){batch.push(row);if(batch.length>=100)await flush();}await flush();
  }
  await client.query("SELECT setval(pg_get_serial_sequence('snapshots','id'),COALESCE(MAX(id),1),MAX(id) IS NOT NULL) FROM snapshots");
  // A migrated worker must acquire a fresh lease; no old process owns the target DB.
  await client.query('UPDATE collector_state SET lease_until=0,lease_owner=NULL');
  await client.query('COMMIT');log('sqlite_import_complete',{rows:count});
}catch(e){await client.query('ROLLBACK');log('sqlite_import_failed',{type:e.name,code:e.code||'destination_not_empty'});process.exitCode=1;}
finally{client.release();source.close();await destination.close();}
