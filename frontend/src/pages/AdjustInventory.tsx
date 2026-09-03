import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Product, Unit } from "../types";
import { PageHeader, Spinner } from "../components/ui";

export default function AdjustInventory() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    productId: "",
    quantity: "",
    unitCode: "",
    reason: "",
  });

  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => api.get("/products"),
  });

  const { data: units } = useQuery<Unit[]>({
    queryKey: ["units"],
    queryFn: () => api.get("/units"),
  });

  const adjust = useMutation({
    mutationFn: () =>
      api.post("/inventory/adjust", {
        productId: form.productId,
        quantity: parseFloat(form.quantity),
        unitCode: form.unitCode,
        reason: form.reason || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
      setForm({ productId: "", quantity: "", unitCode: "", reason: "" });
    },
  });

  const selectedProduct = products?.find((p) => p.id === form.productId);
  const canSubmit = form.productId && form.quantity && form.unitCode;

  if (productsLoading) return <Spinner />;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Adjust Inventory"
        subtitle="Quickly add or remove inventory without receiving or waste workflows"
      />

      <div className="card p-6">
        <div className="space-y-4">
          <div>
            <label className="label">Product *</label>
            <select
              className="input w-full"
              value={form.productId}
              onChange={(e) => {
                const product = products?.find((p) => p.id === e.target.value);
                setForm({
                  ...form,
                  productId: e.target.value,
                  unitCode: product?.inventoryUnitCode || "",
                });
              }}
            >
              <option value="">Select product…</option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {selectedProduct && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="text-slate-600">
                <span className="font-medium">Current quantity:</span> {selectedProduct.currentQuantity}{" "}
                {selectedProduct.inventoryUnitCode}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Quantity *</label>
              <input
                className="input w-full"
                type="number"
                step="0.01"
                placeholder="e.g., 10 or -5"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-500">Positive to add, negative to remove</p>
            </div>

            <div>
              <label className="label">Unit *</label>
              <select
                className="input w-full"
                value={form.unitCode}
                onChange={(e) => setForm({ ...form, unitCode: e.target.value })}
              >
                <option value="">Select unit…</option>
                {units?.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.name} ({u.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Reason (optional)</label>
              <input
                className="input w-full"
                placeholder="e.g., Inventory correction"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <button
              className="btn-primary"
              disabled={!canSubmit || adjust.isPending}
              onClick={() => adjust.mutate()}
            >
              {adjust.isPending ? "Adjusting…" : "Adjust Inventory"}
            </button>
            {adjust.isSuccess && <span className="self-center text-sm text-emerald-600">✅ Adjusted</span>}
            {adjust.isError && (
              <span className="self-center text-sm text-rose-600">{(adjust.error as any)?.message}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
