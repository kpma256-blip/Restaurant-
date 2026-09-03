import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Product } from "../types";
import { PageHeader, Table } from "../components/ui";
import { dateTimeStr, qty } from "../lib/format";

export default function History() {
  const [productId, setProductId] = useState("");
  const { data: products } = useQuery<Product[]>({ queryKey: ["products"], queryFn: () => api.get("/products") });
  const { data: history, isLoading } = useQuery<any[]>({
    queryKey: ["history", productId],
    queryFn: () => (productId ? api.get(`/products/${productId}/history?limit=300`) : Promise.resolve([])),
    enabled: !!productId,
  });

  return (
    <div>
      <PageHeader title="Inventory history" subtitle="Every transaction that ever touched inventory — the ledger is the source of truth" />

      <div className="mb-4 max-w-xs">
        <label className="label">Product</label>
        <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Select a product to view its ledger…</option>
          {products?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {!productId ? (
        <div className="card p-8 text-center text-sm text-slate-500">Pick a product above, or open one from the Inventory tab for its full history.</div>
      ) : isLoading ? (
        <div className="p-6 text-slate-400">Loading…</div>
      ) : (
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
                <td className="px-3 py-2 text-slate-500">{tx.reason}</td>
                <td className="px-3 py-2 text-slate-500">{tx.user?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Tip: every product's page (<Link to="/products" className="underline">Inventory</Link>) also shows its history inline.
      </p>
    </div>
  );
}
