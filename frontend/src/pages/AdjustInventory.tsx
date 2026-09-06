import { FormEvent } from "react";
import { PageHeader, EmptyState } from "../components/ui";
import { SkeletonCard } from "../components/Skeleton";
import { SelectInput, NumberInput, TextInput } from "../components/FormInputs";
import { getErrorMessage } from "../lib/constants";
import { useForm } from "../hooks/useForm";
import { useProducts, useUnits, useAdjustInventory } from "../hooks/useApi";

const INITIAL_ADJUST = {
  productId: "",
  quantity: "",
  unitCode: "",
  reason: "",
};

export default function AdjustInventory() {
  const { data: products, isLoading: productsLoading } = useProducts();
  const { data: units, isLoading: unitsLoading } = useUnits();

  const form = useForm(INITIAL_ADJUST);
  const adjust = useAdjustInventory({
    onSuccess: () => {
      form.reset();
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!form.values.productId) {
      form.setError("productId", "Product is required");
      return;
    }
    if (!form.values.quantity) {
      form.setError("quantity", "Quantity is required");
      return;
    }
    if (!form.values.unitCode) {
      form.setError("unitCode", "Unit is required");
      return;
    }

    adjust.mutate({
      productId: form.values.productId,
      quantity: Number(form.values.quantity),
      unitCode: form.values.unitCode,
      reason: form.values.reason || undefined,
    });
  };

  const selectedProduct = products?.find((p) => p.id === form.values.productId);
  const isLoading = productsLoading || unitsLoading;
  const canSubmit = form.values.productId && form.values.quantity && form.values.unitCode;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Adjust Inventory"
        subtitle="Quickly add or remove stock without receiving or waste workflows"
      />

      {isLoading ? (
        <SkeletonCard count={3} />
      ) : (
        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <SelectInput
            label="Product"
            required
            value={form.values.productId}
            onChange={(e) => {
              const product = products?.find((p) => p.id === e.target.value);
              form.set("productId", e.target.value);
              if (product) {
                form.set("unitCode", product.inventoryUnitCode);
              }
            }}
            options={(products || []).map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Select product…"
            error={form.errors.productId}
          />

          {selectedProduct && (
            <div className="flex items-center gap-3 rounded-lg bg-blue-50 p-3">
              <span className="text-2xl">📦</span>
              <div>
                <p className="text-sm font-medium text-blue-900">Current quantity</p>
                <p className="text-lg font-bold text-blue-700">
                  {selectedProduct.currentQuantity} {selectedProduct.inventoryUnitCode}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <NumberInput
              label="Quantity"
              required
              step="0.01"
              placeholder="e.g., 10 or -5"
              hint="Positive to add, negative to remove"
              value={form.values.quantity}
              onChange={(e) => form.set("quantity", e.target.value)}
              error={form.errors.quantity}
            />

            <SelectInput
              label="Unit"
              required
              value={form.values.unitCode}
              onChange={(e) => form.set("unitCode", e.target.value)}
              options={(units || []).map((u) => ({ value: u.code, label: `${u.name} (${u.code})` }))}
              placeholder="Select unit…"
              error={form.errors.unitCode}
            />

            <TextInput
              label="Reason (optional)"
              placeholder="e.g., Inventory correction"
              value={form.values.reason}
              onChange={(e) => form.set("reason", e.target.value)}
            />
          </div>

          {adjust.isError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {getErrorMessage(adjust.error)}
            </div>
          )}

          {adjust.isSuccess && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              ✅ Inventory adjusted successfully
            </div>
          )}

          <button className="btn-primary" disabled={!canSubmit || adjust.isPending}>
            {adjust.isPending ? "Adjusting…" : "Adjust Inventory"}
          </button>
        </form>
      )}
    </div>
  );
}
