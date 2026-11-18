import{openDatabase,log}from'./runtime.mjs';
try{const db=await openDatabase();await db.close();log('migrations_complete');}
catch(e){log('migration_failed',{type:e.name,code:e.code||'migration_error'});process.exit(1);}
