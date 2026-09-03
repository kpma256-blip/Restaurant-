import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { InventoryCount } from "../types";
import { Badge, PageHeader, Spinner, Table } from "../components/ui";
import { dateStr, pct, qty } from "../lib/format";

export default function CountDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: count, isLoading } = useQuery<InventoryCount>({ queryKey: ["count", id], queryFn: () => api.get(`/inventory/counts/${id}`) });
  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  const setPhysical = useMutation({
    mutationFn: ({ itemId, physicalQuantity }: { itemId: string; physicalQuantity: number }) =>
      api.patch(`/inventory/counts/${id}/items/${itemId}`, { physicalQuantity }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["count", id] }),
  });

  const complete = useMutation({
    mutationFn: (allowPartial: boolean) => api.post(`/inventory/counts/${id}/complete${allowPartial ? "?allowPartial=true" : ""}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["count", id] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (isLoading || !count) return <Spinner />;

  const isCompleted = count.status === "COMPLETED";
  const uncounted = count.items.filter((i) => i.physicalQuantity == null).length;

  return (
    <div>
      <PageHeader
        title={`Physical count — ${dateStr(count.countDate)}`}
        subtitle={`${count.items.length} items · ${count.status}`}
        action={
          !isCompleted && (
            <button
              className="btn-primary"
              disabled={complete.isPending}
              onClick={() => complete.mutate(uncounted > 0 && confirm(`${uncounted} item(s) not counted yet — skip them and complete anyway?`))}
            >
              {complete.isPending ? "Completing…" : "Complete count"}
            </button>
          )
        }
      />

      {complete.isError && <div className="mb-3 text-sm text-rose-600">{(complete.error as any)?.message}</div>}

      <p className="mb-3 text-sm text-slate-500">
        Theoretical inventory = beginning + purchases + theoretical sales consumption + recorded waste ± adjustments, computed straight
        from the ledger. Enter what you actually counted — variance beyond ±10% is flagged for investigation.
      </p>

      <Table>
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Product</th>
            <th className="px-3 py-2">Theoretical</th>
            <th className="px-3 py-2">Physical count</th>
            <th className="px-3 py-2">Variance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {count.items.map((item) => {
            const flagged = item.variancePct != null && Math.abs(item.variancePct) > 10;
            return (
              <tr key={item.id}>
                <td className="px-3 py-2 font-medium">{item.product?.name}</td>
                <td className="px-3 py-2 text-slate-500">
                  {qty(item.theoreticalQuantity)} {item.unitCode}
                </td>
                <td className="px-3 py-2">
                  {isCompleted ? (
                    <span>
                      {qty(item.physicalQuantity)} {item.unitCode}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="any"
                        className="input w-28"
                        placeholder={qty(item.theoreticalQuantity)}
                        value={localValues[item.id] ?? item.physicalQuantity ?? ""}
                        onChange={(e) => setLocalValues({ ...localValues, [item.id]: e.target.value })}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== "" && !Number.isNaN(Number(v))) {
                            setPhysical.mutate({ itemId: item.id, physicalQuantity: Number(v) });
                          }
                        }}
                      />
                      <span className="text-xs text-slate-400">{item.unitCode}</span>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {item.varianceQty != null ? (
                    <span className={`font-semibold ${flagged ? "text-rose-600" : "text-slate-700"}`}>
                      {qty(item.varianceQty)} ({pct(item.variancePct)}) {flagged && "⚠️"}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                  {flagged && <Badge tone="red">Investigate</Badge>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
