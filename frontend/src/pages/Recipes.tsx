import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { MenuItem, MenuItemCost } from "../types";
import { Badge, Modal, PageHeader, Table } from "../components/ui";
import { money, pct } from "../lib/format";

export default function Recipes() {
  const qc = useQueryClient();
  const { data: menuItems } = useQuery<MenuItem[]>({ queryKey: ["menu-items"], queryFn: () => api.get("/menu-items") });
  const { data: costs } = useQuery<MenuItemCost[]>({ queryKey: ["menu-item-costs"], queryFn: () => api.get("/menu-items/costs") });
  const [showNew, setShowNew] = useState(false);

  const costById = new Map((costs ?? []).map((c) => [c.menuItemId, c]));

  return (
    <div>
      <PageHeader
        title="Recipes & menu items"
        subtitle="Define the bill of materials each menu item consumes — sales use this to deduct inventory automatically"
        action={
          <button className="btn-primary" onClick={() => setShowNew(true)}>
            + New menu item
          </button>
        }
      />

      <Table>
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Menu item</th>
            <th className="px-3 py-2">Price</th>
            <th className="px-3 py-2">Recipe cost</th>
            <th className="px-3 py-2">Food cost %</th>
            <th className="px-3 py-2">Ingredients</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {menuItems?.map((m) => {
            const cost = costById.get(m.id);
            const high = cost?.foodCostPct != null && cost.foodCostPct > 35;
            return (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link to={`/recipes/${m.id}`} className="font-medium text-brand-700 hover:underline">
                    {m.name}
                  </Link>
                  {m.toastMapping && <Badge tone="blue">Toast mapped</Badge>}
                </td>
                <td className="px-3 py-2">{money(m.sellingPrice)}</td>
                <td className="px-3 py-2">{money(cost?.recipeCost)}</td>
                <td className="px-3 py-2">
                  <span className={high ? "font-semibold text-rose-600" : ""}>{pct(cost?.foodCostPct)}</span>
                </td>
                <td className="px-3 py-2 text-slate-500">{m.recipe?.ingredients.length ?? 0} ingredients, {m.modifiers.length} modifiers</td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <NewMenuItemModal open={showNew} onClose={() => setShowNew(false)} onCreated={() => qc.invalidateQueries({ queryKey: ["menu-items"] })} />
    </div>
  );
}

function NewMenuItemModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [categoryLabel, setCategoryLabel] = useState("");

  const create = useMutation({
    mutationFn: () => api.post("/menu-items", { name, sellingPrice: Number(sellingPrice), categoryLabel: categoryLabel || undefined, ingredients: [] }),
    onSuccess: () => {
      onCreated();
      onClose();
      setName("");
      setSellingPrice("");
      setCategoryLabel("");
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="New menu item">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <label className="label">Name</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Selling price</label>
          <input type="number" step="any" min="0" className="input" required value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
        </div>
        <div>
          <label className="label">Category label (optional)</label>
          <input className="input" value={categoryLabel} onChange={(e) => setCategoryLabel(e.target.value)} placeholder="e.g. Sandwiches" />
        </div>
        <p className="text-xs text-slate-500">You can add ingredients on the next screen after creating this item.</p>
        <button className="btn-primary" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create menu item"}
        </button>
      </form>
    </Modal>
  );
}
