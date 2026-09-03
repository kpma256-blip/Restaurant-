import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Product, Supplier, Unit } from "../../types";
import SearchableSelect from "../SearchableSelect";
import { toInputDate } from "../../lib/format";
import QuickCreateProductModal from "./QuickCreateProductModal";

interface Row {
  key: number;
  productId: string;
  productName: string;
  unitCode: string;
  quantity: string;
  cost: string;
}

let rowKeySeq = 0;
const emptyRow = (): Row => ({ key: rowKeySeq++, productId: "", productName: "", unitCode: "", quantity: "", cost: "" });

export default function QuickEntryTab() {
  const qc = useQueryClient();
  const { data: products } = useQuery<Product[]>({ queryKey: ["products"], queryFn: () => api.get("/products") });
  const { data: suppliers } = useQuery<Supplier[]>({ queryKey: ["suppliers"], queryFn: () => api.get("/suppliers") });
  const { data: units } = useQuery<Unit[]>({ queryKey: ["units"], queryFn: () => api.get("/units") });

  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(toInputDate(new Date()));
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [createForRow, setCreateForRow] = useState<{ key: number; name: string } | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const productOptions = (products ?? []).map((p) => ({ value: p.id, label: p.name, sublabel: `${p.currentQuantity} ${p.inventoryUnitCode} on hand` }));

  const updateRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const addRow = () => setRows((rs) => [...rs, emptyRow()]);

  const usableRows = rows.filter((r) => r.productId && r.quantity && r.unitCode);

  const save = useMutation({
    mutationFn: () =>
      api.post("/receiving/confirm", {
        purchaseDate,
        supplierId: supplierId || undefined,
        items: usableRows.map((r) => ({
          productId: r.productId,
          quantity: Number(r.quantity),
          unitCode: r.unitCode,
          unitCost: r.cost ? Number(r.cost) : undefined,
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["receiving-history"] });
      setConfirmation(`Saved — ${usableRows.length} product${usableRows.length === 1 ? "" : "s"} added to inventory.`);
      setRows([emptyRow(), emptyRow(), emptyRow()]);
    },
  });

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <label className="label">Date</label>
          <input type="date" className="input" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-left">Quantity</th>
              <th className="px-3 py-2 text-left">Unit</th>
              <th className="px-3 py-2 text-left">Cost / unit</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="min-w-[220px] px-3 py-2">
                  <SearchableSelect
                    options={productOptions}
                    value={row.productId || null}
                    placeholder="Search product…"
                    allowCreate
                    onChange={(val) => {
                      const p = products?.find((x) => x.id === val);
                      updateRow(row.key, { productId: val, productName: p?.name ?? "", unitCode: row.unitCode || p?.inventoryUnitCode || "" });
                    }}
                    onCreateNew={(typed) => setCreateForRow({ key: row.key, name: typed })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="input w-24"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2">
                  <select className="input w-28" value={row.unitCode} onChange={(e) => updateRow(row.key, { unitCode: e.target.value })}>
                    <option value="">Unit…</option>
                    {units?.map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.code}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="input w-28"
                    placeholder="$"
                    value={row.cost}
                    onChange={(e) => updateRow(row.key, { cost: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2">
                  <button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => removeRow(row.key)} aria-label="Remove row">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" className="btn-secondary mt-3" onClick={addRow}>
        + Add Product
      </button>

      {save.isError && <div className="mt-3 text-sm text-rose-600">{(save.error as any)?.message}</div>}
      {confirmation && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">✅ {confirmation}</div>}

      <div className="mt-4">
        <button className="btn-primary" disabled={usableRows.length === 0 || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : `Save Receiving (${usableRows.length} item${usableRows.length === 1 ? "" : "s"})`}
        </button>
      </div>

      {createForRow && (
        <QuickCreateProductModal
          open
          initialName={createForRow.name}
          onClose={() => setCreateForRow(null)}
          onCreated={(product) => {
            updateRow(createForRow.key, { productId: product.id, productName: product.name, unitCode: product.inventoryUnitCode });
            setCreateForRow(null);
          }}
        />
      )}
    </div>
  );
}
