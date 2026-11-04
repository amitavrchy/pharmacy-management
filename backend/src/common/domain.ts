import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
export const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);
export function shopDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function dateUTC(date = shopDate()) {
  return new Date(`${date}T00:00:00.000Z`);
}
export function daysUntil(date: Date, now = new Date()) {
  return Math.round(
    (date.getTime() - dateUTC(shopDate(now)).getTime()) / 86400000,
  );
}
export function money(qty: Prisma.Decimal.Value, unit: number) {
  return D(qty)
    .mul(unit)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}
export function requireThat(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new BadRequestException(message);
}
export type Actor = { id: string; shopId: string; role: string; name: string };
export type BatchCandidate = {
  id: string;
  expiryDate: Date;
  qtyOnHand: Prisma.Decimal;
  status: string;
  recalled: boolean;
  costMinor: number;
};
export function planFefo(
  batches: BatchCandidate[],
  quantity: Prisma.Decimal.Value,
  today = dateUTC(),
) {
  let remaining = D(quantity);
  requireThat(remaining.gt(0), "Quantity must be positive");
  const allocations: {
    batchId: string;
    qty: Prisma.Decimal;
    costMinor: number;
  }[] = [];
  for (const b of [...batches]
    .filter(
      (b) =>
        b.status === "ACTIVE" &&
        !b.recalled &&
        b.expiryDate > today &&
        b.qtyOnHand.gt(0),
    )
    .sort(
      (a, b) =>
        a.expiryDate.getTime() - b.expiryDate.getTime() ||
        a.id.localeCompare(b.id),
    )) {
    if (remaining.lte(0)) break;
    const qty = Prisma.Decimal.min(remaining, b.qtyOnHand);
    allocations.push({ batchId: b.id, qty, costMinor: b.costMinor });
    remaining = remaining.sub(qty);
  }
  requireThat(remaining.eq(0), "Insufficient unexpired, available stock");
  return allocations;
}
