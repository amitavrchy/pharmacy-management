"use client";
import { useState } from "react";
import { Plus, Truck, Clock3, MapPin, Phone } from "lucide-react";
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
import { ResourceState, Tabs, options } from "@/components/operations";
import { formatDate, post, taka } from "@/lib/api";
export default function Fulfillment() {
  const { user, notify } = useApp(),
    [tab, setTab] = useState("deliveries"),
    [action, setAction] = useState(""),
    [selected, setSelected] = useState<any>(null),
    resource = useResource<any[]>(`fulfillment/${tab}`),
    { data: sales } = useResource<any[]>("pos/sales"),
    { data: customers } = useResource<any[]>("customers"),
    { data: rxs } = useResource<any[]>("prescriptions");
  const rows = resource.data || [],
    can = user.role !== "AUDITOR",
    care = ["OWNER", "PHARMACIST"].includes(user.role);
  let fields: Field[] = [],
    title = "",
    route = "";
  if (action === "delivery") {
    title = "Arrange delivery";
    route = "fulfillment/deliveries";
    fields = [
      {
        name: "saleId",
        label: "Completed receipt",
        options: options(
          (sales || []).filter((s) => s.status === "COMPLETED"),
          (s) =>
            `#${s.id.slice(-7)} · ${s.customerName || "Walk-in"} · ${taka(s.totalMinor)}`,
        ),
        required: true,
      },
      { name: "recipient", label: "Recipient name", required: true },
      { name: "phone", label: "Recipient phone", required: true },
      {
        name: "address",
        label: "Delivery address",
        type: "textarea",
        required: true,
      },
      { name: "note", label: "Handling / delivery notes" },
    ];
  }
  if (action === "reminder") {
    title = "Schedule refill follow-up";
    route = "fulfillment/reminders";
    fields = [
      {
        name: "customerId",
        label: "Customer with contact consent",
        options: options(
          (customers || []).filter((c) => c.contactConsent),
          (c) => `${c.name} · ${c.phone || "No phone"}`,
        ),
        required: true,
      },
      {
        name: "prescriptionId",
        label: "Linked prescription (optional)",
        options: options(rxs, (r) => `${r.rxNumber} · ${r.patientName}`),
      },
      {
        name: "dueDate",
        label: "Follow-up date",
        type: "date",
        required: true,
      },
      {
        name: "note",
        label: "Follow-up purpose / authorization note",
        required: true,
      },
    ];
  }
  if (action === "deliveryStatus") {
    title = `Update delivery · #${selected.saleId.slice(-7)}`;
    route = `fulfillment/deliveries/${selected.id}/status`;
    const next: Record<string, string[]> = {
      QUEUED: ["ASSIGNED"],
      ASSIGNED: ["OUT_FOR_DELIVERY", "QUEUED"],
      OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"],
      FAILED: ["QUEUED"],
    };
    fields = [
      {
        name: "status",
        label: "Next delivery status",
        options: (next[selected.status] || []).map((v) => ({
          value: v,
          label: v.replaceAll("_", " "),
        })),
        required: true,
      },
      {
        name: "courier",
        label: "Courier name (required when assigning)",
        defaultValue: selected.courier || "",
      },
      {
        name: "proof",
        label: "Recipient name / proof reference (required on delivery)",
      },
      { name: "note", label: "Delivery note" },
    ];
  }
  if (action === "reminderStatus") {
    title = "Record follow-up outcome";
    route = `fulfillment/reminders/${selected.id}/status`;
    fields = [
      {
        name: "status",
        label: "Outcome",
        options: ["CONTACTED", "COMPLETED", "CANCELLED"]
          .filter((s) => s !== selected.status)
          .map((v) => ({ value: v, label: v })),
        required: true,
      },
      {
        name: "note",
        label: "Contact outcome / pharmacist note",
        required: true,
      },
    ];
  }
  return (
    <>
      <PageHeader
        eyebrow="CARE DOESN’T END AT THE COUNTER"
        title="Delivery & follow-up"
        description="A traceable handoff from receipt to doorstep, with consent-based refill follow-ups."
        actions={
          <>
            {tab === "deliveries" && can && (
              <Button onClick={() => setAction("delivery")}>
                <Plus size={18} />
                Arrange delivery
              </Button>
            )}
            {tab === "reminders" && care && (
              <Button onClick={() => setAction("reminder")}>
                <Plus size={18} />
                Schedule follow-up
              </Button>
            )}
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          ["deliveries", "Delivery board"],
          ...(care || user.role === "AUDITOR"
            ? [["reminders", "Refill follow-ups"] as [string, string]]
            : []),
        ]}
      />
      <ResourceState resource={resource}>
        {tab === "deliveries" ? (
          <div className="delivery-board">
            {[
              "QUEUED",
              "ASSIGNED",
              "OUT_FOR_DELIVERY",
              "DELIVERED",
              "FAILED",
            ].map((status) => (
              <section className="delivery-column" key={status}>
                <div className="delivery-column-heading">
                  <strong>{status.replaceAll("_", " ")}</strong>
                  <span>{rows.filter((r) => r.status === status).length}</span>
                </div>
                {rows
                  .filter((r) => r.status === status)
                  .map((d) => (
                    <article className="delivery-card" key={d.id}>
                      <span className="eyebrow">
                        #{d.saleId.slice(-7).toUpperCase()}
                      </span>
                      <h3>{d.recipient}</h3>
                      <p>
                        <MapPin size={15} />
                        {d.address}
                      </p>
                      <p>
                        <Phone size={15} />
                        {d.phone}
                      </p>
                      {d.courier && (
                        <p>
                          <Truck size={15} />
                          {d.courier}
                        </p>
                      )}
                      {d.proof && (
                        <div className="inline-note">Proof: {d.proof}</div>
                      )}
                      {can && d.status !== "DELIVERED" && (
                        <Button
                          variant="secondary small"
                          onClick={() => {
                            setSelected(d);
                            setAction("deliveryStatus");
                          }}
                        >
                          Update handoff
                        </Button>
                      )}
                    </article>
                  ))}
              </section>
            ))}
          </div>
        ) : (
          <section className="panel">
            {rows.length ? (
              <Table
                headers={[
                  "Customer",
                  "Due date",
                  "Status",
                  "Follow-up note",
                  "",
                ]}
              >
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.customer?.name}</strong>
                      <small>{r.customer?.phone || "No phone"}</small>
                    </td>
                    <td className={r.overdue ? "text-red" : ""}>
                      {formatDate(r.dueDate)}
                      {r.overdue && <small>Overdue</small>}
                    </td>
                    <td>
                      <Badge>{r.status}</Badge>
                    </td>
                    <td style={{ whiteSpace: "normal", maxWidth: 300 }}>
                      {r.note}
                    </td>
                    <td>
                      {care &&
                        ["SCHEDULED", "CONTACTED"].includes(r.status) && (
                          <Button
                            variant="secondary small"
                            onClick={() => {
                              setSelected(r);
                              setAction("reminderStatus");
                            }}
                          >
                            Record outcome
                          </Button>
                        )}
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty
                title="Follow up at the right time"
                description="Track manual, consented refill calls and their outcomes. No automatic messages are sent."
              />
            )}
          </section>
        )}
      </ResourceState>
      {action && (
        <Modal
          title={title}
          description={
            action === "delivery"
              ? "Arrange after completing a receipt. Payment has already been recorded at POS."
              : undefined
          }
          onClose={() => setAction("")}
        >
          <Form
            fields={fields}
            onSubmit={async (v) => {
              await post(route, v);
              setAction("");
              resource.reload();
              notify("Fulfillment record saved");
            }}
          />
        </Modal>
      )}
    </>
  );
}
