import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Product, Supplier, Unit } from "../types";
import { PageHeader } from "../components/ui";
import { toInputDate } from "../lib/format";

export default function Receive() {
  const qc = useQueryClient();
  const { data: products } = useQuery<Product[]>({ queryKey: ["products"], queryFn: () => api.get("/products") });
  const { data: units } = useQuery<Unit[]>({ queryKey: ["units"], queryFn: () => api.get("/units") });
  const { data: suppliers } = useQuery<Supplier[]>({ queryKey: ["suppliers"], queryFn: () => api.get("/suppliers") });

  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCode, setUnitCode] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(toInputDate(new Date()));
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const selectedProduct = products?.find((p) => p.id === productId);

  const submit = useMutation({
    mutationFn: () =>
      api.post("/inventory/receive", {
        purchaseDate,
        supplierId: supplierId || undefined,
        notes: notes || undefined,
        items: [{ productId, quantity: Number(quantity), unitCode, unitCost: unitCost ? Number(unitCost) : undefined }],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setConfirmation(`Received ${quantity} ${unitCode} of ${selectedProduct?.name}. New balance updates the ledger immediately.`);
      setQuantity("");
      setUnitCost("");
      setNotes("");
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setConfirmation(null);
    submit.mutate();
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Receive inventory" subtitle="Product → Quantity → Unit → Date → Optional cost" />

      <form className="card flex flex-col gap-4 p-5" onSubmit={onSubmit}>
        <div>
          <label className="label">Product</label>
          <select className="input" required value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Select a product…</option>
            {products?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — on hand {p.currentQuantity} {p.inventoryUnitCode}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Quantity received</label>
            <input
              type="number"
              step="any"
              min="0"
              className="input"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 25"
            />
          </div>
          <div>
            <label className="label">Unit</label>
            <select className="input" required value={unitCode} onChange={(e) => setUnitCode(e.target.value)}>
              <option value="">Unit…</option>
              {units?.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.name} ({u.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date received</label>
            <input type="date" className="input" required value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Cost per unit (optional)</label>
            <input
              type="number"
              step="any"
              min="0"
              className="input"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="e.g. 7.50"
            />
          </div>
        </div>

        <div>
          <label className="label">Supplier (optional)</label>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">—</option>
            {suppliers?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Notes (optional)</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Invoice #, delivery notes…" />
        </div>

        {submit.isError && <div className="text-sm text-rose-600">{(submit.error as any)?.message}</div>}
        {confirmation && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">✅ {confirmation}</div>}

        <button className="btn-primary" disabled={submit.isPending}>
          {submit.isPending ? "Saving…" : "Receive inventory"}
        </button>
      </form>
    </div>
  );
}
