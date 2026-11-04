"use client";
import { useState, useEffect, useRef } from "react";
import {
  Plus,
  UsersRound,
  Wallet,
  Download,
  FileText,
  Edit3,
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
  SearchBox,
  Table,
} from "@/components/ui";
import {
  Metrics,
  ResourceState,
  amountField,
  methods,
  minorAmount,
  options,
} from "@/components/operations";
import {
  api,
  downloadCSV,
  formatDate,
  number,
  patch,
  post,
  taka,
} from "@/lib/api";
export default function Customers() {
  const { user, notify } = useApp(),
    resource = useResource<any[]>("customers"),
    { data: shifts } = useResource<any[]>(
      ["OWNER", "CASHIER"].includes(user.role) ? "finance/shifts" : "customers",
    );
  const [query, setQuery] = useState(""),
    [action, setAction] = useState(""),
    [selected, setSelected] = useState<any>(null),
    [statement, setStatement] = useState<any>(null);
  const reference = useRef(crypto.randomUUID());
  useEffect(() => {
    if (action) reference.current = crypto.randomUUID();
  }, [action, selected?.id]);
  const customers = resource.data || [],
    rows = customers.filter((c) =>
      `${c.name} ${c.phone} ${c.email}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
    canEdit = ["OWNER", "PHARMACIST"].includes(user.role),
    canCollect = ["OWNER", "CASHIER"].includes(user.role);
  const profileFields: Field[] = [
    {
      name: "name",
      label: "Full name",
      required: true,
      defaultValue: selected?.name,
    },
    { name: "phone", label: "Phone", defaultValue: selected?.phone },
    {
      name: "email",
      label: "Email",
      type: "email",
      defaultValue: selected?.email,
    },
    { name: "address", label: "Address", defaultValue: selected?.address },
    {
      name: "contactConsent",
      label: "Customer consents to refill follow-up",
      type: "checkbox",
      defaultValue: selected?.contactConsent ? 1 : 0,
    },
    ...(user.role === "OWNER"
      ? [
          {
            name: "limit",
            label: "Credit limit (৳)",
            type: "number",
            min: 0,
            step: ".01",
            defaultValue: (selected?.creditLimitMinor || 0) / 100,
          },
        ]
      : []),
    ...(canEdit
      ? [
          {
            name: "allergiesText",
            label: "Recorded allergies (comma separated)",
            defaultValue: selected?.allergies?.join(", "),
          },
          {
            name: "conditionsText",
            label: "Recorded conditions (comma separated)",
            defaultValue: selected?.conditions?.join(", "),
          },
        ]
      : []),
  ];
  async function showStatement(c: any) {
    try {
      setStatement(await api(`customers/${c.id}/statement`));
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="RELATIONSHIPS, BEYOND THE RECEIPT"
        title="Customers & accounts"
        description="Patient context, purchase history, credit control and every collection in one place."
        actions={
          user.role !== "AUDITOR" && (
            <Button
              onClick={() => {
                setSelected(null);
                setAction("profile");
              }}
            >
              <Plus size={18} />
              Add customer
            </Button>
          )
        }
      />
      <Metrics
        items={[
          {
            label: "Registered customers",
            value: number(customers.length),
            hint: "A shared customer directory",
          },
          {
            label: "Outstanding receivables",
            value: taka(
              customers.reduce((s, c) => s + Math.max(0, c.balanceMinor), 0),
            ),
            hint: "Live credit ledger balance",
            tone: "amber",
          },
          {
            label: "Loyalty points earned",
            value: number(customers.reduce((s, c) => s + c.loyaltyPoints, 0)),
            hint: "1 point per ৳100 on completed sales",
          },
          {
            label: "Consented follow-ups",
            value: number(customers.filter((c) => c.contactConsent).length),
            hint: "Contact permission recorded",
          },
        ]}
      />
      <ResourceState resource={resource}>
        <section className="panel">
          <div className="toolbar">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Search name, phone or email…"
            />
            <Button
              variant="secondary"
              onClick={() =>
                downloadCSV(
                  "customer-accounts.csv",
                  rows.map((c) => ({
                    name: c.name,
                    phone: c.phone,
                    balanceMinor: c.balanceMinor,
                    creditLimitMinor: c.creditLimitMinor,
                    points: c.loyaltyPoints,
                  })),
                )
              }
            >
              <Download size={16} />
              Export accounts
            </Button>
          </div>
          {rows.length ? (
            <Table
              headers={[
                "Customer",
                "Account balance",
                "Credit limit",
                "Loyalty",
                "Follow-up",
                "Actions",
              ]}
            >
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="cell-product">
                      <span className="product-icon">
                        <UsersRound size={18} />
                      </span>
                      <div>
                        <strong>{c.name}</strong>
                        <small>
                          {c.phone || c.email || "Contact not supplied"}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td className={c.balanceMinor > 0 ? "text-amber" : ""}>
                    <strong>{taka(c.balanceMinor)}</strong>
                  </td>
                  <td>{taka(c.creditLimitMinor)}</td>
                  <td>{number(c.loyaltyPoints)} pts</td>
                  <td>
                    <Badge tone={c.contactConsent ? "green" : "amber"}>
                      {c.contactConsent ? "Consented" : "No consent"}
                    </Badge>
                  </td>
                  <td>
                    <div className="actions">
                      <Button
                        variant="ghost small"
                        onClick={() => showStatement(c)}
                      >
                        <FileText size={16} />
                        Statement
                      </Button>
                      {canCollect && c.balanceMinor > 0 && (
                        <Button
                          variant="secondary small"
                          onClick={() => {
                            setSelected(c);
                            setAction("collect");
                          }}
                        >
                          <Wallet size={16} />
                          Collect
                        </Button>
                      )}
                      {canEdit && (
                        <button
                          className="icon-btn"
                          aria-label={`Edit ${c.name}`}
                          onClick={() => {
                            setSelected(c);
                            setAction("profile");
                          }}
                        >
                          <Edit3 size={17} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty
              title="Build a connected customer directory"
              description="Add a customer to link receipts, credit accounts and follow-up preferences."
            />
          )}
        </section>
      </ResourceState>
      {action === "profile" && (
        <Modal
          title={selected ? "Edit customer profile" : "New customer profile"}
          description="Care notes are staff-recorded context. They do not replace a clinical review."
          onClose={() => setAction("")}
        >
          <Form
            fields={profileFields}
            onSubmit={async (v) => {
              const { limit, allergiesText, conditionsText, ...rest } = v;
              const payload = {
                ...rest,
                ...(user.role === "OWNER"
                  ? { creditLimitMinor: minorAmount(limit || 0) }
                  : {}),
                ...(canEdit
                  ? {
                      allergies: (allergiesText || "")
                        .split(",")
                        .map((s: string) => s.trim())
                        .filter(Boolean),
                      conditions: (conditionsText || "")
                        .split(",")
                        .map((s: string) => s.trim())
                        .filter(Boolean),
                    }
                  : {}),
              };
              if (selected) await patch(`customers/${selected.id}`, payload);
              else await post("customers", payload);
              setAction("");
              resource.reload();
              notify("Customer profile saved");
            }}
          />
        </Modal>
      )}
      {action === "collect" && selected && (
        <Modal
          title={`Collect from ${selected.name}`}
          description={`Outstanding: ${taka(selected.balanceMinor)}. Record a payment after receiving it.`}
          onClose={() => setAction("")}
        >
          <Form
            fields={[
              amountField(),
              {
                name: "method",
                label: "Received through",
                options: methods,
                required: true,
              },
              {
                name: "shiftId",
                label: "Cash register shift (cash collection)",
                options: options(
                  (shifts || []).filter((s) => s.status === "OPEN"),
                  (s) => s.registerName,
                ),
              },
              {
                name: "note",
                label: "Payment note / receipt reference",
                required: true,
              },
            ]}
            onSubmit={async (v) => {
              const { amount, ...rest } = v;
              await post(`customers/${selected.id}/payments`, {
                ...rest,
                amountMinor: minorAmount(amount),
                reference: reference.current,
              });
              setAction("");
              resource.reload();
              notify("Collection posted to ledger");
            }}
          />
        </Modal>
      )}
      {statement && (
        <Modal
          title={`${statement.name} · account statement`}
          description={`Balance ${taka(statement.balanceMinor)} · Credit limit ${taka(statement.creditLimitMinor)}`}
          onClose={() => setStatement(null)}
        >
          <h3 className="mb">Ledger movements</h3>
          {statement.ledger.length ? (
            <Table headers={["Date", "Type", "Amount", "Note"]}>
              {statement.ledger.map((l: any) => (
                <tr key={l.id}>
                  <td>{formatDate(l.createdAt)}</td>
                  <td>
                    <Badge>{l.kind}</Badge>
                  </td>
                  <td>{taka(l.amountMinor)}</td>
                  <td style={{ whiteSpace: "normal" }}>{l.note}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title="No credit movements yet" />
          )}
          <h3 className="mt mb">Purchase history</h3>
          {statement.sales.length ? (
            <Table headers={["Receipt", "Items", "Total"]}>
              {statement.sales.map((s: any) => (
                <tr key={s.id}>
                  <td>#{s.id.slice(-7)}</td>
                  <td>
                    {s.lines.map((l: any) => l.medicine.brandName).join(", ")}
                  </td>
                  <td>{taka(s.totalMinor)}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="muted">Linked purchases will appear here.</p>
          )}
        </Modal>
      )}
    </>
  );
}
