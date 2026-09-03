import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { InventoryCount } from "../types";
import { Badge, PageHeader, Table } from "../components/ui";
import { dateStr, toInputDate } from "../lib/format";

export default function Counts() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: counts } = useQuery<InventoryCount[]>({ queryKey: ["counts"], queryFn: () => api.get("/inventory/counts") });
  const [countDate, setCountDate] = useState(toInputDate(new Date()));

  const create = useMutation({
    mutationFn: () => api.post<InventoryCount>("/inventory/counts", { countDate }),
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["counts"] });
      navigate(`/counts/${count.id}`);
    },
  });

  return (
    <div>
      <PageHeader
        title="Physical inventory counts"
        subtitle="Compare a physical count against theoretical inventory to find variance"
        action={
          <div className="flex items-center gap-2">
            <input type="date" className="input w-40" value={countDate} onChange={(e) => setCountDate(e.target.value)} />
            <button className="btn-primary" onClick={() => create.mutate()} disabled={create.isPending}>
              + New count
            </button>
          </div>
        }
      />

      <Table>
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Items</th>
            <th className="px-3 py-2">Counted by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {counts?.map((c) => (
            <tr key={c.id} className="cursor-pointer hover:bg-slate-50">
              <td className="px-3 py-2">
                <Link to={`/counts/${c.id}`} className="font-medium text-brand-700 hover:underline">
                  {dateStr(c.countDate)}
                </Link>
              </td>
              <td className="px-3 py-2">
                <Badge tone={c.status === "COMPLETED" ? "green" : "amber"}>{c.status}</Badge>
              </td>
              <td className="px-3 py-2 text-slate-500">{c.items.length}</td>
              <td className="px-3 py-2 text-slate-500">{c.countedByUser?.name ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
