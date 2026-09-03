import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { ToastStatus } from "../types";
import { Badge, Modal, PageHeader, StatCard, Table } from "../components/ui";
import { dateTimeStr, money, toInputDate } from "../lib/format";

export default function ToastIntegration() {
  const qc = useQueryClient();
  const { data: status } = useQuery<ToastStatus>({ queryKey: ["toast-status"], queryFn: () => api.get("/toast/status"), refetchInterval: 15_000 });
  const { data: logs } = useQuery<any[]>({ queryKey: ["toast-logs"], queryFn: () => api.get("/toast/sync-logs") });

  const [showConnect, setShowConnect] = useState(false);
  const [showHistorical, setShowHistorical] = useState(false);

  const syncNow = useMutation({
    mutationFn: () => api.post("/toast/sync"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["toast-status"] });
      qc.invalidateQueries({ queryKey: ["toast-logs"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const disconnect = useMutation({
    mutationFn: () => api.post("/toast/disconnect"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["toast-status"] }),
  });

  const toggleAutoSync = useMutation({
    mutationFn: (autoSyncEnabled: boolean) => api.patch("/toast/settings", { autoSyncEnabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["toast-status"] }),
  });

  return (
    <div>
      <PageHeader
        title="Toast POS integration"
        subtitle="Toast is the primary source of sales — orders sync automatically and deduct ingredients from theoretical inventory"
        action={
          status?.connected ? (
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setShowHistorical(true)}>
                Import historical sales
              </button>
              <button className="btn-primary" onClick={() => syncNow.mutate()} disabled={syncNow.isPending}>
                {syncNow.isPending ? "Syncing…" : "Sync Toast Now"}
              </button>
            </div>
          ) : (
            <button className="btn-primary" onClick={() => setShowConnect(true)}>
              Connect Toast
            </button>
          )
        }
      />

      <div className="mb-4 card flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${status?.connected ? "bg-emerald-500" : "bg-rose-500"}`} />
          <div>
            <div className="font-bold">{status?.connected ? "CONNECTED" : "DISCONNECTED"}</div>
            <div className="text-xs text-slate-500">
              {status?.environment.toUpperCase()} {status?.restaurantGuid ? `· Restaurant ${status.restaurantGuid}` : ""}
            </div>
          </div>
        </div>
        {status?.connected && (
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={status.autoSyncEnabled} onChange={(e) => toggleAutoSync.mutate(e.target.checked)} />
              Auto-sync every {status.autoSyncIntervalMinutes} min
            </label>
            <button className="text-sm text-rose-600" onClick={() => disconnect.mutate()}>
              Disconnect
            </button>
          </div>
        )}
      </div>

      {syncNow.isError && (
        <div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{(syncNow.error as any)?.message}</div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Last successful sync" value={status?.lastSyncAt ? dateTimeStr(status.lastSyncAt) : "Never"} />
        <StatCard label="Orders synchronized" value={status?.totalOrdersSynced ?? 0} />
        <StatCard label="Failed imports" value={status?.totalOrdersFailed ?? 0} tone={status && status.totalOrdersFailed > 0 ? "bad" : "default"} />
        <StatCard
          label="Unmapped Toast items"
          value={
            <Link to="/toast/mapping" className="hover:underline">
              {status?.unmappedItemCount ?? 0}
            </Link>
          }
          tone={status && status.unmappedItemCount > 0 ? "warn" : "default"}
        />
      </div>

      {status && status.unmappedItemCount > 0 && (
        <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          ⚠️ {status.unmappedItemCount} Toast item{status.unmappedItemCount === 1 ? "" : "s"} are not mapped to inventory recipes — their sales
          are not deducting ingredients yet.{" "}
          <Link to="/toast/mapping" className="font-semibold underline">
            Map them now
          </Link>
          .
        </div>
      )}

      <h2 className="mb-2 mt-6 text-lg font-bold">Sync log</h2>
      <Table>
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Started</th>
            <th className="px-3 py-2">Trigger</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Orders imported</th>
            <th className="px-3 py-2">Skipped (dup)</th>
            <th className="px-3 py-2">Failed</th>
            <th className="px-3 py-2">Inventory txns</th>
            <th className="px-3 py-2">Est. ingredient usage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {logs?.length ? (
            logs.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2 text-slate-500">{dateTimeStr(l.startedAt)}</td>
                <td className="px-3 py-2">{l.trigger}</td>
                <td className="px-3 py-2">
                  <Badge tone={l.status === "SUCCESS" ? "green" : l.status === "FAILED" ? "red" : l.status === "RUNNING" ? "blue" : "amber"}>
                    {l.status}
                  </Badge>
                </td>
                <td className="px-3 py-2">{l.ordersImported}</td>
                <td className="px-3 py-2">{l.ordersSkippedDuplicate}</td>
                <td className="px-3 py-2">{l.ordersFailed}</td>
                <td className="px-3 py-2">{l.inventoryTransactionsCreated}</td>
                <td className="px-3 py-2">{money(l.estimatedIngredientCost)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-3 py-2 text-slate-400" colSpan={8}>
                No syncs yet.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      {logs?.some((l) => l.errors?.length > 0) && (
        <div className="mt-4">
          <h3 className="mb-2 font-bold text-rose-600">Error log</h3>
          <div className="card divide-y divide-slate-100">
            {logs
              .flatMap((l) => l.errors.map((e: any) => ({ ...e, syncAt: l.startedAt })))
              .slice(0, 20)
              .map((e, i) => (
                <div key={i} className="p-3 text-sm">
                  <span className="text-slate-400">{dateTimeStr(e.syncAt)}</span> — order {e.orderId}: {e.message}
                </div>
              ))}
          </div>
        </div>
      )}

      <ConnectModal open={showConnect} onClose={() => setShowConnect(false)} />
      <HistoricalImportModal open={showHistorical} onClose={() => setShowHistorical(false)} />
    </div>
  );
}

function ConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [environment, setEnvironment] = useState("sandbox");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [restaurantGuid, setRestaurantGuid] = useState("");

  const connect = useMutation({
    mutationFn: () => api.post("/toast/connect", { environment, clientId, clientSecret, restaurantGuid }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["toast-status"] });
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Connect Toast">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          connect.mutate();
        }}
      >
        <p className="text-sm text-slate-500">
          Enter the API credentials Toast issued for your restaurant (Standard API Access, generated from the Toast admin portal, or
          Partner credentials). See <code>backend/src/integrations/toast/README.md</code> for exactly what's required and how to get it —
          these are validated with a live call to Toast before being saved, and are encrypted at rest server-side. They are never sent to
          this browser again.
        </p>
        <div>
          <label className="label">Environment</label>
          <select className="input" value={environment} onChange={(e) => setEnvironment(e.target.value)}>
            <option value="sandbox">Sandbox</option>
            <option value="production">Production</option>
          </select>
        </div>
        <div>
          <label className="label">Client ID</label>
          <input className="input" required value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </div>
        <div>
          <label className="label">Client secret</label>
          <input className="input" type="password" required value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
        </div>
        <div>
          <label className="label">Restaurant GUID</label>
          <input className="input" required value={restaurantGuid} onChange={(e) => setRestaurantGuid(e.target.value)} />
        </div>
        {connect.isError && <div className="text-sm text-rose-600">{(connect.error as any)?.message}</div>}
        <button className="btn-primary" disabled={connect.isPending}>
          {connect.isPending ? "Testing connection…" : "Connect"}
        </button>
      </form>
    </Modal>
  );
}

function HistoricalImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [preset, setPreset] = useState("30");
  const [startDate, setStartDate] = useState(toInputDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [endDate, setEndDate] = useState(toInputDate(new Date()));
  const [confirmed, setConfirmed] = useState(false);

  const applyPreset = (days: string) => {
    setPreset(days);
    if (days !== "custom") {
      setStartDate(toInputDate(new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000)));
      setEndDate(toInputDate(new Date()));
    }
  };

  const run = useMutation({
    mutationFn: () => api.post("/toast/import-historical", { startDate, endDate, confirm: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["toast-status"] });
      qc.invalidateQueries({ queryKey: ["toast-logs"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      onClose();
      setConfirmed(false);
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Import historical sales">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {[
            ["7", "Last 7 days"],
            ["30", "Last 30 days"],
            ["90", "Last 90 days"],
            ["custom", "Custom"],
          ].map(([val, label]) => (
            <button
              key={val}
              type="button"
              className={`btn-secondary ${preset === val ? "!bg-brand-100 !text-brand-700" : ""}`}
              onClick={() => applyPreset(val)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Start date</label>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label">End date</label>
            <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          This will pull every Toast order in this range and apply its ingredient consumption to theoretical inventory. Already-synced
          orders are skipped automatically (idempotent) — safe to re-run.
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I understand this will deduct inventory for all orders in this range.
        </label>

        {run.isError && <div className="text-sm text-rose-600">{(run.error as any)?.message}</div>}

        <button className="btn-primary" disabled={!confirmed || run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? "Importing…" : "Import historical sales"}
        </button>
      </div>
    </Modal>
  );
}
