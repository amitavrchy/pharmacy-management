"use client";
import { useState } from "react";
import {
  Plus,
  ArrowRightLeft,
  Building2,
  Thermometer,
  ShieldAlert,
  ArrowUpRight,
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
import { Metrics, ResourceState, Tabs, options } from "@/components/operations";
import { post, number, formatDate } from "@/lib/api";
export default function StockControl() {
  const { user, notify } = useApp(),
    [tab, setTab] = useState("locations"),
    [action, setAction] = useState(""),
    [selected, setSelected] = useState<any>(null),
    resource = useResource<any[]>(`stock-control/${tab}`),
    { data: locations, reload: reloadLocations } = useResource<any[]>(
      "stock-control/locations",
    ),
    { data: batches, reload: reloadBatches } = useResource<any[]>("inventory");
  const canMove = ["OWNER", "STORE_KEEPER"].includes(user.role),
    canReview = ["OWNER", "PHARMACIST"].includes(user.role),
    canRead = ["OWNER", "PHARMACIST", "STORE_KEEPER"].includes(user.role),
    rows = resource.data || [];
  let title = "",
    fields: Field[] = [],
    route = "";
  if (action === "location") {
    title = "Create stock location";
    route = "stock-control/locations";
    fields = [
      { name: "name", label: "Location name", required: true },
      {
        name: "code",
        label: "Location code (A–Z, 0–9, underscore)",
        required: true,
      },
      {
        name: "kind",
        label: "Location type",
        options: ["COUNTER", "WAREHOUSE", "COLD_ROOM"].map((v) => ({
          value: v,
          label: v.replaceAll("_", " "),
        })),
        required: true,
      },
      {
        name: "canDispense",
        label: "Allow direct dispensing from this location",
        type: "checkbox",
      },
    ];
  }
  if (action === "transfer") {
    title = "Plan stock transfer";
    route = "stock-control/transfers";
    fields = [
      {
        name: "batchId",
        label: "Source batch",
        options: options(
          (batches || []).filter(
            (b) =>
              b.status === "ACTIVE" && Number(b.qtyOnHand) > 0 && !b.recalled,
          ),
          (b) =>
            `${b.medicine.brandName} · ${b.lotNumber} · ${b.location?.name || "Main"} · ${number(b.qtyOnHand)} units`,
        ),
        required: true,
      },
      {
        name: "destinationId",
        label: "Destination location",
        options: options(
          (locations || []).filter((l) => l.active && !l.quarantined),
          (l) => `${l.name} (${l.code})`,
        ),
        required: true,
      },
      {
        name: "qty",
        label: "Transfer quantity (units)",
        type: "number",
        min: 0.001,
        step: ".001",
        required: true,
      },
      { name: "note", label: "Transfer purpose", required: true },
    ];
  }
  if (action === "sensor") {
    title = "Register temperature monitor";
    route = "stock-control/sensors";
    fields = [
      {
        name: "locationId",
        label: "Monitored location",
        options: options(locations, (l) => l.name),
        required: true,
      },
      {
        name: "name",
        label: "Monitor name / device identifier",
        required: true,
      },
      {
        name: "minC",
        label: "Approved minimum (°C)",
        type: "number",
        min: -80,
        max: 80,
        step: ".01",
        required: true,
      },
      {
        name: "maxC",
        label: "Approved maximum (°C)",
        type: "number",
        min: -80,
        max: 80,
        step: ".01",
        required: true,
      },
    ];
  }
  if (action === "reading") {
    title = `Record ${selected.name}`;
    route = `stock-control/sensors/${selected.id}/readings`;
    fields = [
      {
        name: "valueC",
        label: "Measured temperature (°C)",
        type: "number",
        min: -80,
        max: 80,
        step: ".01",
        required: true,
      },
      { name: "note", label: "Measurement note / source", required: true },
    ];
  }
  if (action === "releaseLocation") {
    title = `Review ${selected.name}`;
    route = `stock-control/locations/${selected.id}/release`;
    fields = [
      {
        name: "note",
        label: "Pharmacist review and release justification",
        type: "textarea",
        required: true,
      },
    ];
  }
  if (action === "releaseBatch") {
    title = `Batch release review · ${selected.lotNumber}`;
    route = `stock-control/batches/${selected.id}/release`;
    fields = [
      {
        name: "note",
        label: "Product stability assessment / disposition reference",
        type: "textarea",
        required: true,
      },
    ];
  }
  async function transition(t: any, a: string) {
    try {
      await post(`stock-control/transfers/${t.id}/${a}`);
      resource.reload();
      reloadBatches();
      notify(
        `Transfer ${a === "dispatch" ? "dispatched" : a === "receive" ? "received" : "cancelled"}`,
      );
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="CONTROLLED MOVEMENT. CONFIDENT STORAGE."
        title="Stock control center"
        description="Multi-location inventory, two-step transfers and cold-chain excursion handling."
        actions={
          <>
            {tab === "locations" && canMove && (
              <Button onClick={() => setAction("location")}>
                <Plus size={18} />
                New location
              </Button>
            )}
            {tab === "transfers" && canMove && (
              <Button onClick={() => setAction("transfer")}>
                <ArrowRightLeft size={18} />
                Plan transfer
              </Button>
            )}
            {tab === "sensors" && canReview && (
              <Button onClick={() => setAction("sensor")}>
                <Plus size={18} />
                Temperature monitor
              </Button>
            )}
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          ["locations", "Locations & release"],
          ["transfers", "Stock transfers"],
          ["sensors", "Cold-chain monitors"],
        ]}
      />
      <ResourceState resource={resource}>
        {tab === "locations" ? (
          <>
            <div className="operation-card-grid">
              {rows.map((l) => (
                <section className="panel" key={l.id}>
                  <div className="panel-header">
                    <span
                      className={`attention-icon ${l.quarantined ? "red" : ""}`}
                    >
                      <Building2 size={22} />
                    </span>
                    <Badge tone={l.quarantined ? "red" : "green"}>
                      {l.quarantined ? "QUARANTINED" : l.kind}
                    </Badge>
                  </div>
                  <div className="panel-body">
                    <h2>{l.name}</h2>
                    <p className="muted mt">
                      {l.code} · {l._count.batches} tracked batches
                    </p>
                    <p className="muted mt">
                      {l.canDispense
                        ? "Eligible stock may be dispensed here."
                        : "Storage location. Transfer to a dispensing counter to sell."}
                    </p>
                    {canReview && l.quarantined && (
                      <Button
                        variant="secondary"
                        className="mt"
                        onClick={() => {
                          setSelected(l);
                          setAction("releaseLocation");
                        }}
                      >
                        Review location release
                      </Button>
                    )}
                  </div>
                </section>
              ))}
            </div>
            {!rows.length && (
              <Empty title="Create your first storage location" />
            )}
            {canReview &&
              (batches || []).some((b) => b.status === "QUARANTINED") && (
                <section className="panel mt">
                  <div className="panel-header">
                    <div>
                      <h2>Quarantined batch disposition</h2>
                      <p>
                        Releasing a location does not automatically release its
                        medicine. Review each batch separately.
                      </p>
                    </div>
                  </div>
                  <Table
                    headers={["Medicine / lot", "Location", "Expiry", "Review"]}
                  >
                    {batches
                      ?.filter((b) => b.status === "QUARANTINED")
                      .map((b) => (
                        <tr key={b.id}>
                          <td>
                            <strong>{b.medicine.brandName}</strong>
                            <small>{b.lotNumber}</small>
                          </td>
                          <td>{b.location?.name || "Main counter"}</td>
                          <td>{formatDate(b.expiryDate)}</td>
                          <td>
                            <Button
                              variant="secondary small"
                              onClick={() => {
                                setSelected(b);
                                setAction("releaseBatch");
                              }}
                            >
                              Review disposition
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </Table>
                </section>
              )}
          </>
        ) : tab === "transfers" ? (
          <section className="panel">
            {rows.length ? (
              <Table
                headers={[
                  "Medicine / lot",
                  "Route",
                  "Quantity",
                  "Status",
                  "Actions",
                ]}
              >
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.batch?.medicine.brandName}</strong>
                      <small>{t.batch?.lotNumber}</small>
                    </td>
                    <td>
                      {t.batch?.location?.name || "Main"} →{" "}
                      {t.destination?.name}
                    </td>
                    <td>{number(t.qty)} units</td>
                    <td>
                      <Badge>{t.status}</Badge>
                    </td>
                    <td>
                      <div className="actions">
                        {canMove && t.status === "DRAFT" && (
                          <>
                            <Button
                              variant="secondary small"
                              onClick={() => transition(t, "dispatch")}
                            >
                              Dispatch
                            </Button>
                            <Button
                              variant="ghost small"
                              onClick={() => transition(t, "cancel")}
                            >
                              Cancel
                            </Button>
                          </>
                        )}
                        {canMove && t.status === "DISPATCHED" && (
                          <Button
                            variant="secondary small"
                            onClick={() => transition(t, "receive")}
                          >
                            Confirm receipt
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty
                title="No transfers in progress"
                description="Dispatch removes source stock; destination stock is available only after receiving."
              />
            )}
          </section>
        ) : (
          <>
            <div className="inline-note">
              Staff enter observed readings against approved storage limits. An
              excursion immediately quarantines the location and its active
              batches; normal readings alone never release medicine.
            </div>
            <div className="operation-card-grid">
              {rows.map((s) => (
                <section className="panel sensor-card" key={s.id}>
                  <div className="panel-header">
                    <div>
                      <h2>{s.name}</h2>
                      <p>{s.location.name}</p>
                    </div>
                    <Badge
                      tone={
                        s.excursion
                          ? "red"
                          : s.latestC === null
                            ? "amber"
                            : "green"
                      }
                    >
                      {s.excursion
                        ? "EXCURSION"
                        : s.latestC === null
                          ? "NO READING"
                          : "IN RANGE"}
                    </Badge>
                  </div>
                  <div className="panel-body">
                    <div
                      className={`temperature-value ${s.excursion ? "text-red" : ""}`}
                    >
                      <Thermometer size={28} />
                      {s.latestC === null ? "—" : number(s.latestC)}
                      <span>°C</span>
                    </div>
                    <p className="muted">
                      Approved range {number(s.minC)}°C to {number(s.maxC)}°C
                    </p>
                    {canRead && (
                      <Button
                        className="mt"
                        variant="secondary"
                        onClick={() => {
                          setSelected(s);
                          setAction("reading");
                        }}
                      >
                        Record reading
                      </Button>
                    )}
                    <details className="mt">
                      <summary>Recent readings ({s.readings.length})</summary>
                      {s.readings.map((r: any) => (
                        <div className="sensor-reading" key={r.id}>
                          <span>
                            {formatDate(r.createdAt)}
                            <small>{r.note}</small>
                          </span>
                          <Badge
                            tone={r.excursion ? "red" : "green"}
                          >{`${number(r.valueC)}°C`}</Badge>
                        </div>
                      ))}
                    </details>
                  </div>
                </section>
              ))}
            </div>
            {!rows.length && (
              <Empty
                title="Monitor your temperature-sensitive storage"
                description="Register a monitor with product-appropriate approved limits."
              />
            )}
          </>
        )}
      </ResourceState>
      {action && (
        <Modal title={title} onClose={() => setAction("")}>
          <Form
            fields={fields}
            onSubmit={async (v) => {
              await post(route, v);
              setAction("");
              resource.reload();
              reloadLocations();
              reloadBatches();
              notify("Stock-control record saved");
            }}
          />
        </Modal>
      )}
    </>
  );
}
