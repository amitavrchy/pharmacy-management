import { BadRequestException } from '@nestjs/common';
import {z} from 'zod';
export const id=z.string().min(1).max(100);
export const text=z.string().trim().min(1).max(200);
export const quantity=z.coerce.number().positive().max(1000000).refine(n=>Math.abs(n*1000-Math.round(n*1000))<0.000001,'Maximum 3 decimal places');
export const minor=z.number().int().min(0).max(100000000);
export const date=z.iso.date();
export function parse<T extends z.ZodType>(schema:T,value:unknown):z.output<T> {
  const result=schema.safeParse(value);
  if(!result.success) throw new BadRequestException(result.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '));
  return result.data;
}
export {z};
