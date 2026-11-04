"use client";
import { useState } from "react";
import {
  Download,
  ShoppingBag,
  TrendingUp,
  ArrowUpRight,
  Check,
} from "lucide-react";
import { useResource } from "@/lib/use-resource";
import { useApp } from "@/components/providers";
import {
  Badge,
  Button,
  Empty,
  Form,
  Modal,
  PageHeader,
  SearchBox,
  Table,
} from "@/components/ui";
import { Metrics, ResourceState, Tabs, options } from "@/components/operations";
import { downloadCSV, number, post, taka } from "@/lib/api";
export default function Intelligence() {
  const { user, notify } = useApp(),
    [tab, setTab] = useState("forecast"),
    [target, setTarget] = useState(30),
    [lead, setLead] = useState(7),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [selected, setSelected] = useState<string[]>([]),
    [modal, setModal] = useState(false);
  const resource = useResource<any[]>(
      `intelligence/replenishment?targetDays=${target}&leadDays=${lead}`,
    ),
    summary = useResource("intelligence/summary"),
    { data: suppliers } = useResource<any[]>("purchasing/suppliers"),
    rows = (resource.data || []).filter(
      (r) =>
        `${r.brandName} ${r.generic}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter === "ALL" ||
          (filter === "REORDER" && r.suggestedQty > 0) ||
          filter === r.abc ||
          filter === r.fsn),
    ),
    canOrder = ["OWNER", "STORE_KEEPER"].includes(user.role),
    canFinance = ["OWNER", "AUDITOR"].includes(user.role);
  const s = summary.data;
  return (
    <>
      <PageHeader
        eyebrow="SEE THE SIGNAL. TAKE THE NEXT STEP."
        title="Business intelligence"
        description="Transparent demand planning, ABC/FSN analysis and an operational view of your pharmacy."
        actions={
          <Button
            variant="secondary"
            onClick={() => downloadCSV("replenishment-analysis.csv", rows)}
          >
            <Download size={17} />
            Export analysis
          </Button>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          ["forecast", "Demand & replenishment"],
          ["classification", "ABC / FSN analysis"],
          ...(canFinance
            ? [["management", "Management pulse"] as [string, string]]
            : []),
        ]}
      />
      {tab === "management" && canFinance ? (
        <ResourceState resource={summary}>
          {s && (
            <>
              <Metrics
                items={[
                  {
                    label: "Customer receivables",
                    value: taka(s.receivableMinor),
                    hint: "Credit due from registered customers",
                  },
                  {
                    label: "Supplier payables",
                    value: taka(s.payableMinor),
                    hint: `${taka(s.overduePayableMinor)} overdue`,
                    tone: "amber",
                  },
                  {
                    label: "Operating expenses · 30d",
                    value: taka(s.expenses30Minor),
                    hint: "Recorded business operating spend",
                  },
                  {
                    label: "Expiry exposure",
                    value: taka(s.atRiskMinor),
                    hint: "Cost of remaining lots expiring within 90 days",
                    tone: "amber",
                  },
                ]}
              />
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>ABC value distribution</h2>
                      <p>
                        90-day completed sales. A ≈ first 80%, B ≈ next 15%, C =
                        remainder.
                      </p>
                    </div>
                  </div>
                  <div className="panel-body">
                    {s.abc.map((a: any) => (
                      <div className="abc-row" key={a.class}>
                        <span className="abc-class">{a.class}</span>
                        <div>
                          <strong>{a.count} medicines</strong>
                          <div className="abc-track">
                            <i
                              style={{
                                width: `${Math.max(
                                  1,
                                  (a.revenue /
                                    Math.max(
                                      1,
                                      s.abc.reduce(
                                        (v: number, x: any) => v + x.revenue,
                                        0,
                                      ),
                                    )) *
                                    100,
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                        <strong>{taka(a.revenue)}</strong>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-header">
                    <h2>Operational signals</h2>
                  </div>
                  <div className="panel-body stack">
                    {[
                      [
                        "No sales in 90 days",
                        `${s.deadStockCount} stocked medicines`,
                      ],
                      [
                        "Suggested replenishment",
                        taka(s.suggestedPurchaseMinor),
                      ],
                      [
                        "Transfers in transit",
                        `${s.transfersInTransit} shipments`,
                      ],
                      ["Recent drawer variance", taka(s.shiftVarianceMinor)],
                    ].map(([l, v]) => (
                      <div className="row space-between" key={l}>
                        <span className="muted">{l}</span>
                        <strong>{v}</strong>
                      </div>
                    ))}
                    <div className="inline-note">
                      Planning estimates use recorded sales, not clinical demand
                      or guaranteed future sales.
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}
        </ResourceState>
      ) : (
        <ResourceState resource={resource}>
          <Metrics
            items={[
              {
                label: "Medicines needing reorder",
                value: (resource.data || []).filter((r) => r.suggestedQty > 0)
                  .length,
                hint: "Pack-rounded recommendations",
              },
              {
                label: "Proposed purchase cost",
                value: taka(
                  (resource.data || []).reduce(
                    (v, r) => v + r.estimatedCostMinor,
                    0,
                  ),
                ),
                hint: "Based on recorded batch unit costs",
              },
              {
                label: "Fast-moving SKUs",
                value: (resource.data || []).filter((r) => r.fsn === "FAST")
                  .length,
                hint: "Last completed sale within 30 days",
              },
              {
                label: "Non-moving stocked SKUs",
                value: (resource.data || []).filter(
                  (r) => r.fsn === "NON_MOVING" && r.stock > 0,
                ).length,
                hint: "No completed sale in the last 90 days",
                tone: "amber",
              },
            ]}
          />
          <div className="inline-note">
            Recommendation = max(reorder floor, 30-day daily usage × target +
            lead days) − usable stock, rounded up to whole packs. Review
            supplier cost and quantities before placing the draft.
          </div>
          <section className="panel">
            <div className="toolbar">
              <SearchBox
                value={query}
                onChange={setQuery}
                placeholder="Find a brand or generic…"
              />
              <select
                className="filter-select"
                aria-label="Analysis filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {[
                  ["ALL", "All medicines"],
                  ["REORDER", "Reorder needed"],
                  ["A", "ABC · A"],
                  ["B", "ABC · B"],
                  ["C", "ABC · C"],
                  ["FAST", "Fast moving"],
                  ["SLOW", "Slow moving"],
                  ["NON_MOVING", "Non moving"],
                ].map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
              {tab === "forecast" && (
                <>
                  <label className="planning-input">
                    Target days
                    <input
                      type="number"
                      min={7}
                      max={180}
                      value={target}
                      onChange={(e) =>
                        setTarget(
                          Math.max(
                            7,
                            Math.min(180, Number(e.target.value) || 7),
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="planning-input">
                    Lead days
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={lead}
                      onChange={(e) =>
                        setLead(
                          Math.min(
                            60,
                            Math.max(0, Number(e.target.value) || 0),
                          ),
                        )
                      }
                    />
                  </label>
                </>
              )}
            </div>
            {rows.length ? (
              <Table
                headers={
                  tab === "forecast"
                    ? [
                        "Select",
                        "Medicine",
                        "Usable stock",
                        "Daily demand",
                        "Days cover",
                        "Suggested units",
                        "Estimate",
                      ]
                    : [
                        "Medicine",
                        "ABC class",
                        "Movement",
                        "90-day revenue",
                        "30-day units",
                        "Expiry exposure",
                      ]
                }
              >
                {rows.map((r) =>
                  tab === "forecast" ? (
                    <tr key={r.medicineId}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.brandName}`}
                          checked={selected.includes(r.medicineId)}
                          disabled={!r.suggestedQty}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, r.medicineId]
                                : selected.filter((id) => id !== r.medicineId),
                            )
                          }
                        />
                      </td>
                      <td>
                        <strong>{r.brandName}</strong>
                        <small>
                          {r.generic} · {r.packSize} / pack
                        </small>
                      </td>
                      <td>{number(r.stock)}</td>
                      <td>{number(r.dailyUsage)}</td>
                      <td>
                        {r.daysCover === null
                          ? "No history"
                          : `${number(r.daysCover)} days`}
                      </td>
                      <td>
                        <strong className={r.suggestedQty ? "text-amber" : ""}>
                          {number(r.suggestedQty)}
                        </strong>
                      </td>
                      <td>{taka(r.estimatedCostMinor)}</td>
                    </tr>
                  ) : (
                    <tr key={r.medicineId}>
                      <td>
                        <strong>{r.brandName}</strong>
                        <small>{r.generic}</small>
                      </td>
                      <td>
                        <Badge
                          tone={
                            r.abc === "A"
                              ? "green"
                              : r.abc === "B"
                                ? "blue"
                                : "amber"
                          }
                        >
                          {r.abc}
                        </Badge>
                      </td>
                      <td>
                        <Badge
                          tone={
                            r.fsn === "FAST"
                              ? "green"
                              : r.fsn === "SLOW"
                                ? "amber"
                                : "red"
                          }
                        >
                          {r.fsn}
                        </Badge>
                      </td>
                      <td>{taka(r.revenue90)}</td>
                      <td>{number(r.units30)}</td>
                      <td>{taka(r.expiryAtRiskMinor)}</td>
                    </tr>
                  ),
                )}
              </Table>
            ) : (
              <Empty title="No medicines match this view" />
            )}
            {tab === "forecast" && canOrder && (
              <div className="table-footer">
                <div className="row">
                  <Button
                    variant="ghost small"
                    onClick={() =>
                      setSelected(
                        rows
                          .filter((r) => r.suggestedQty > 0)
                          .map((r) => r.medicineId),
                      )
                    }
                  >
                    Select all recommendations
                  </Button>
                  <span>{selected.length} selected</span>
                </div>
                <Button
                  disabled={!selected.length}
                  onClick={() => setModal(true)}
                >
                  <ShoppingBag size={17} />
                  Create purchase draft
                </Button>
              </div>
            )}
          </section>
        </ResourceState>
      )}
      {modal && (
        <Modal
          title="Create demand-based purchase draft"
          description={`${selected.length} selected medicines. Server recalculates recommendations before creating the order.`}
          onClose={() => setModal(false)}
        >
          <Form
            fields={[
              {
                name: "supplierId",
                label: "Supplier",
                options: options(suppliers, (s) => s.name),
                required: true,
              },
            ]}
            submit="Create draft for review"
            onSubmit={async (v) => {
              await post("intelligence/replenishment/orders", {
                ...v,
                targetDays: target,
                leadDays: lead,
                medicineIds: selected,
              });
              setModal(false);
              setSelected([]);
              notify(
                "Forecast-based purchase draft created. Review it in Purchasing.",
              );
            }}
          />
        </Modal>
      )}
    </>
  );
}
