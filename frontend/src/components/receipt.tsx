"use client";
import { Printer } from "lucide-react";
import { useApp } from "./providers";
import { Button } from "./ui";
import { taka, number, formatDate } from "@/lib/api";
export function Receipt({ sale }: { sale: any }) {
  const { user } = useApp();
  return (
    <>
      <article className="receipt">
        <div className="receipt-header">
          <h2>{user?.shop.name}</h2>
          <p>{user?.shop.address}</p>
          <p>{user?.shop.phone}</p>
          <p>License: {user?.shop.drugLicenseNo || "Not configured"}</p>
        </div>
        <div className="row space-between">
          <span>Receipt</span>
          <strong>#{sale.id.slice(-8).toUpperCase()}</strong>
        </div>
        <div className="row space-between">
          <span>Date</span>
          <span>{formatDate(sale.completedAt)}</span>
        </div>
        <p>
          {sale.customerName || "Walk-in customer"}
          {sale.customerPhone ? ` · ${sale.customerPhone}` : ""}
        </p>
        <hr />
        {sale.lines.map((l: any) => (
          <div className="row space-between" key={l.id}>
            <div>
              <strong>{l.medicine.brandName}</strong>
              <p>
                {number(l.qty)} × {taka(l.unitPriceMinor)}
              </p>
            </div>
            <strong>
              {taka(Math.round(Number(l.qty) * l.unitPriceMinor))}
            </strong>
          </div>
        ))}
        <hr />
        <div className="row space-between">
          <span>Subtotal</span>
          <span>{taka(sale.subtotalMinor)}</span>
        </div>
        <div className="row space-between">
          <span>Discount</span>
          <span>− {taka(sale.discountMinor)}</span>
        </div>
        <div className="row space-between">
          <strong>Total paid</strong>
          <h2>{taka(sale.totalMinor)}</h2>
        </div>
        {sale.tenders.map((t: any, i: number) => (
          <div className="row space-between" key={i}>
            <span>{t.method}</span>
            <span>{taka(t.amountMinor)}</span>
          </div>
        ))}
        <hr />
        <p style={{ textAlign: "center" }}>
          Thank you for choosing care.
          <br />
          Keep this receipt for returns.
        </p>
      </article>
      <Button variant="secondary" onClick={() => window.print()}>
        <Printer size={17} />
        Print receipt
      </Button>
    </>
  );
}
