import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { MenuItem, Sale } from "../types";
import { PageHeader, Table } from "../components/ui";
import { dateStr, money, toInputDate } from "../lib/format";

interface LineItem {
  menuItemId: string;
  quantity: number;
  modifierNames: string[];
}

export default function Sales() {
  const qc = useQueryClient();
  const { data: menuItems } = useQuery<MenuItem[]>({ queryKey: ["menu-items"], queryFn: () => api.get("/menu-items") });
  const { data: sales } = useQuery<Sale[]>({ queryKey: ["sales"], queryFn: () => api.get("/sales") });

  const [saleDate, setSaleDate] = useState(toInputDate(new Date()));
  const [lines, setLines] = useState<LineItem[]>([{ menuItemId: "", quantity: 1, modifierNames: [] }]);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const addLine = () => setLines([...lines, { menuItemId: "", quantity: 1, modifierNames: [] }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, patch: Partial<LineItem>) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submit = useMutation({
    mutationFn: () =>
      api.post("/sales", {
        saleDate,
        items: lines
          .filter((l) => l.menuItemId)
          .map((l) => ({
            menuItemId: l.menuItemId,
            quantity: l.quantity,
            modifiers: l.modifierNames.map((name) => ({ name })),
          })),
      }),
    onSuccess: (sale: any) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setConfirmation(`Sale recorded — $${sale.totalAmount.toFixed(2)}. Ingredients deducted from inventory automatically.`);
      setLines([{ menuItemId: "", quantity: 1, modifierNames: [] }]);
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setConfirmation(null);
    submit.mutate();
  };

  return (
    <div>
      <PageHeader title="Sales" subtitle="Enter sales manually — ingredients are deducted automatically from each item's recipe" />

      <div className="grid gap-6 lg:grid-cols-2">
        <form className="card flex flex-col gap-4 p-5" onSubmit={onSubmit}>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
          </div>

          <div className="flex flex-col gap-3">
            {lines.map((line, i) => {
              const menuItem = menuItems?.find((m) => m.id === line.menuItemId);
              return (
                <div key={i} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex gap-2">
                    <select
                      className="input flex-1"
                      value={line.menuItemId}
                      onChange={(e) => updateLine(i, { menuItemId: e.target.value, modifierNames: [] })}
                    >
                      <option value="">Menu item…</option>
                      {menuItems?.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} (${m.sellingPrice.toFixed(2)})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      className="input w-24"
                      value={line.quantity}
                      onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                    />
                    {lines.length > 1 && (
                      <button type="button" className="btn-secondary px-3" onClick={() => removeLine(i)}>
                        ✕
                      </button>
                    )}
                  </div>
                  {menuItem && menuItem.modifiers.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {menuItem.modifiers.map((mod) => (
                        <label key={mod.id} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                          <input
                            type="checkbox"
                            checked={line.modifierNames.includes(mod.name)}
                            onChange={(e) =>
                              updateLine(i, {
                                modifierNames: e.target.checked
                                  ? [...line.modifierNames, mod.name]
                                  : line.modifierNames.filter((n) => n !== mod.name),
                              })
                            }
                          />
                          {mod.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button type="button" className="btn-secondary self-start" onClick={addLine}>
            + Add item
          </button>

          {submit.isError && <div className="text-sm text-rose-600">{(submit.error as any)?.message}</div>}
          {confirmation && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">✅ {confirmation}</div>}

          <button className="btn-primary" disabled={submit.isPending}>
            {submit.isPending ? "Saving…" : "Record sale"}
          </button>
        </form>

        <div>
          <h2 className="mb-2 text-lg font-bold">Recent sales</h2>
          <Table>
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Items</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales?.slice(0, 20).map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 text-slate-500">{dateStr(s.saleDate)}</td>
                  <td className="px-3 py-2">
                    {s.items.map((i) => `${i.quantity}× ${i.menuItemNameSnapshot}`).join(", ")}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{s.source}</td>
                  <td className="px-3 py-2 font-medium">{money(s.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </div>
  );
}
