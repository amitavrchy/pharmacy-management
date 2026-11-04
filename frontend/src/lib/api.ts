export class ApiError extends Error {constructor(public status:number,message:string){super(message);}}
export async function api<T=any>(path:string,options:RequestInit={}):Promise<T>{
  const res=await fetch(`/api/${path}`,{...options,credentials:'include',headers:{'Content-Type':'application/json','X-Pharmacy-Client':'web',...options.headers},cache:'no-store'});
  const body=await res.json().catch(()=>({message:'Service unavailable'}));
  if(!res.ok)throw new ApiError(res.status,body.message||'Request failed');return body;
}
export const post=<T=any>(path:string,data:unknown={})=>api<T>(path,{method:'POST',body:JSON.stringify(data)});
export const patch=<T=any>(path:string,data:unknown)=>api<T>(path,{method:'PATCH',body:JSON.stringify(data)});
export const taka=(minor:number=0)=>new Intl.NumberFormat('en-BD',{style:'currency',currency:'BDT',minimumFractionDigits:2}).format(minor/100);
export const number=(n:number|string=0)=>new Intl.NumberFormat('en-BD',{maximumFractionDigits:3}).format(Number(n));
export const formatDate=(date:string)=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Dhaka'}).format(new Date(date));
export function downloadCSV(name:string,rows:Record<string,unknown>[]){
  if(!rows.length)return;
  const keys=Object.keys(rows[0]);
  const cell=(v:unknown)=>`"${String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')}"`;
  const csv=[keys.map(cell).join(','),...rows.map(row=>keys.map(k=>cell(typeof row[k]==='object'?JSON.stringify(row[k]):row[k])).join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);
}
