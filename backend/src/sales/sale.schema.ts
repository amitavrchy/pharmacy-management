import {id,minor,quantity,text,z} from '../common/validation';
export const saleSchema=z.object({
  clientSaleId:z.uuid(),prescriptionId:id.optional(),customerName:z.string().max(100).optional(),customerPhone:z.string().max(30).optional(),
  lines:z.array(z.object({medicineId:id,qty:quantity,prescriptionItemId:id.optional(),scannedLot:text.optional()})).min(1).max(100),
  discountMinor:minor.default(0),tenders:z.array(z.object({method:z.enum(['CASH','BKASH','NAGAD','CARD']),amountMinor:minor})).min(1).max(4),
  substitutionConsent:z.boolean().default(false),witness:text.optional(),ownerPin:z.string().max(100).optional(),
  soldAt:z.iso.datetime().optional()
});
export type SaleInput=z.infer<typeof saleSchema>;
