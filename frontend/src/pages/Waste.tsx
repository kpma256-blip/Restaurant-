import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Product, Unit, WasteRecord } from "../types";
import { PageHeader, Table } from "../components/ui";
import { dateStr, qty, toInputDate } from "../lib/format";

const REASONS = ["SPOILED", "DAMAGED", "DROPPED", "EXPIRED", "OVERPRODUCTION", "STAFF_MEAL", "OTHER"];

export default function Waste() {
  const qc = useQueryClient();
  const { data: products } = useQuery<Product[]>({ queryKey: ["products"], queryFn: () => api.get("/products") });
  const { data: units } = useQuery<Unit[]>({ queryKey: ["units"], queryFn: () => api.get("/units") });
  const { data: records } = useQuery<WasteRecord[]>({ queryKey: ["waste"], queryFn: () => api.get("/inventory/waste") });

  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCode, setUnitCode] = useState("");
  const [reason, setReason] = useState("SPOILED");
  const [wasteDate, setWasteDate] = useState(toInputDate(new Date()));
  const [notes, setNotes] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      api.post("/inventory/waste", { productId, quantity: Number(quantity), unitCode, reason, wasteDate, notes: notes || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["waste"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setQuantity("");
      setNotes("");
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit.mutate();
  };

  return (
    <div>
      <PageHeader title="Waste" subtitle="Record spoilage, damage, or drops — deducted from inventory immediately" />

      <div className="grid gap-6 lg:grid-cols-2">
        <form className="card flex flex-col gap-4 p-5" onSubmit={onSubmit}>
          <div>
            <label className="label">Product</label>
            <select className="input" required value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Select a product…</option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Quantity</label>
              <input
                type="number"
                step="any"
                min="0"
                className="input"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Unit</label>
              <select className="input" required value={unitCode} onChange={(e) => setUnitCode(e.target.value)}>
                <option value="">Unit…</option>
                {units?.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.code}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Reason</label>
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={wasteDate} onChange={(e) => setWasteDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened?" />
          </div>
          {submit.isError && <div className="text-sm text-rose-600">{(submit.error as any)?.message}</div>}
          <button className="btn-danger" disabled={submit.isPending}>
            {submit.isPending ? "Saving…" : "Record waste"}
          </button>
        </form>

        <div>
          <h2 className="mb-2 text-lg font-bold">Recent waste</h2>
          <Table>
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records?.slice(0, 20).map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-slate-500">{dateStr(r.wasteDate)}</td>
                  <td className="px-3 py-2 font-medium">{r.product?.name}</td>
                  <td className="px-3 py-2">
                    {qty(r.quantity)} {r.unitCode}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{r.reason.replace(/_/g, " ")}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </div>
  );
}
