import { z, id, text, minor, quantity, date } from "../common/validation";
export const paymentMethod = z.enum(["CASH", "BKASH", "NAGAD", "CARD", "BANK"]);
export const positiveMinor = minor.refine(
  (n) => n > 0,
  "Amount must be positive",
);
export const customerSchema = z.object({
  name: text,
  phone: z.string().trim().min(5).max(30).optional(),
  email: z.email().optional(),
  address: z.string().max(500).default(""),
  allergies: z.array(text).max(30).default([]),
  conditions: z.array(text).max(30).default([]),
  contactConsent: z.boolean().default(false),
  creditLimitMinor: minor.default(0),
});
export const collectionSchema = z.object({
  amountMinor: positiveMinor,
  method: paymentMethod,
  reference: z.uuid(),
  note: text,
  shiftId: id.optional(),
});
export const shiftOpenSchema = z.object({
  registerName: text,
  openingMinor: minor,
});
export const shiftCloseSchema = z.object({ countedMinor: minor, note: text });
export const cashSchema = z.object({
  kind: z.enum(["CASH_IN", "CASH_OUT"]),
  amountMinor: positiveMinor,
  reference: z.uuid(),
  note: text,
});
export const expenseSchema = z.object({
  category: z.enum([
    "RENT",
    "UTILITIES",
    "SALARY",
    "TRANSPORT",
    "MAINTENANCE",
    "OTHER",
  ]),
  amountMinor: positiveMinor,
  method: paymentMethod,
  reference: z.uuid(),
  note: text,
  shiftId: id.optional(),
});
export const billSchema = z.object({
  supplierId: id,
  poId: id.optional(),
  invoiceNumber: text,
  totalMinor: positiveMinor,
  dueDate: date,
  note: z.string().max(500).default(""),
});
export const billPaymentSchema = z.object({
  shiftId: id.optional(),
  amountMinor: positiveMinor,
  method: paymentMethod,
  reference: z.uuid(),
  note: text,
});
export const locationSchema = z.object({
  name: text,
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_-]{2,20}$/),
  kind: z.enum(["COUNTER", "WAREHOUSE", "COLD_ROOM"]),
  canDispense: z.boolean().default(false),
});
export const transferSchema = z.object({
  batchId: id,
  destinationId: id,
  qty: quantity,
  note: text,
});
export const sensorSchema = z
  .object({
    locationId: id,
    name: text,
    minC: z.number().min(-80).max(80),
    maxC: z.number().min(-80).max(80),
  })
  .refine((v) => v.minC < v.maxC, "Minimum must be below maximum");
export const readingSchema = z.object({
  valueC: z.number().min(-80).max(80),
  note: text,
});
export const deliverySchema = z.object({
  saleId: id,
  recipient: text,
  phone: text,
  address: z.string().trim().min(5).max(500),
  note: z.string().max(500).default(""),
});
export const deliveryStatusSchema = z.object({
  status: z.enum([
    "ASSIGNED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "FAILED",
    "QUEUED",
  ]),
  courier: text.optional(),
  proof: z.string().trim().min(3).max(500).optional(),
  note: z.string().max(500).optional(),
});
export const reminderSchema = z.object({
  customerId: id,
  prescriptionId: id.optional(),
  dueDate: date,
  note: text,
});
export const forecastSchema = z.object({
  targetDays: z.coerce.number().int().min(7).max(180).default(30),
  leadDays: z.coerce.number().int().min(0).max(60).default(7),
});
