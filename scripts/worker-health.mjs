import{openDatabase}from'./runtime.mjs';
import{monitoring}from'../dist/server/index.js';
try{const db=await openDatabase(process.env,{migrate:false});const status=await monitoring({...process.env,DB:db});await db.close();if(!status.healthy)process.exit(1);}
catch{process.exit(1);}
