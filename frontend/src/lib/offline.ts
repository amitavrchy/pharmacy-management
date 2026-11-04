import {openDB} from 'idb';
import {post} from './api';
const db=()=>openDB('medora-pos',1,{upgrade(db){db.createObjectStore('queue',{keyPath:'clientSaleId'});db.createObjectStore('catalog');}});
export async function saveCatalog(owner:string,items:any[]){await(await db()).put('catalog',items,owner);}
export async function readCatalog(owner:string){return(await db()).get('catalog',owner);}
export async function queueSale(owner:string,sale:any){const {ownerPin,...safe}=sale;await(await db()).put('queue',{...safe,owner,status:'QUEUED',queuedAt:new Date().toISOString()});window.dispatchEvent(new Event('pharmacy:queue'));}
export async function queuedSales(owner:string){return(await(await db()).getAll('queue')).filter(s=>s.owner===owner);}
export async function removeQueued(id:string){await(await db()).delete('queue',id);window.dispatchEvent(new Event('pharmacy:queue'));}
export async function syncSales(owner:string){const queue=await queuedSales(owner);if(!queue.length)return[];const result=await post<any[]>('sync/push',{sales:queue.map(({owner,status,queuedAt,reason,...s})=>s)});for(const r of result){if(r.status==='COMPLETED')await removeQueued(r.clientSaleId);else{const sale=queue.find(s=>s.clientSaleId===r.clientSaleId);await(await db()).put('queue',{...sale,status:r.status,reason:r.reason});}}window.dispatchEvent(new Event('pharmacy:queue'));window.dispatchEvent(new Event('pharmacy:refresh'));return result;}
export async function clearLocal(){const database=await db();await database.clear('catalog');}
