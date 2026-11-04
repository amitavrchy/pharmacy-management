"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Plus,
  Wallet,
  ShoppingBag,
  Package,
  Clock3,
  TriangleAlert,
  FileHeart,
  ChevronRight,
  Leaf,
  Pill,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import {
  PageHeader,
  Loading,
  ErrorState,
  Badge,
  Table,
  Empty,
} from "@/components/ui";
import { useApp } from "@/components/providers";
import { useResource } from "@/lib/use-resource";
import { taka, formatDate, number } from "@/lib/api";
import { SalesChart } from "@/components/sales-chart";
export default function Dashboard() {
  const { user } = useApp(),
    { data: d, error, loading, reload } = useResource("reports/dashboard");
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  return (
    <>
      <PageHeader
        eyebrow="YOUR PHARMACY, AT A GLANCE"
        title={`Good to see you, ${user?.name.split(" ")[0]}.`}
        description="A clear view of your pharmacy. A confident start to your day."
        actions={
          <>
            <span className="date-chip">
              <CalendarDays size={17} />
              {formatDate(new Date().toISOString())}
            </span>
            {["OWNER", "PHARMACIST", "CASHIER"].includes(user?.role) && (
              <Link className="btn" href="/pos">
                <Plus size={18} />
                New sale
              </Link>
            )}
          </>
        }
      />
      <div className="stats-grid">
        {[
          {
            label: "Today’s revenue",
            value: taka(d.todayRevenue),
            icon: Wallet,
            note: "Completed sales today",
            tone: "",
          },
          {
            label: "Sales completed",
            value: number(d.todaySales),
            icon: ShoppingBag,
            note: "Care delivered, one sale at a time",
            tone: "blue",
          },
          {
            label: "Medicines in catalog",
            value: number(d.activeMedicines),
            icon: Package,
            note: `${d.lowStock} items need restocking`,
            tone: "",
          },
          {
            label: "Expiring in 90 days",
            value: number(d.nearExpiry),
            icon: Clock3,
            note: "Batches to keep an eye on",
            tone: "amber",
          },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-top">
              <span>{s.label}</span>
              <span className={`stat-icon ${s.tone}`}>
                <s.icon size={19} />
              </span>
            </div>
            <div className="stat-value mono">{s.value}</div>
            <div className="stat-bottom">
              <span>{s.note}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Sales overview</h2>
              <p>A little perspective on your week.</p>
            </div>
            <span className="date-chip">
              Last 7 days <CalendarDays size={15} />
            </span>
          </div>
          <div className="panel-body">
            <div className="row space-between">
              <div className="chart-summary">
                <strong>
                  {taka(
                    d.week.reduce(
                      (s: number, x: any) => s + x.revenue * 100,
                      0,
                    ),
                  )}
                </strong>
                <span>this week</span>
              </div>
              <span className="legend">
                <i />
                Revenue
              </span>
            </div>
            <SalesChart data={d.week} />
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Needs your attention</h2>
              <p>A few things to keep care moving.</p>
            </div>
            <span className="badge amber">
              {d.lowStock + d.nearExpiry + d.pendingRx}
            </span>
          </div>
          <div className="panel-body">
            {[
              {
                title: "Low stock medicines",
                desc: "Time to top up your shelves",
                count: d.lowStock,
                icon: TriangleAlert,
                tone: "",
                href: "/inventory?filter=low",
              },
              {
                title: "Near-expiry batches",
                desc: "Prioritize these for dispensing",
                count: d.nearExpiry,
                icon: Clock3,
                tone: "red",
                href: "/inventory?filter=expiry",
              },
              {
                title: "Prescriptions to verify",
                desc: "Waiting for a pharmacist’s review",
                count: d.pendingRx,
                icon: FileHeart,
                tone: "blue",
                href: "/prescriptions",
              },
            ].map((a) => (
              <Link href={a.href} key={a.title} className="attention-item">
                <span className={`attention-icon ${a.tone}`}>
                  <a.icon size={20} />
                </span>
                <div>
                  <strong>{a.title}</strong>
                  <p>{a.desc}</p>
                </div>
                <span className="attention-count">{a.count}</span>
                <ChevronRight size={15} color="#acb8ae" />
              </Link>
            ))}
            <Link href="/alerts" className="link-text mt">
              View all alerts <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Recent transactions</h2>
              <p>The latest care across your counter.</p>
            </div>
            <Link href="/pos?history=1" className="link-text">
              View all <ArrowUpRight size={16} />
            </Link>
          </div>
          {d.recent.length ? (
            <Table headers={["Receipt / customer", "Items", "Total", "Status"]}>
              {d.recent.map((s: any) => (
                <tr key={s.id}>
                  <td>
                    <strong>#{s.id.slice(-7).toUpperCase()}</strong>
                    <small>{s.customerName || "Walk-in customer"}</small>
                  </td>
                  <td>{s.lines.length} items</td>
                  <td className="mono">
                    <strong>{taka(s.totalMinor)}</strong>
                  </td>
                  <td>
                    <Badge>{s.status}</Badge>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty
              title="Ready for your first sale"
              description="Completed transactions will appear here."
              action={
                <Link href="/pos" className="link-text">
                  Open point of sale <ArrowRight size={16} />
                </Link>
              }
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Quick actions</h2>
              <p>Less searching. More doing.</p>
            </div>
          </div>
          <div className="panel-body">
            {[
              {
                label: "Find a medicine",
                desc: "Search brands and generics",
                href: "/catalog",
                icon: Pill,
              },
              {
                label: "Review prescriptions",
                desc: "Verify and dispense with care",
                href: "/prescriptions",
                icon: FileHeart,
              },
              {
                label: "Check inventory",
                desc: "Track every batch and expiry",
                href: "/inventory",
                icon: ShieldCheck,
              },
            ].map((a) => (
              <Link className="attention-item" href={a.href} key={a.href}>
                <span className="product-icon">
                  <a.icon size={19} />
                </span>
                <div>
                  <strong>{a.label}</strong>
                  <p>{a.desc}</p>
                </div>
                <ArrowUpRight size={17} color="#8a9c8d" />
              </Link>
            ))}
          </div>
        </section>
      </div>
      <div className="care-banner">
        <Leaf size={35} strokeWidth={1.3} />
        <div>
          <strong>Better stock. Less waste. More care.</strong>
          <p>
            Medora automatically prioritizes the earliest-expiring batches with
            FEFO dispensing.
          </p>
        </div>
        <Link href="/inventory" className="btn secondary">
          Review inventory <ArrowUpRight size={17} />
        </Link>
      </div>
    </>
  );
}
