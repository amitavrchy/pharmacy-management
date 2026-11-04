import {Body,Controller,Get,Param,Post,Req} from '@nestjs/common';
import {Db} from '../db/prisma.service';
import {Roles} from '../auth/auth';
import {id,parse,quantity,text,z} from '../common/validation';
import {requireThat} from '../common/domain';
import {audit} from '../common/audit';
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly db:Db){}
  @Get() async list(@Req() r:any){const rows=await this.db.prescription.findMany({where:{shopId:r.user.shopId},select:{id:true,rxNumber:true,doctorName:true,patientName:true,patientPhone:true,status:true,verifiedBy:true,capturedAt:true,items:{include:{medicine:true}}},orderBy:{capturedAt:'desc'},take:300});return rows;}
  @Roles('OWNER','PHARMACIST','CASHIER') @Post() async create(@Req() r:any,@Body() body:unknown){
    const v=parse(z.object({rxNumber:text,doctorName:text,patientName:text,patientPhone:z.string().max(30).optional(),imageData:z.string().max(1500000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).optional(),items:z.array(z.object({medicineId:id,qtyPrescribed:quantity,dispenseAsWritten:z.boolean().default(false)})).min(1).max(50)}),body);
    return this.db.atomic(async tx=>{for(const item of v.items) requireThat(await tx.medicine.findFirst({where:{id:item.medicineId,shopId:r.user.shopId,active:true}}),'Medicine not found');const rx=await tx.prescription.create({data:{...v,shopId:r.user.shopId,items:{create:v.items}}});await audit(tx,r.user,'prescription.captured',rx.id);return rx;});
  }
  @Roles('OWNER','PHARMACIST') @Post(':id/verify') async verify(@Req() r:any,@Param('id') rxId:string){return this.db.atomic(async tx=>{const rx=await tx.prescription.findFirst({where:{id:rxId,shopId:r.user.shopId}});requireThat(rx?.status==='CAPTURED','Only captured prescriptions can be verified');const updated=await tx.prescription.update({where:{id:rxId},data:{status:'VERIFIED',verifiedBy:r.user.id}});await audit(tx,r.user,'prescription.verified',rxId);return updated;});}
  @Roles('OWNER','PHARMACIST') @Post(':id/cancel') async cancel(@Req() r:any,@Param('id') rxId:string){return this.db.atomic(async tx=>{const rx=await tx.prescription.findFirst({where:{id:rxId,shopId:r.user.shopId}});requireThat(rx&&['CAPTURED','VERIFIED'].includes(rx.status),'Only undispensed prescriptions may be cancelled');await audit(tx,r.user,'prescription.cancelled',rxId);return tx.prescription.update({where:{id:rxId},data:{status:'CANCELLED'}});});}
  @Roles('OWNER','PHARMACIST') @Get(':id/image') async image(@Req() r:any,@Param('id') rxId:string){const rx=await this.db.prescription.findFirst({where:{id:rxId,shopId:r.user.shopId},select:{imageData:true}});requireThat(rx,'Prescription not found');return rx;}
}
