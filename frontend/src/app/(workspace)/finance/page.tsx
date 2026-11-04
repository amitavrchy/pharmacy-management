"use client";
import { useState, useEffect, useRef } from "react";
import {
  Plus,
  Wallet,
  ReceiptText,
  ArrowDownUp,
  LockKeyhole,
} from "lucide-react";
import { useResource } from "@/lib/use-resource";
import { useApp } from "@/components/providers";
import {
  Badge,
  Button,
  Empty,
  Field,
  Form,
  Modal,
  PageHeader,
  Table,
} from "@/components/ui";
import {
  Metrics,
  ResourceState,
  Tabs,
  amountField,
  methods,
  minorAmount,
  options,
} from "@/components/operations";
import { formatDate, post, taka } from "@/lib/api";
export default function Finance() {
  const { user, notify } = useApp(),
    [tab, setTab] = useState("shifts"),
    [action, setAction] = useState(""),
    [selected, setSelected] = useState<any>(null);
  const reference = useRef(crypto.randomUUID());
  useEffect(() => {
    if (action) reference.current = crypto.randomUUID();
  }, [action, selected?.id]);
  const path =
      tab === "shifts"
        ? "finance/shifts"
        : tab === "bills"
          ? "finance/bills"
          : "finance/expenses",
    resource = useResource<any[]>(path),
    { data: availableShifts } = useResource<any[]>("finance/shifts"),
    { data: suppliers } = useResource<any[]>(
      user.role === "CASHIER" ? "finance/shifts" : "purchasing/suppliers",
    ),
    { data: orders } = useResource<any[]>(
      user.role === "CASHIER" ? "finance/shifts" : "purchasing/orders",
    );
  const rows = resource.data || [],
    owner = user.role === "OWNER",
    cashier = ["OWNER", "CASHIER"].includes(user.role);
  let fields: Field[] = [],
    title = "",
    submit = "Save";
  let route = "";
  if (action === "open") {
    title = "Open register shift";
    route = "finance/shifts";
    fields = [
      { name: "registerName", label: "Register name", required: true },
      { ...amountField("Opening cash float (৳)", "opening"), min: 0 },
    ];
  }
  if (action === "close") {
    title = `Close ${selected.registerName}`;
    route = `finance/shifts/${selected.id}/close`;
    fields = [
      { ...amountField("Counted cash (৳)", "counted"), min: 0 },
      {
        name: "note",
        label: "Closing note / variance explanation",
        required: true,
      },
    ];
    submit = "Reconcile & close";
  }
  if (action === "cash") {
    title = "Cash drawer movement";
    route = `finance/shifts/${selected.id}/movements`;
    fields = [
      {
        name: "kind",
        label: "Movement",
        required: true,
        options: [
          { value: "CASH_IN", label: "Cash in" },
          { value: "CASH_OUT", label: "Cash out" },
        ],
      },
      amountField(),
      { name: "note", label: "Reason", required: true },
    ];
  }
  if (action === "bill") {
    title = "Record supplier invoice";
    route = "finance/bills";
    fields = [
      {
        name: "supplierId",
        label: "Supplier",
        options: options(suppliers, (s) => s.name),
        required: true,
      },
      {
        name: "poId",
        label: "Received purchase order (optional)",
        options: options(
          (orders || []).filter((o) =>
            ["RECEIVED", "PARTIAL"].includes(o.status),
          ),
          (o) => `${o.supplier.name} · #${o.id.slice(-7)}`,
        ),
      },
      {
        name: "invoiceNumber",
        label: "Supplier invoice number",
        required: true,
      },
      amountField("Invoice total (৳)", "total"),
      {
        name: "dueDate",
        label: "Payment due date",
        type: "date",
        required: true,
      },
      { name: "note", label: "Notes" },
    ];
  }
  if (action === "pay") {
    title = `Pay ${selected.supplier?.name || "supplier"}`;
    route = `finance/bills/${selected.id}/payments`;
    fields = [
      amountField(),
      {
        name: "method",
        label: "Payment method",
        options: methods,
        required: true,
      },
      { name: "note", label: "Payment reference / note", required: true },
      {
        name: "shiftId",
        label: "Cash drawer (optional for cash payment)",
        options: options(
          (availableShifts || []).filter((s) => s.status === "OPEN"),
          (s) => s.registerName,
        ),
      },
    ];
  }
  if (action === "expense") {
    title = "Record operating expense";
    route = "finance/expenses";
    fields = [
      {
        name: "category",
        label: "Category",
        options: [
          "RENT",
          "UTILITIES",
          "SALARY",
          "TRANSPORT",
          "MAINTENANCE",
          "OTHER",
        ].map((v) => ({ value: v, label: v })),
        required: true,
      },
      amountField(),
      {
        name: "method",
        label: "Payment method",
        options: methods,
        required: true,
      },
      { name: "note", label: "Expense description", required: true },
      {
        name: "shiftId",
        label: "Cash drawer (optional for cash expense)",
        options: options(
          (availableShifts || []).filter((s) => s.status === "OPEN"),
          (s) => s.registerName,
        ),
      },
    ];
  }
  return (
    <>
      <PageHeader
        eyebrow="CONTROL THE MONEY, CLOSE WITH CONFIDENCE"
        title="Finance & registers"
        description="Reconcile shifts, collect dues, track supplier invoices and understand operating expenses."
        actions={
          <>
            {cashier && tab === "shifts" && (
              <Button onClick={() => setAction("open")}>
                <Plus size={17} />
                Open shift
              </Button>
            )}
            {owner && tab === "bills" && (
              <Button onClick={() => setAction("bill")}>
                <Plus size={17} />
                Supplier invoice
              </Button>
            )}
            {owner && tab === "expenses" && (
              <Button onClick={() => setAction("expense")}>
                <Plus size={17} />
                Record expense
              </Button>
            )}
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          ["shifts", "Register shifts"],
          ...(user.role !== "CASHIER"
            ? [["bills", "Supplier payables"] as [string, string]]
            : []),
          ...(owner || user.role === "AUDITOR"
            ? [["expenses", "Operating expenses"] as [string, string]]
            : []),
        ]}
      />
      <ResourceState resource={resource}>
        {tab === "shifts" ? (
          <>
            <Metrics
              items={[
                {
                  label: "Open registers",
                  value: rows.filter((s) => s.status === "OPEN").length,
                  hint: "Currently taking transactions",
                },
                {
                  label: "Cash expected in open shifts",
                  value: taka(
                    rows
                      .filter((s) => s.status === "OPEN")
                      .reduce((v, s) => v + s.expected, 0),
                  ),
                  hint: "Float + cash sales + in − out",
                },
                {
                  label: "Closed shift variance",
                  value: taka(
                    rows
                      .filter((s) => s.status === "CLOSED")
                      .reduce((v, s) => v + (s.varianceMinor || 0), 0),
                  ),
                  hint: "Counted minus expected cash",
                  tone: "amber",
                },
                {
                  label: "Cash sales recorded",
                  value: taka(rows.reduce((v, s) => v + s.cashSales, 0)),
                  hint: "Linked POS transactions",
                },
              ]}
            />
            <div className="operation-card-grid">
              {rows.map((s) => (
                <section className="panel shift-card" key={s.id}>
                  <div className="panel-header">
                    <div className="row">
                      <span className="product-icon">
                        <Wallet size={22} />
                      </span>
                      <div>
                        <h2>{s.registerName}</h2>
                        <p>{formatDate(s.openedAt)}</p>
                      </div>
                    </div>
                    <Badge>{s.status}</Badge>
                  </div>
                  <div className="panel-body">
                    <div className="drawer-amount">
                      <small>EXPECTED CASH</small>
                      <strong>
                        {taka(
                          s.status === "CLOSED" ? s.expectedMinor : s.expected,
                        )}
                      </strong>
                    </div>
                    <div className="detail-grid">
                      <span>
                        Opening float<strong>{taka(s.openingMinor)}</strong>
                      </span>
                      <span>
                        Cash sales<strong>{taka(s.cashSales)}</strong>
                      </span>
                      <span>
                        Cash in<strong>{taka(s.cashIn)}</strong>
                      </span>
                      <span>
                        Cash out<strong>{taka(s.cashOut)}</strong>
                      </span>
                    </div>
                    {s.status === "CLOSED" ? (
                      <div className="inline-note mt">
                        Counted {taka(s.countedMinor)} · Variance{" "}
                        {taka(s.varianceMinor)}
                        <br />
                        {s.closingNote}
                      </div>
                    ) : (
                      cashier && (
                        <div className="row mt">
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setSelected(s);
                              setAction("cash");
                            }}
                          >
                            <ArrowDownUp size={16} />
                            Cash movement
                          </Button>
                          <Button
                            onClick={() => {
                              setSelected(s);
                              setAction("close");
                            }}
                          >
                            <LockKeyhole size={16} />
                            Close shift
                          </Button>
                        </div>
                      )
                    )}
                    <details className="mt">
                      <summary>
                        Drawer movement history ({s.movements.length})
                      </summary>
                      {s.movements.map((m: any) => (
                        <div className="row space-between mt" key={m.id}>
                          <span>
                            {m.kind}
                            <small className="muted"> · {m.note}</small>
                          </span>
                          <strong>{taka(m.amountMinor)}</strong>
                        </div>
                      ))}
                    </details>
                  </div>
                </section>
              ))}
            </div>
            {!rows.length && (
              <section className="panel">
                <Empty
                  title="Open your first register shift"
                  description="Attach a shift at POS to reconcile cash automatically."
                />
              </section>
            )}
          </>
        ) : (
          <section className="panel">
            {rows.length ? (
              <Table
                headers={
                  tab === "bills"
                    ? [
                        "Invoice / supplier",
                        "Due date",
                        "Total",
                        "Outstanding",
                        "Status",
                        "",
                      ]
                    : ["Category", "Description", "Amount", "Payment", "Date"]
                }
              >
                {rows.map((row) =>
                  tab === "bills" ? (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.invoiceNumber}</strong>
                        <small>{row.supplier?.name}</small>
                      </td>
                      <td className={row.overdue ? "text-red" : ""}>
                        {formatDate(row.dueDate)}
                        {row.overdue && <small>Overdue</small>}
                      </td>
                      <td>{taka(row.totalMinor)}</td>
                      <td>
                        <strong>{taka(row.outstandingMinor)}</strong>
                        <small>{row.payments.length} payments recorded</small>
                      </td>
                      <td>
                        <Badge>{row.status}</Badge>
                      </td>
                      <td>
                        {owner && row.outstandingMinor > 0 && (
                          <Button
                            variant="secondary small"
                            onClick={() => {
                              setSelected(row);
                              setAction("pay");
                            }}
                          >
                            Record payment
                          </Button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.id}>
                      <td>
                        <Badge tone="blue">{row.category}</Badge>
                      </td>
                      <td>{row.note}</td>
                      <td>
                        <strong>{taka(row.amountMinor)}</strong>
                      </td>
                      <td>{row.method}</td>
                      <td>{formatDate(row.createdAt)}</td>
                    </tr>
                  ),
                )}
              </Table>
            ) : (
              <Empty
                title={
                  tab === "bills"
                    ? "No supplier invoices recorded"
                    : "No operating expenses recorded"
                }
              />
            )}
          </section>
        )}
      </ResourceState>
      {action && (
        <Modal
          title={title}
          description={
            action === "close"
              ? `Expected cash: ${taka(selected.expected)}. Count the drawer before closing.`
              : action === "pay"
                ? `Outstanding ${taka(selected.outstandingMinor)}. Record after making the payment.`
                : undefined
          }
          onClose={() => setAction("")}
        >
          <Form
            fields={fields}
            submit={submit}
            onSubmit={async (v) => {
              const { opening, counted, amount, total, ...rest } = v;
              const payload = {
                ...rest,
                ...(opening !== undefined
                  ? { openingMinor: minorAmount(opening) }
                  : {}),
                ...(counted !== undefined
                  ? { countedMinor: minorAmount(counted) }
                  : {}),
                ...(amount !== undefined
                  ? {
                      amountMinor: minorAmount(amount),
                      reference: reference.current,
                    }
                  : {}),
                ...(total !== undefined
                  ? { totalMinor: minorAmount(total) }
                  : {}),
              };
              await post(route, payload);
              setAction("");
              resource.reload();
              notify("Financial record saved");
            }}
          />
        </Modal>
      )}
    </>
  );
}
