import 'reflect-metadata';
import 'dotenv/config';
import {Queue,Worker} from 'bullmq';
import {Db} from '../db/prisma.service';
import {maintenance} from './maintenance';
const url=new URL(process.env.REDIS_URL||'redis://localhost:6386');
const connection={host:url.hostname,port:Number(url.port||6379),password:url.password||undefined,maxRetriesPerRequest:null};
const db=new Db();
async function start(){
  await db.$connect();
  const queue=new Queue('pharmacy-maintenance',{connection});
  await queue.upsertJobScheduler('hourly-expiry',{pattern:'0 * * * *',tz:'Asia/Dhaka'},{name:'maintenance',opts:{attempts:3,backoff:{type:'exponential',delay:1000},removeOnComplete:50,removeOnFail:100}});
  const worker=new Worker('pharmacy-maintenance',async()=>maintenance(db),{connection,concurrency:1});
  worker.on('failed',(_job,error)=>console.error('Maintenance failed',error.message));
  await queue.add('startup',{}, {removeOnComplete:true});
  console.log('Pharmacy maintenance worker ready');
  const close=async()=>{await worker.close();await queue.close();await db.$disconnect();process.exit(0);};
  process.on('SIGINT',close);process.on('SIGTERM',close);
}
start().catch(e=>{console.error(e);process.exit(1);});
