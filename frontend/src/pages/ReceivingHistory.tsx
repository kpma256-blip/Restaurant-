import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { ReceivingListItem } from "../types";
import { Badge, EmptyState, PageHeader, Table } from "../components/ui";
import { dateStr, money } from "../lib/format";

export default function ReceivingHistory() {
  const { data, isLoading } = useQuery<ReceivingListItem[]>({ queryKey: ["receiving-history"], queryFn: () => api.get("/receiving") });

  return (
    <div>
      <PageHeader
        title="Receiving history"
        subtitle="Every delivery received, manual or from an uploaded invoice"
        action={
          <Link to="/receive" className="btn-primary">
            + Receive Inventory
          </Link>
        }
      />

      {isLoading ? (
        <div className="p-8 text-slate-400">Loading…</div>
      ) : !data || data.length === 0 ? (
        <EmptyState>No receiving records yet.</EmptyState>
      ) : (
        <Table>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2">Invoice #</th>
              <th className="px-3 py-2">Products</th>
              <th className="px-3 py-2">Total cost</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link to={`/receiving/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {dateStr(r.purchaseDate)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-500">{r.supplier ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500">{r.invoiceNumber ?? "—"}</td>
                <td className="px-3 py-2">{r.itemCount}</td>
                <td className="px-3 py-2 font-medium">{money(r.totalCost)}</td>
                <td className="px-3 py-2">
                  <Badge tone={r.sourceType === "PDF_UPLOAD" ? "blue" : "slate"}>{r.sourceType === "PDF_UPLOAD" ? "📄 PDF Invoice" : "✍️ Manual"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
