import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { MenuItem, Product, Unit } from "../types";
import { Modal, PageHeader, Spinner } from "../components/ui";
import { money, pct } from "../lib/format";

interface IngredientRow {
  productId: string;
  quantity: string;
  unitCode: string;
}

export default function MenuItemDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: menuItem, isLoading } = useQuery<MenuItem & { cost: any }>({
    queryKey: ["menu-item", id],
    queryFn: () => api.get(`/menu-items/${id}`),
  });
  const { data: products } = useQuery<Product[]>({ queryKey: ["products"], queryFn: () => api.get("/products") });
  const { data: units } = useQuery<Unit[]>({ queryKey: ["units"], queryFn: () => api.get("/units") });

  const [rows, setRows] = useState<IngredientRow[]>([]);
  const [showModifier, setShowModifier] = useState(false);

  useEffect(() => {
    if (menuItem?.recipe) {
      setRows(menuItem.recipe.ingredients.map((i) => ({ productId: i.productId, quantity: String(i.quantity), unitCode: i.unitCode })));
    }
  }, [menuItem?.id]);

  const saveRecipe = useMutation({
    mutationFn: () =>
      api.put(`/menu-items/${id}/recipe`, {
        ingredients: rows.filter((r) => r.productId && r.quantity).map((r) => ({ productId: r.productId, quantity: Number(r.quantity), unitCode: r.unitCode })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["menu-item", id] });
      qc.invalidateQueries({ queryKey: ["menu-item-costs"] });
    },
  });

  const deleteModifier = useMutation({
    mutationFn: (modifierId: string) => api.delete(`/menu-items/modifiers/${modifierId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu-item", id] }),
  });

  if (isLoading || !menuItem) return <Spinner />;

  const addRow = () => setRows([...rows, { productId: "", quantity: "", unitCode: "" }]);
  const updateRow = (i: number, patch: Partial<IngredientRow>) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows(rows.filter((_, idx) => idx !== i));

  return (
    <div>
      <PageHeader title={menuItem.name} subtitle={`${money(menuItem.sellingPrice)} · Food cost ${pct(menuItem.cost?.foodCostPct)}`} />

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Base recipe (ingredients)</h2>
          <button className="btn-primary" onClick={() => saveRecipe.mutate()} disabled={saveRecipe.isPending}>
            {saveRecipe.isPending ? "Saving…" : "Save recipe"}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select className="input flex-1" value={row.productId} onChange={(e) => updateRow(i, { productId: e.target.value })}>
                <option value="">Ingredient…</option>
                {products?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="any"
                className="input w-24"
                placeholder="Qty"
                value={row.quantity}
                onChange={(e) => updateRow(i, { quantity: e.target.value })}
              />
              <select className="input w-28" value={row.unitCode} onChange={(e) => updateRow(i, { unitCode: e.target.value })}>
                <option value="">Unit…</option>
                {units?.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.code}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-secondary px-3" onClick={() => removeRow(i)}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn-secondary mt-3" onClick={addRow}>
          + Add ingredient
        </button>
      </div>

      <div className="card mt-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Modifiers</h2>
          <button className="btn-secondary" onClick={() => setShowModifier(true)}>
            + Add modifier
          </button>
        </div>
        {menuItem.modifiers.length === 0 ? (
          <p className="text-sm text-slate-500">No modifiers yet — e.g. "Extra Cheese" that adds ingredient consumption on top of the base recipe.</p>
        ) : (
          <div className="flex flex-col divide-y divide-slate-100">
            {menuItem.modifiers.map((mod) => (
              <div key={mod.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">{mod.name}</div>
                  <div className="text-xs text-slate-500">
                    {mod.ingredients.map((i) => `${i.quantity} ${i.unitCode} ${i.product?.name}`).join(", ") || "No ingredient impact"}
                  </div>
                </div>
                <button className="text-sm text-rose-600" onClick={() => deleteModifier.mutate(mod.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {menuItem.cost?.lines?.length > 0 && (
        <div className="card mt-6 p-5">
          <h2 className="mb-3 font-bold">Cost breakdown</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {menuItem.cost.lines.map((l: any) => (
                <tr key={l.productId}>
                  <td className="py-1.5">{l.productName}</td>
                  <td className="py-1.5 text-slate-500">
                    {l.quantity} {l.unitCode}
                  </td>
                  <td className="py-1.5 text-right font-medium">{money(l.cost)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1.5 font-bold" colSpan={2}>
                  Total recipe cost
                </td>
                <td className="py-1.5 text-right font-bold">{money(menuItem.cost.recipeCost)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <AddModifierModal
        open={showModifier}
        onClose={() => setShowModifier(false)}
        menuItemId={id!}
        products={products ?? []}
        units={units ?? []}
        onCreated={() => qc.invalidateQueries({ queryKey: ["menu-item", id] })}
      />
    </div>
  );
}

function AddModifierModal({
  open,
  onClose,
  menuItemId,
  products,
  units,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  menuItemId: string;
  products: Product[];
  units: Unit[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState<IngredientRow[]>([{ productId: "", quantity: "", unitCode: "" }]);

  const create = useMutation({
    mutationFn: () =>
      api.post(`/menu-items/${menuItemId}/modifiers`, {
        name,
        ingredients: rows.filter((r) => r.productId && r.quantity).map((r) => ({ productId: r.productId, quantity: Number(r.quantity), unitCode: r.unitCode })),
      }),
    onSuccess: () => {
      onCreated();
      onClose();
      setName("");
      setRows([{ productId: "", quantity: "", unitCode: "" }]);
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Add modifier">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <label className="label">Modifier name</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Extra Cheese" />
        </div>
        <label className="label">Extra ingredients consumed</label>
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <select
              className="input flex-1"
              value={row.productId}
              onChange={(e) => setRows(rows.map((r, idx) => (idx === i ? { ...r, productId: e.target.value } : r)))}
            >
              <option value="">Ingredient…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="any"
              className="input w-20"
              placeholder="Qty"
              value={row.quantity}
              onChange={(e) => setRows(rows.map((r, idx) => (idx === i ? { ...r, quantity: e.target.value } : r)))}
            />
            <select
              className="input w-24"
              value={row.unitCode}
              onChange={(e) => setRows(rows.map((r, idx) => (idx === i ? { ...r, unitCode: e.target.value } : r)))}
            >
              <option value="">Unit…</option>
              {units.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.code}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button type="button" className="btn-secondary self-start" onClick={() => setRows([...rows, { productId: "", quantity: "", unitCode: "" }])}>
          + Add ingredient
        </button>
        <button className="btn-primary" disabled={create.isPending}>
          {create.isPending ? "Saving…" : "Add modifier"}
        </button>
      </form>
    </Modal>
  );
}
