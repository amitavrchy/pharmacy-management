"use client";
import { useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { useApp } from "@/components/providers";
import { useResource } from "@/lib/use-resource";
import {
  Badge,
  Button,
  Empty,
  Form,
  Modal,
  PageHeader,
  Table,
} from "@/components/ui";
import { patch, post } from "@/lib/api";
export default function Settings() {
  const { user, reload, notify } = useApp(),
    { data: users, reload: reloadUsers } = useResource<any[]>("settings/users"),
    [modal, setModal] = useState(false),
    [disable, setDisable] = useState<any>(null);
  if (user?.role !== "OWNER")
    return (
      <Empty
        title="Owner access required"
        description="Your pharmacy owner manages workspace policy and team accounts."
      />
    );
  return (
    <>
      <PageHeader
        eyebrow="MAKE THE WORKSPACE YOURS"
        title="Settings & team"
        description="The people, preferences and guardrails behind your pharmacy."
      />
      <div className="settings-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Pharmacy & dispensing policy</h2>
              <p>All expiry and reporting dates use Asia/Dhaka.</p>
            </div>
            <ShieldCheck size={23} />
          </div>
          <div className="settings-form">
            <Form
              fields={[
                {
                  name: "name",
                  label: "Pharmacy name",
                  required: true,
                  defaultValue: user.shop.name,
                },
                {
                  name: "drugLicenseNo",
                  label: "Drug license number",
                  defaultValue: user.shop.drugLicenseNo || "",
                },
                {
                  name: "address",
                  label: "Address",
                  defaultValue: user.shop.address,
                },
                {
                  name: "phone",
                  label: "Phone",
                  defaultValue: user.shop.phone,
                },
                {
                  name: "requirePharmacistForRx",
                  label: "Require pharmacist verification for Rx",
                  type: "checkbox",
                  defaultValue: user.shop.requirePharmacistForRx ? 1 : 0,
                },
                {
                  name: "saleWithoutBatchScan",
                  label: "Allow FEFO sale without batch scan",
                  type: "checkbox",
                  defaultValue: user.shop.saleWithoutBatchScan ? 1 : 0,
                },
                {
                  name: "minMarginBps",
                  label: "Minimum margin (basis points)",
                  hint: "500 basis points = 5%. Below this margin requires owner PIN.",
                  type: "number",
                  min: 0,
                  max: 9000,
                  required: true,
                  defaultValue: user.shop.minMarginBps,
                },
                {
                  name: "returnDays",
                  label: "Customer return period (days)",
                  type: "number",
                  min: 0,
                  max: 30,
                  required: true,
                  defaultValue: user.shop.returnDays,
                },
                {
                  name: "ownerPin",
                  label: "Set / replace owner override PIN",
                  type: "password",
                  hint: "6–12 digits. Leave blank to keep the current PIN.",
                },
              ]}
              submit="Save settings"
              onSubmit={async (v) => {
                await patch("settings", {
                  ...v,
                  drugLicenseNo: v.drugLicenseNo || "",
                  address: v.address || "",
                  phone: v.phone || "",
                });
                await reload();
                notify("Pharmacy settings saved");
              }}
            />
          </div>
        </section>
        <div className="stack" style={{ alignContent: "start" }}>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Your password</h2>
                <p>Use a unique password with at least 12 characters.</p>
              </div>
            </div>
            <div className="settings-form">
              <Form
                fields={[
                  {
                    name: "current",
                    label: "Current password",
                    type: "password",
                    required: true,
                  },
                  {
                    name: "password",
                    label: "New password",
                    type: "password",
                    required: true,
                  },
                ]}
                submit="Change password"
                onSubmit={async (v) => {
                  await post("auth/password", v);
                  notify("Password changed");
                }}
              />
            </div>
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2>Policy at a glance</h2>
            </div>
            <div className="panel-body stack">
              <div className="row space-between">
                <span>Expired / recalled stock</span>
                <Badge tone="green">Always blocked</Badge>
              </div>
              <div className="row space-between">
                <span>Controlled dispensing</span>
                <Badge tone="green">Pharmacist only</Badge>
              </div>
              <div className="row space-between">
                <span>Stock allocation</span>
                <Badge tone="green">Strict FEFO</Badge>
              </div>
              <div className="row space-between">
                <span>Negative stock</span>
                <Badge tone="green">Disabled</Badge>
              </div>
            </div>
          </section>
        </div>
      </div>
      <section className="panel mt">
        <div className="panel-header">
          <div>
            <h2>Your team</h2>
            <p>Give everyone the access they need.</p>
          </div>
          <Button variant="secondary" onClick={() => setModal(true)}>
            <Plus size={17} />
            Add member
          </Button>
        </div>
        {users?.length ? (
          <Table headers={["Member", "Role", "Status", ""]}>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <small>{u.email}</small>
                </td>
                <td>
                  <Badge tone="blue">{u.role}</Badge>
                </td>
                <td>
                  <Badge tone={u.active ? "green" : "red"}>
                    {u.active ? "Active" : "Disabled"}
                  </Badge>
                </td>
                <td>
                  {u.id !== user.id && (
                    <Button variant="ghost small" onClick={() => setDisable(u)}>
                      {u.active ? "Disable" : "Enable"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty title="Loading team…" />
        )}
      </section>
      {modal && (
        <Modal title="Add a team member" onClose={() => setModal(false)}>
          <Form
            fields={[
              { name: "name", label: "Full name", required: true },
              { name: "email", label: "Email", type: "email", required: true },
              {
                name: "role",
                label: "Role",
                required: true,
                options: [
                  "OWNER",
                  "PHARMACIST",
                  "CASHIER",
                  "STORE_KEEPER",
                  "AUDITOR",
                ].map((r) => ({ value: r, label: r.replaceAll("_", " ") })),
              },
              {
                name: "password",
                label: "Initial password (12+ characters)",
                type: "password",
                required: true,
              },
            ]}
            submit="Create account"
            onSubmit={async (v) => {
              await post("settings/users", v);
              setModal(false);
              reloadUsers();
              notify("Team member added");
            }}
          />
        </Modal>
      )}
      {disable && (
        <Modal
          title={`${disable.active ? "Disable" : "Enable"} ${disable.name}?`}
          description={
            disable.active
              ? "Their existing session will no longer grant access."
              : "This member will be able to sign in again."
          }
          onClose={() => setDisable(null)}
        >
          <Button
            variant={disable.active ? "danger" : ""}
            onClick={async () => {
              try {
                await patch(`settings/users/${disable.id}`, {
                  active: !disable.active,
                });
                setDisable(null);
                reloadUsers();
                notify("Team access updated");
              } catch (e) {
                notify((e as Error).message, true);
              }
            }}
          >
            Confirm change
          </Button>
        </Modal>
      )}
    </>
  );
}
