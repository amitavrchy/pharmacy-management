import {Controller,Get,Param,Post,Req} from '@nestjs/common';
import {Db} from '../db/prisma.service';
import {Roles} from '../auth/auth';
import {requireThat} from '../common/domain';
@Controller('alerts')
export class AlertsController {
  constructor(private readonly db:Db){}
  @Get() list(@Req() r:any){return this.db.alert.findMany({where:{shopId:r.user.shopId},orderBy:{createdAt:'desc'},take:300});}
  @Roles('OWNER','PHARMACIST','STORE_KEEPER') @Post(':id/resolve') async resolve(@Req() r:any,@Param('id') alertId:string){requireThat(await this.db.alert.findFirst({where:{id:alertId,shopId:r.user.shopId}}),'Alert not found');return this.db.alert.update({where:{id:alertId},data:{resolvedAt:new Date()}});}
}
