"use client";
import { useState } from "react";
import {
  Plus,
  Upload,
  Download,
  Pill,
  ChevronLeft,
  ChevronRight,
  Edit3,
} from "lucide-react";
import { useResource } from "@/lib/use-resource";
import { useApp } from "@/components/providers";
import {
  Badge,
  Button,
  Empty,
  ErrorState,
  Field,
  Form,
  Loading,
  Modal,
  PageHeader,
  SearchBox,
  Table,
} from "@/components/ui";
import { downloadCSV, patch, post, taka, number } from "@/lib/api";
const fields: Field[] = [
  { name: "brandName", label: "Brand name", required: true },
  { name: "genericName", label: "Generic name", required: true },
  { name: "manufacturer", label: "Manufacturer", required: true },
  { name: "strength", label: "Strength", required: true },
  {
    name: "form",
    label: "Dosage form",
    options: [
      "Tablet",
      "Capsule",
      "Syrup",
      "Injection",
      "Cream",
      "Drops",
      "Inhaler",
    ].map((v) => ({ value: v, label: v })),
    required: true,
  },
  {
    name: "packSize",
    label: "Units per pack",
    type: "number",
    min: 1,
    defaultValue: 10,
    required: true,
  },
  { name: "barcode", label: "Unique barcode" },
  {
    name: "schedule",
    label: "Schedule",
    options: ["OTC", "RX", "CONTROLLED"].map((v) => ({ value: v, label: v })),
    defaultValue: "OTC",
    required: true,
  },
  {
    name: "price",
    label: "Selling price per unit (৳)",
    type: "number",
    min: 0,
    step: ".01",
    required: true,
  },
  {
    name: "reorderLevel",
    label: "Low-stock threshold (units)",
    type: "number",
    defaultValue: 50,
    min: 0,
    step: ".001",
    required: true,
  },
];
export default function Catalog() {
  const { data, error, loading, reload } = useResource<any[]>("catalog"),
    { user, notify } = useApp(),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [page, setPage] = useState(0),
    [modal, setModal] = useState<"create" | "import" | null>(null),
    [editing, setEditing] = useState<any>(null);
  const can = ["OWNER", "PHARMACIST"].includes(user?.role),
    rows = (data || []).filter(
      (m) =>
        `${m.brandName} ${m.generic.name} ${m.barcode} ${m.manufacturer}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter === "ALL" || m.schedule === filter),
    ),
    shown = rows.slice(page * 15, page * 15 + 15);
  return (
    <>
      <PageHeader
        eyebrow="THE MEDICINE LIBRARY"
        title="Medicine catalog"
        description="Every brand, generic and detail. In one considered place."
        actions={
          <>
            {user?.role === "OWNER" && (
              <Button variant="secondary" onClick={() => setModal("import")}>
                <Upload size={17} />
                Import CSV
              </Button>
            )}
            {can && (
              <Button onClick={() => setModal("create")}>
                <Plus size={18} />
                Add medicine
              </Button>
            )}
          </>
        }
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} retry={reload} />
      ) : (
        <section className="panel">
          <div className="toolbar">
            <SearchBox
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(0);
              }}
              placeholder="Search medicine, generic or barcode…"
            />
            <select
              className="filter-select"
              aria-label="Filter by schedule"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
            >
              <option value="ALL">All schedules</option>
              {["OTC", "RX", "CONTROLLED"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <span className="result-count">{rows.length} medicines</span>
            <Button
              variant="secondary"
              onClick={() =>
                downloadCSV(
                  "medicine-catalog.csv",
                  rows.map((m) => ({
                    brandName: m.brandName,
                    genericName: m.generic.name,
                    manufacturer: m.manufacturer,
                    strength: m.strength,
                    form: m.form,
                    packSize: m.packSize,
                    barcode: m.barcode,
                    schedule: m.schedule,
                    priceMinor: m.priceMinor,
                    reorderLevel: m.reorderLevel,
                  })),
                )
              }
            >
              <Download size={16} />
              Export
            </Button>
          </div>
          {shown.length ? (
            <Table
              headers={[
                "Medicine",
                "Generic / strength",
                "Schedule",
                "Unit price",
                "Available",
                "",
              ]}
            >
              {shown.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="cell-product">
                      <span className="product-icon">
                        <Pill size={18} />
                      </span>
                      <div>
                        <strong>{m.brandName}</strong>
                        <small>{m.manufacturer}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {m.generic.name}
                    <small>
                      {m.strength} · {m.form}
                    </small>
                  </td>
                  <td>
                    <Badge>{m.schedule}</Badge>
                  </td>
                  <td className="mono">{taka(m.priceMinor)}</td>
                  <td>
                    <strong
                      className={
                        m.stock <= Number(m.reorderLevel) ? "text-amber" : ""
                      }
                    >
                      {number(m.stock)} units
                    </strong>
                    <small>{m.active ? "Active SKU" : "Archived"}</small>
                  </td>
                  <td>
                    {can && (
                      <button
                        className="icon-btn"
                        aria-label={`Edit ${m.brandName}`}
                        onClick={() => setEditing(m)}
                      >
                        <Edit3 size={17} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty
              title="No medicines found"
              description="Try another brand, generic or barcode."
            />
          )}
          <div className="table-footer">
            <span>
              Showing {rows.length ? page * 15 + 1 : 0}–
              {Math.min(page * 15 + 15, rows.length)} of {rows.length}
            </span>
            <div className="pagination">
              <Button
                variant="secondary small"
                disabled={!page}
                onClick={() => setPage(page - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft size={17} />
              </Button>
              <span>{page + 1}</span>
              <Button
                variant="secondary small"
                disabled={(page + 1) * 15 >= rows.length}
                onClick={() => setPage(page + 1)}
                aria-label="Next page"
              >
                <ChevronRight size={17} />
              </Button>
            </div>
          </div>
        </section>
      )}
      {modal === "create" && (
        <Modal
          title="Add a medicine"
          description="Create a sellable SKU. Receive stock through Purchasing."
          onClose={() => setModal(null)}
        >
          <Form
            fields={fields}
            submit="Create medicine"
            onSubmit={async (v) => {
              const { price, ...rest } = v;
              await post("catalog", {
                ...rest,
                unitName: "pcs",
                priceMinor: Math.round(price * 100),
              });
              setModal(null);
              reload();
              notify("Medicine added to catalog");
            }}
          />
        </Modal>
      )}
      {modal === "import" && (
        <Modal
          title="Import medicine CSV"
          description="All rows are validated before anything is saved. Maximum 500 rows."
          onClose={() => setModal(null)}
        >
          <div className="inline-note">
            Use the exported catalog headers. Prices use integer poisha in
            priceMinor. Every barcode must be unique.
          </div>
          <Form
            fields={[
              {
                name: "csv",
                label: "CSV content",
                type: "textarea",
                required: true,
              },
            ]}
            submit="Validate & import"
            onSubmit={async (v) => {
              const res = await post("catalog/import", v);
              setModal(null);
              reload();
              notify(`${res.imported} medicines imported`);
            }}
          />
        </Modal>
      )}
      {editing && (
        <Modal
          title={`Edit ${editing.brandName}`}
          onClose={() => setEditing(null)}
        >
          <Form
            fields={[
              {
                name: "price",
                label: "Unit price (৳)",
                type: "number",
                min: 0,
                step: ".01",
                defaultValue: editing.priceMinor / 100,
                required: true,
              },
              {
                name: "reorderLevel",
                label: "Low-stock threshold",
                type: "number",
                min: 0,
                step: ".001",
                defaultValue: editing.reorderLevel,
                required: true,
              },
              {
                name: "active",
                label: "Available for sale",
                type: "checkbox",
                defaultValue: editing.active ? 1 : 0,
              },
            ]}
            onSubmit={async (v) => {
              await patch(`catalog/${editing.id}`, {
                priceMinor: Math.round(v.price * 100),
                reorderLevel: v.reorderLevel,
                active: v.active,
              });
              setEditing(null);
              reload();
              notify("Medicine updated");
            }}
          />
        </Modal>
      )}
    </>
  );
}
