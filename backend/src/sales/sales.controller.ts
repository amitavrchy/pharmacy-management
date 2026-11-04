import {Body,Controller,Get,Post,Req} from '@nestjs/common';
import {Roles} from '../auth/auth';
import {parse} from '../common/validation';
import {Db} from '../db/prisma.service';
import {saleSchema} from './sale.schema';
import {SalesService} from './sales.service';
@Controller('pos/sales')
export class SalesController {
  constructor(private readonly db:Db,private readonly sales:SalesService){}
  @Roles('OWNER','PHARMACIST','CASHIER') @Post() create(@Req() r:any,@Body() body:unknown){return this.sales.complete(r.user,parse(saleSchema,body));}
  @Get() list(@Req() r:any){return this.db.sale.findMany({where:{shopId:r.user.shopId},include:{lines:{include:{medicine:true,batches:true}},returns:true},orderBy:{completedAt:'desc'},take:300});}
}
