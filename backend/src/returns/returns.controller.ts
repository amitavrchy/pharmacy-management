import {Body,Controller,Get,Param,Post,Req} from '@nestjs/common';
import {Db} from '../db/prisma.service';
import {Roles} from '../auth/auth';
import {id,parse,text,z} from '../common/validation';
import {dateUTC,requireThat} from '../common/domain';
import {audit} from '../common/audit';
@Controller('returns')
export class ReturnsController {
  constructor(private readonly db:Db){}
  @Get() list(@Req() r:any){return this.db.saleReturn.findMany({where:{sale:{shopId:r.user.shopId}},include:{sale:{include:{lines:{include:{medicine:true}}}}},orderBy:{createdAt:'desc'},take:200});}
  @Roles('OWNER','PHARMACIST','CASHIER') @Post() async request(@Req() r:any,@Body() body:unknown){const v=parse(z.object({saleId:id,reason:text}),body);return this.db.atomic(async tx=>{const sale=await tx.sale.findFirst({where:{id:v.saleId,shopId:r.user.shopId},include:{returns:true}});requireThat(sale?.status==='COMPLETED','Completed sale not found');requireThat(!sale.returns.some(ret=>ret.status!=='REJECTED'),'A return already exists for this receipt');const shop=await tx.shop.findUniqueOrThrow({where:{id:r.user.shopId}});requireThat(Date.now()-sale.completedAt.getTime()<=shop.returnDays*86400000,'Return period has ended');const ret=await tx.saleReturn.create({data:{...v,requestedBy:r.user.id}});await audit(tx,r.user,'return.requested',ret.id);return ret;});}
  @Roles('OWNER','PHARMACIST') @Post(':id/review') async review(@Req() r:any,@Param('id') returnId:string,@Body() body:unknown){
    const {approve}=parse(z.object({approve:z.boolean()}),body);
    return this.db.atomic(async tx=>{
      await tx.$queryRaw`SELECT id FROM "SaleReturn" WHERE id=${returnId} FOR UPDATE`;
      const ret=await tx.saleReturn.findFirst({where:{id:returnId,sale:{shopId:r.user.shopId}},include:{sale:{include:{lines:{include:{batches:{include:{batch:true}}}}}}}});
      requireThat(ret?.status==='REQUESTED','Return is already processed or unavailable');
      if(!approve){await audit(tx,r.user,'return.rejected',ret.id);return tx.saleReturn.update({where:{id:ret.id},data:{status:'REJECTED',approvedBy:r.user.id}});}
      await tx.saleReturn.update({where:{id:ret.id},data:{status:'APPROVED',approvedBy:r.user.id}});
      for(const line of ret.sale.lines) for(const allocation of line.batches){
        const qty=allocation.qty.sub(allocation.returnedQty);requireThat(qty.gt(0),'Sale stock already returned');
        const restock=allocation.batch.status==='ACTIVE'&&!allocation.batch.recalled&&allocation.batch.expiryDate>dateUTC();
        if(restock) await tx.stockBatch.update({where:{id:allocation.batchId},data:{qtyOnHand:{increment:qty}}});
        await tx.stockMovement.create({data:{batchId:allocation.batchId,type:restock?'CUSTOMER_RETURN':'RETURN_WASTE',qty:restock?qty:0,refType:'RETURN',refId:ret.id,note:`Returned ${qty} units${restock?'':'; isolated as waste'}`}});
        await tx.saleLineBatch.update({where:{id:allocation.id},data:{returnedQty:allocation.qty}});
      }
      await tx.sale.update({where:{id:ret.saleId},data:{status:'RETURNED'}});
      await audit(tx,r.user,'return.restocked',ret.id,{refundMinor:ret.sale.totalMinor});
      return tx.saleReturn.update({where:{id:ret.id},data:{status:'RESTOCKED',refundMinor:ret.sale.totalMinor}});
    });
  }
}
