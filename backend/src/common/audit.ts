import {Prisma} from '@prisma/client';
import {Actor} from './domain';
export async function audit(tx:Prisma.TransactionClient,actor:Actor,action:string,entityId:string,details:Prisma.InputJsonValue={}) {
  await tx.auditEntry.create({data:{shopId:actor.shopId,actorId:actor.id,action,entityId,details}});
}
