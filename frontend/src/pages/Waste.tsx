import { FormEvent } from "react";
import { Product, WasteRecord } from "../types";
import { PageHeader, Table, EmptyState, Badge } from "../components/ui";
import { SkeletonTable } from "../components/Skeleton";
import { TextInput, SelectInput, NumberInput, TextArea } from "../components/FormInputs";
import { dateStr, qty, toInputDate } from "../lib/format";
import { WASTE_REASONS, getErrorMessage } from "../lib/constants";
import { useForm } from "../hooks/useForm";
import { useProducts, useUnits, useWasteRecords, useCreateWaste } from "../hooks/useApi";

const INITIAL_WASTE = {
  productId: "",
  quantity: "",
  unitCode: "",
  reason: "SPOILED",
  wasteDate: toInputDate(new Date()),
  notes: "",
};

export default function Waste() {
  const { data: products, isLoading: productsLoading } = useProducts();
  const { data: units, isLoading: unitsLoading } = useUnits();
  const { data: records, isLoading: recordsLoading } = useWasteRecords();

  const form = useForm(INITIAL_WASTE);
  const submit = useCreateWaste({
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
    submit.mutate({
      ...form.values,
      quantity: Number(form.values.quantity),
      notes: form.values.notes || undefined,
    });
  };

  const isFormLoading = productsLoading || unitsLoading;

  return (
    <div>
      <PageHeader title="Waste" subtitle="Record spoilage, damage, or drops — deducted from inventory immediately" />

      <div className="grid gap-6 lg:grid-cols-2">
        <form className="card flex flex-col gap-4 p-5" onSubmit={onSubmit}>
          <SelectInput
            label="Product"
            required
            value={form.values.productId}
            onChange={(e) => form.set("productId", e.target.value)}
            options={(products || []).map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Select a product…"
            error={form.errors.productId}
            disabled={productsLoading}
          />

          <div className="grid grid-cols-2 gap-3">
            <NumberInput
              label="Quantity"
              required
              step="0.01"
              min="0"
              value={form.values.quantity}
              onChange={(e) => form.set("quantity", e.target.value)}
              error={form.errors.quantity}
              disabled={isFormLoading}
            />

            <SelectInput
              label="Unit"
              required
              value={form.values.unitCode}
              onChange={(e) => form.set("unitCode", e.target.value)}
              options={(units || []).map((u) => ({ value: u.code, label: `${u.name} (${u.code})` }))}
              placeholder="Select unit…"
              error={form.errors.unitCode}
              disabled={unitsLoading}
            />
          </div>

          <SelectInput
            label="Reason"
            value={form.values.reason}
            onChange={(e) => form.set("reason", e.target.value)}
            options={WASTE_REASONS.map((r) => ({ value: r.value, label: r.label }))}
          />

          <TextInput
            label="Date"
            type="date"
            value={form.values.wasteDate}
            onChange={(e) => form.set("wasteDate", e.target.value)}
          />

          <TextArea
            label="Notes (optional)"
            placeholder="What happened?"
            value={form.values.notes}
            onChange={(e) => form.set("notes", e.target.value)}
          />

          {submit.isError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {getErrorMessage(submit.error)}
            </div>
          )}

          <button className="btn-danger" disabled={submit.isPending || isFormLoading}>
            {submit.isPending ? "Recording…" : "Record waste"}
          </button>
        </form>

        <div>
          <h2 className="mb-3 text-lg font-bold">Recent waste</h2>
          {recordsLoading ? (
            <SkeletonTable rows={5} />
          ) : records && records.length > 0 ? (
            <Table>
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-left">Qty</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.slice(0, 20).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-sm text-slate-600">{dateStr(r.wasteDate)}</td>
                    <td className="px-3 py-2 font-medium">{r.product?.name}</td>
                    <td className="px-3 py-2 text-sm">
                      {qty(r.quantity)} {r.unitCode}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <Badge tone="amber">{WASTE_REASONS.find((wr) => wr.value === r.reason)?.label || r.reason}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState>No waste recorded yet</EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}
