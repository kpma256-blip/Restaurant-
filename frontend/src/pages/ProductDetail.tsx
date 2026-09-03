import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { InventoryTransaction, Product } from "../types";
import { dateTimeStr, money, qty } from "../lib/format";
import { PageHeader, Spinner, StatCard, StatusDot, Table } from "../components/ui";

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: product, isLoading } = useQuery<Product>({ queryKey: ["product", id], queryFn: () => api.get(`/products/${id}`) });
  const { data: history } = useQuery<InventoryTransaction[]>({
    queryKey: ["product-history", id],
    queryFn: () => api.get(`/products/${id}/history?limit=200`),
  });

  const [edit, setEdit] = useState({ parLevel: 0, reorderLevel: 0 });
  const [editing, setEditing] = useState(false);

  const update = useMutation({
    mutationFn: () => api.patch(`/products/${id}`, edit),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product", id] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setEditing(false);
    },
  });

  const reconcile = useMutation({
    mutationFn: () => api.post<{ before: number; after: number; corrected: boolean }>(`/products/${id}/reconcile`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product", id] });
      qc.invalidateQueries({ queryKey: ["product-history", id] });
    },
  });

  if (isLoading || !product) return <Spinner />;

  return (
    <div>
      <PageHeader
        title={product.name}
        subtitle={product.category?.name}
        action={<StatusDot status={product.status} />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="On hand" value={`${qty(product.currentQuantity)} ${product.inventoryUnitCode}`} />
        <StatCard label="Avg cost" value={money(product.avgCost)} hint={`Last: ${money(product.lastCost)}`} />
        <StatCard label="Inventory value" value={money(product.currentQuantity * (product.effectiveUnitCost ?? product.avgCost))} />
        <StatCard label="Par / Reorder" value={`${qty(product.parLevel)} / ${qty(product.reorderLevel)}`} />
      </div>

      <div className="mt-6 card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Par & reorder levels</h2>
          {!editing ? (
            <button
              className="btn-secondary"
              onClick={() => {
                setEdit({ parLevel: product.parLevel, reorderLevel: product.reorderLevel });
                setEditing(true);
              }}
            >
              Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={() => update.mutate()} disabled={update.isPending}>
                Save
              </button>
            </div>
          )}
        </div>
        {editing ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Par level ({product.inventoryUnitCode})</label>
              <input
                type="number"
                step="any"
                className="input"
                value={edit.parLevel}
                onChange={(e) => setEdit({ ...edit, parLevel: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Reorder level ({product.inventoryUnitCode})</label>
              <input
                type="number"
                step="any"
                className="input"
                value={edit.reorderLevel}
                onChange={(e) => setEdit({ ...edit, reorderLevel: Number(e.target.value) })}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Alerts fire when on-hand drops below par ({qty(product.parLevel)} {product.inventoryUnitCode}), and escalate to critical at or
            below reorder level ({qty(product.reorderLevel)} {product.inventoryUnitCode}).
          </p>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-lg font-bold">Transaction history (the ledger)</h2>
        <button className="btn-secondary" onClick={() => reconcile.mutate()} disabled={reconcile.isPending}>
          {reconcile.isPending ? "Checking…" : "Reconcile with ledger"}
        </button>
      </div>
      {reconcile.data && (
        <div className="mt-2 text-sm text-slate-500">
          Ledger balance: {qty(reconcile.data.after)} {product.inventoryUnitCode} —{" "}
          {reconcile.data.corrected ? "cache was out of sync and has been corrected." : "cache matches the ledger exactly."}
        </div>
      )}

      <div className="mt-3">
        <Table>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Date/time</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Change</th>
              <th className="px-3 py-2">Previous → New</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">User</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {history?.map((tx) => (
              <tr key={tx.id}>
                <td className="px-3 py-2 text-slate-500">{dateTimeStr(tx.createdAt)}</td>
                <td className="px-3 py-2 font-medium">{tx.type.replace(/_/g, " ")}</td>
                <td className={`px-3 py-2 font-semibold ${tx.quantity >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {tx.quantity >= 0 ? "+" : ""}
                  {qty(tx.originalQuantity)} {tx.unitCode}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {qty(tx.previousQuantity)} → {qty(tx.newQuantity)}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {tx.reason}
                  {tx.notes && <div className="text-xs text-slate-400">{tx.notes}</div>}
                </td>
                <td className="px-3 py-2 text-slate-500">{tx.user?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
