import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
@Injectable()
export class Db extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(){await this.$connect();}
  async onModuleDestroy(){await this.$disconnect();}
  async atomic<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
    for(let attempt=0;;attempt++) {
      try {return await this.$transaction(work,{isolationLevel:'Serializable',timeout:15000});}
      catch(e) {if(e instanceof Prisma.PrismaClientKnownRequestError && ['P2034','P2002'].includes(e.code)&&attempt<3) continue; throw e;}
    }
  }
}
