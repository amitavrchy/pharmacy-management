import { test } from "node:test";
import assert from "node:assert/strict";
import {
  D,
  dateUTC,
  daysUntil,
  money,
  planFefo,
  shopDate,
} from "../src/common/domain";
import { parse, quantity } from "../src/common/validation";
import { hashPassword, verifyPassword } from "../src/auth/password";
const batch = (
  id: string,
  expiry: string,
  qty: number,
  status = "ACTIVE",
  recalled = false,
) => ({
  id,
  expiryDate: dateUTC(expiry),
  qtyOnHand: D(qty),
  status,
  recalled,
  costMinor: 100,
});
test("FEFO orders mixed expiries and splits quantities exactly", () => {
  const plan = planFefo(
    [batch("later", "2030-09-01", 10), batch("first", "2030-05-01", 2.125)],
    3.25,
    dateUTC("2030-01-01"),
  );
  assert.deepEqual(
    plan.map((p) => [p.batchId, p.qty.toString()]),
    [
      ["first", "2.125"],
      ["later", "1.125"],
    ],
  );
});
test("expired, same-day, recalled and quarantined batches cannot be sold", () => {
  for (const b of [
    batch("expired", "2030-01-01", 10),
    batch("today", "2030-02-01", 10),
    batch("recall", "2031-01-01", 10, "ACTIVE", true),
    batch("quarantine", "2031-01-01", 10, "QUARANTINED"),
  ])
    assert.throws(
      () => planFefo([b], 1, dateUTC("2030-02-01")),
      /Insufficient/,
    );
});
test("insufficient stock and negative quantity fail without a partial plan", () => {
  assert.throws(() =>
    planFefo([batch("b", "2031-01-01", 1)], 2, dateUTC("2030-01-01")),
  );
  assert.throws(() => planFefo([], 0));
});
test("Dhaka business day changes at 18:00 UTC", () => {
  assert.equal(shopDate(new Date("2030-06-01T17:59:59Z")), "2030-06-01");
  assert.equal(shopDate(new Date("2030-06-01T18:00:00Z")), "2030-06-02");
  assert.equal(
    daysUntil(dateUTC("2030-07-02"), new Date("2030-06-01T18:00:00Z")),
    30,
  );
});
test("minor-unit money rounds half-up without binary multiplication drift", () => {
  assert.equal(money("1.005", 100), 101);
  assert.equal(money("0.125", 120), 15);
  assert.equal(money("2.5", 199), 498);
});
test("quantity boundaries reject unsupported decimal precision", () => {
  assert.equal(parse(quantity, "1.125"), 1.125);
  assert.throws(() => parse(quantity, "1.0001"));
  assert.throws(() => parse(quantity, -1));
});
test("salted scrypt hash verifies only the correct password", () => {
  const hash = hashPassword("Correct-password-123");
  assert.ok(verifyPassword("Correct-password-123", hash));
  assert.ok(!verifyPassword("incorrect", hash));
  assert.notEqual(hash, hashPassword("Correct-password-123"));
});
