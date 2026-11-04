import {Body,Controller,Get,Param,Post,Req} from '@nestjs/common';
import {Db} from '../db/prisma.service';
import {InventoryService} from './inventory.service';
import {Roles} from '../auth/auth';
import {parse,z,id,quantity,text} from '../common/validation';
@Controller('inventory')
export class InventoryController {
  constructor(private readonly db:Db,private readonly inventory:InventoryService){}
  @Get() async list(@Req() r:any){
    const rows=await this.db.stockBatch.findMany({where:{shopId:r.user.shopId},include:{medicine:{include:{generic:true}}},orderBy:{expiryDate:'asc'}});
    return rows.map(row=>({...row,costMinor:['OWNER','AUDITOR'].includes(r.user.role)?row.costMinor:undefined}));
  }
  @Post('allocate-preview') async preview(@Req() r:any,@Body() body:unknown){const v=parse(z.object({medicineId:id,qty:quantity}),body);return this.db.atomic(tx=>this.inventory.allocateFeFo(tx,r.user,v.medicineId,v.qty,false));}
  @Roles('OWNER','STORE_KEEPER') @Post(':id/adjust') async adjust(@Req() r:any,@Param('id') batchId:string,@Body() body:unknown){const v=parse(z.object({qty:quantity.or(z.literal(0)),note:text,rack:z.string().max(80).optional()}),body);return this.inventory.adjust(r.user,batchId,v.qty,v.note,v.rack);}
  @Get(':id/movements') movements(@Req() r:any,@Param('id') batchId:string){return this.db.stockMovement.findMany({where:{batchId,batch:{shopId:r.user.shopId}},orderBy:{createdAt:'desc'},take:200});}
}
