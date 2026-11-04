"use client";
import { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button, Empty, ErrorState, Loading } from "./ui";
export function Metrics({
  items,
}: {
  items: { label: string; value: ReactNode; hint: string; tone?: string }[];
}) {
  return (
    <div className="stats-grid">
      {items.map((item) => (
        <div
          className={`stat-card metric-${item.tone || "green"}`}
          key={item.label}
        >
          <div className="stat-top">
            {item.label}
            <ArrowUpRight size={17} />
          </div>
          <div className="stat-value mono">{item.value}</div>
          <div className="stat-bottom">{item.hint}</div>
        </div>
      ))}
    </div>
  );
}
export function ResourceState({
  resource,
  children,
}: {
  resource: { loading: boolean; error: string; reload: () => void };
  children: ReactNode;
}) {
  return resource.loading ? (
    <Loading />
  ) : resource.error ? (
    <ErrorState error={resource.error} retry={resource.reload} />
  ) : (
    <>{children}</>
  );
}
export function Tabs({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  items: [string, string][];
}) {
  return (
    <div className="tabs">
      {items.map(([key, label]) => (
        <button
          key={key}
          className={value === key ? "active" : ""}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
export const options = (rows: any[] | null, display: (row: any) => string) =>
  (rows || []).map((row) => ({ value: row.id, label: display(row) }));
export const amountField = (label = "Amount (৳)", name = "amount") => ({
  name,
  label,
  type: "number",
  min: 0.01,
  step: ".01",
  required: true,
});
export const methods = ["CASH", "BKASH", "NAGAD", "CARD", "BANK"].map((v) => ({
  value: v,
  label: v,
}));
export const minorAmount = (value: number) => Math.round(value * 100);
