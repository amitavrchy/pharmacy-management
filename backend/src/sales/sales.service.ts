import {Injectable} from '@nestjs/common';
import {Db} from '../db/prisma.service';
import {InventoryService} from '../inventory/inventory.service';
import {Actor,D,money,requireThat} from '../common/domain';
import {audit} from '../common/audit';
import {verifyPassword} from '../auth/password';
import {SaleInput} from './sale.schema';
@Injectable()
export class SalesService {
  constructor(private readonly db:Db,private readonly inventory:InventoryService){}
  async complete(actor:Actor,input:SaleInput){
    return this.db.atomic(async tx=>{
      const existing=await tx.sale.findUnique({where:{clientSaleId:input.clientSaleId},include:{lines:{include:{medicine:true,batches:true}}}});
      if(existing){requireThat(existing.shopId===actor.shopId,'Sale identifier belongs to another shop');return existing;}
      if(input.soldAt){const age=Date.now()-new Date(input.soldAt).getTime();requireThat(age>=-300000&&age<=Number(process.env.POS_OFFLINE_MAX_HOURS||24)*3600000,'Offline sale timestamp is outside the allowed window');}
      const shop=await tx.shop.findUniqueOrThrow({where:{id:actor.shopId}});
      if(input.prescriptionId) await tx.$queryRaw`SELECT id FROM "Prescription" WHERE id=${input.prescriptionId} FOR UPDATE`;
      const rx=input.prescriptionId?await tx.prescription.findFirst({where:{id:input.prescriptionId,shopId:actor.shopId},include:{items:{include:{medicine:true}}}}):null;
      if(input.prescriptionId) requireThat(rx&&['VERIFIED','PARTIALLY_DISPENSED',...(!shop.requirePharmacistForRx?['CAPTURED']:[])].includes(rx.status),'Prescription must be verified and have remaining quantity');
      const usedRx=new Map<string,ReturnType<typeof D>>();
      const prepared=[];let subtotalMinor=0,costTotal=0;
      // Stable lock order prevents two multi-item sales from locking batches in opposite order.
      const sorted=[...input.lines].sort((a,b)=>a.medicineId.localeCompare(b.medicineId));
      for(const line of sorted){
        const med=await tx.medicine.findFirst({where:{id:line.medicineId,shopId:actor.shopId,active:true}});
        requireThat(med,'Medicine unavailable');
        if(med.schedule==='CONTROLLED') requireThat(['OWNER','PHARMACIST'].includes(actor.role),'Controlled medicines require a pharmacist');
        if(med.schedule!=='OTC') requireThat(rx&&line.prescriptionItemId,'Prescription item is required');
        if(!shop.saleWithoutBatchScan) requireThat(line.scannedLot,'Batch scan is required');
        if(line.prescriptionItemId){
          const item=rx?.items.find(i=>i.id===line.prescriptionItemId);requireThat(item,'Item does not belong to selected prescription');
          if(item.medicineId!==med.id){requireThat(input.substitutionConsent&&!item.dispenseAsWritten,'Substitution requires consent and must respect dispense-as-written');requireThat(item.medicine.genericId===med.genericId&&item.medicine.strength===med.strength&&item.medicine.form===med.form&&item.medicine.schedule===med.schedule,'Substitute must match generic, strength, form and schedule');}
          const total=(usedRx.get(item.id)||D(0)).add(line.qty);usedRx.set(item.id,total);
          requireThat(item.qtyDispensed.add(total).lte(item.qtyPrescribed),'Quantity exceeds prescription remaining quantity');
        }
        const plan=await this.inventory.allocateFeFo(tx,actor,med.id,line.qty,true,input.clientSaleId,line.scannedLot);
        subtotalMinor+=money(line.qty,med.priceMinor);costTotal+=plan.reduce((s,p)=>s+money(p.qty,p.costMinor),0);
        prepared.push({...line,unitPriceMinor:med.priceMinor,plan});
      }
      requireThat(input.discountMinor<=subtotalMinor,'Discount exceeds subtotal');
      const totalMinor=subtotalMinor-input.discountMinor;
      requireThat(input.tenders.reduce((s,t)=>s+t.amountMinor,0)===totalMinor,'Tender total must match the payable amount');
      requireThat(totalMinor<=100000000,'Sale exceeds maximum supported value');
      if(totalMinor*10000<costTotal*10000+totalMinor*shop.minMarginBps){
        const owners=await tx.user.findMany({where:{shopId:actor.shopId,role:'OWNER',active:true}});
        requireThat(input.ownerPin&&owners.some(u=>u.pinHash&&verifyPassword(input.ownerPin!,u.pinHash)),'Discount is below minimum margin; owner PIN required');
        await audit(tx,actor,'sale.margin_override',input.clientSaleId,{totalMinor,costTotal});
      }
      const sale=await tx.sale.create({data:{shopId:actor.shopId,cashierId:actor.id,clientSaleId:input.clientSaleId,prescriptionId:input.prescriptionId,customerName:input.customerName||rx?.patientName,customerPhone:input.customerPhone||rx?.patientPhone,subtotalMinor,totalMinor,discountMinor:input.discountMinor,tenders:input.tenders,substitutionConsent:input.substitutionConsent,witness:input.witness,lines:{create:prepared.map(l=>({medicineId:l.medicineId,qty:l.qty,unitPriceMinor:l.unitPriceMinor,prescriptionItemId:l.prescriptionItemId,batches:{create:l.plan}}))}},include:{lines:{include:{medicine:true,batches:true}}}});
      for(const [itemId,qty] of usedRx) await tx.prescriptionItem.update({where:{id:itemId},data:{qtyDispensed:{increment:qty}}});
      if(rx&&usedRx.size){const items=await tx.prescriptionItem.findMany({where:{prescriptionId:rx.id}});await tx.prescription.update({where:{id:rx.id},data:{status:items.every(i=>i.qtyDispensed.gte(i.qtyPrescribed))?'DISPENSED':'PARTIALLY_DISPENSED'}});}
      await audit(tx,actor,'sale.completed',sale.id,{totalMinor,controlled:prepared.filter(l=>rx?.items.some(i=>i.id===l.prescriptionItemId&&i.medicine.schedule==='CONTROLLED')).length,witness:input.witness||null});
      return sale;
    });
  }
}
