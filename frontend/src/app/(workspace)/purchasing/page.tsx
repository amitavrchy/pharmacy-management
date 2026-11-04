"use client";
import { useState } from "react";
import { Plus, Truck, X, Send, PackageCheck } from "lucide-react";
import { useResource } from "@/lib/use-resource";
import { useApp } from "@/components/providers";
import {
  Badge,
  Button,
  Empty,
  ErrorState,
  Form,
  Loading,
  Modal,
  PageHeader,
  Table,
} from "@/components/ui";
import { formatDate, post, taka, number } from "@/lib/api";
export default function Purchasing() {
  const {
      data: orders,
      error,
      loading,
      reload,
    } = useResource<any[]>("purchasing/orders"),
    { data: suppliers, reload: reloadSuppliers } = useResource<any[]>(
      "purchasing/suppliers",
    ),
    { data: meds } = useResource<any[]>("catalog"),
    { user, notify } = useApp(),
    [tab, setTab] = useState("orders"),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState<any>(null),
    [lines, setLines] = useState([{ medicineId: "", qty: 100, cost: 0 }]),
    [formError, setFormError] = useState(""),
    [busy, setBusy] = useState(false);
  const can = ["OWNER", "STORE_KEEPER"].includes(user?.role);
  async function changeStatus(id: string, status: string) {
    try {
      await post(`purchasing/orders/${id}/status`, { status });
      reload();
      notify(`Order ${status.toLowerCase()}`);
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="KEEP CARE IN SUPPLY"
        title="Purchasing"
        description="From your trusted suppliers to your shelves, without the guesswork."
        actions={
          can && (
            <>
              <Button variant="secondary" onClick={() => setModal("supplier")}>
                <Truck size={17} />
                Add supplier
              </Button>
              <Button
                onClick={() => {
                  setLines([{ medicineId: "", qty: 100, cost: 0 }]);
                  setModal("order");
                }}
              >
                <Plus size={18} />
                New purchase order
              </Button>
            </>
          )
        }
      />
      <div className="tabs">
        <button
          className={tab === "orders" ? "active" : ""}
          onClick={() => setTab("orders")}
        >
          Purchase orders
        </button>
        <button
          className={tab === "suppliers" ? "active" : ""}
          onClick={() => setTab("suppliers")}
        >
          Suppliers
        </button>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} retry={reload} />
      ) : tab === "suppliers" ? (
        <section className="panel">
          {suppliers?.length ? (
            <Table headers={["Supplier", "Contact", "Address"]}>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    <small>{s.email || "—"}</small>
                  </td>
                  <td>{s.phone || "—"}</td>
                  <td>{s.address || "—"}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title="Add your first supplier" />
          )}
        </section>
      ) : orders?.length ? (
        orders.map((po) => (
          <section key={po.id} className="panel orders-card">
            <div className="order-heading">
              <div>
                <div className="row">
                  <h2>{po.supplier.name}</h2>
                  <Badge>{po.status}</Badge>
                </div>
                <p>
                  PO #{po.id.slice(-7).toUpperCase()} ·{" "}
                  {formatDate(po.createdAt)}
                  {po.notes ? ` · ${po.notes}` : ""}
                </p>
              </div>
              <div className="actions">
                {can && po.status === "DRAFT" && (
                  <Button
                    variant="secondary small"
                    onClick={() => changeStatus(po.id, "ORDERED")}
                  >
                    <Send size={15} />
                    Place order
                  </Button>
                )}
                {can && ["DRAFT", "ORDERED"].includes(po.status) && (
                  <Button
                    variant="ghost small"
                    onClick={() => {
                      setSelected(po);
                      setModal("cancel");
                    }}
                  >
                    Cancel order
                  </Button>
                )}
              </div>
            </div>
            <Table
              headers={[
                "Medicine",
                "Ordered units",
                "Received",
                "Unit cost",
                "Actions",
              ]}
            >
              {po.lines.map((l: any) => (
                <tr key={l.id}>
                  <td>
                    <strong>{l.medicine.brandName}</strong>
                    <small>
                      {l.medicine.strength} · {l.medicine.packSize} per pack
                    </small>
                  </td>
                  <td>{number(l.qty)}</td>
                  <td>
                    {number(l.receivedQty)}
                    <small>
                      {number(Number(l.qty) - Number(l.receivedQty))}{" "}
                      outstanding
                    </small>
                  </td>
                  <td>{taka(l.costMinor)}</td>
                  <td>
                    {can &&
                      ["ORDERED", "PARTIAL"].includes(po.status) &&
                      Number(l.receivedQty) < Number(l.qty) && (
                        <Button
                          variant="secondary small"
                          onClick={() => {
                            setSelected({ ...l, poId: po.id });
                            setModal("receive");
                          }}
                        >
                          <PackageCheck size={16} />
                          Receive
                        </Button>
                      )}
                  </td>
                </tr>
              ))}
            </Table>
          </section>
        ))
      ) : (
        <section className="panel">
          <Empty
            title="A well-stocked start"
            description="Create an order, place it, then receive each lot into inventory."
          />
        </section>
      )}
      {modal === "supplier" && (
        <Modal title="Add a supplier" onClose={() => setModal("")}>
          <Form
            fields={[
              { name: "name", label: "Supplier name", required: true },
              { name: "phone", label: "Phone", type: "tel" },
              { name: "email", label: "Email", type: "email" },
              { name: "address", label: "Address" },
            ]}
            onSubmit={async (v) => {
              await post("purchasing/suppliers", v);
              setModal("");
              reloadSuppliers();
              notify("Supplier added");
            }}
          />
        </Modal>
      )}
      {modal === "order" && (
        <Modal
          title="New purchase order"
          description="Enter ordered quantities in sellable units and cost per unit."
          onClose={() => setModal("")}
        >
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setFormError("");
              const fd = new FormData(e.currentTarget);
              try {
                await post("purchasing/orders", {
                  supplierId: fd.get("supplierId"),
                  notes: fd.get("notes"),
                  lines: lines.map((l) => ({
                    medicineId: l.medicineId,
                    qty: l.qty,
                    costMinor: Math.round(l.cost * 100),
                  })),
                });
                setModal("");
                reload();
                notify("Draft purchase order created");
              } catch (e) {
                setFormError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              <span>Supplier *</span>
              <select name="supplierId" required>
                <option value="">Choose supplier</option>
                {suppliers?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="order-lines">
              {lines.map((l, i) => (
                <div className="order-line" key={i}>
                  <label className="field">
                    <span>Medicine</span>
                    <select
                      aria-label="Medicine"
                      required
                      value={l.medicineId}
                      onChange={(e) =>
                        setLines(
                          lines.map((v, k) =>
                            k === i ? { ...v, medicineId: e.target.value } : v,
                          ),
                        )
                      }
                    >
                      <option value="">Select…</option>
                      {meds
                        ?.filter((m) => m.active)
                        .map((m) => (
                          <option value={m.id} key={m.id}>
                            {m.brandName}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Units</span>
                    <input
                      type="number"
                      min=".001"
                      step=".001"
                      required
                      value={l.qty}
                      onChange={(e) =>
                        setLines(
                          lines.map((v, k) =>
                            k === i ? { ...v, qty: Number(e.target.value) } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Cost ৳</span>
                    <input
                      type="number"
                      min="0"
                      step=".01"
                      required
                      value={l.cost}
                      onChange={(e) =>
                        setLines(
                          lines.map((v, k) =>
                            k === i
                              ? { ...v, cost: Number(e.target.value) }
                              : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={lines.length === 1}
                    aria-label={`Remove line ${i + 1}`}
                    onClick={() => setLines(lines.filter((_, k) => k !== i))}
                  >
                    <X size={17} />
                  </button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setLines([...lines, { medicineId: "", qty: 100, cost: 0 }])
              }
            >
              <Plus size={17} />
              Add line
            </Button>
            <label className="field">
              <span>Notes</span>
              <textarea name="notes" maxLength={1000} />
            </label>
            {formError && (
              <div className="inline-error" role="alert">
                {formError}
              </div>
            )}
            <div className="form-actions">
              <Button busy={busy} type="submit">
                Create draft order
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "receive" && selected && (
        <Modal
          title={`Receive ${selected.medicine.brandName}`}
          description={`${number(Number(selected.qty) - Number(selected.receivedQty))} units outstanding. Expiry must be after today in Dhaka.`}
          onClose={() => setModal("")}
        >
          <Form
            fields={[
              {
                name: "qty",
                label: "Quantity received",
                type: "number",
                min: 0.001,
                step: ".001",
                required: true,
              },
              {
                name: "inPacks",
                label: `Quantity is in packs (${selected.medicine.packSize} units each)`,
                type: "checkbox",
              },
              {
                name: "lotNumber",
                label: "Lot / batch number",
                required: true,
              },
              {
                name: "expiryDate",
                label: "Expiry date",
                type: "date",
                required: true,
              },
              { name: "rack", label: "Rack / location" },
            ]}
            submit="Receive stock"
            onSubmit={async (v) => {
              await post(`purchasing/orders/${selected.poId}/receive`, {
                ...v,
                lineId: selected.id,
              });
              setModal("");
              reload();
              notify("Goods received into inventory");
            }}
          />
        </Modal>
      )}
      {modal === "cancel" && selected && (
        <Modal
          title="Cancel purchase order?"
          description="This order has no received stock and will be closed."
          onClose={() => setModal("")}
        >
          <Button
            variant="danger"
            onClick={async () => {
              await changeStatus(selected.id, "CANCELLED");
              setModal("");
            }}
          >
            Confirm cancellation
          </Button>
        </Modal>
      )}
    </>
  );
}
