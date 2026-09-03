import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { ReceivingDetail as ReceivingDetailType } from "../types";
import { PageHeader, Spinner, StatCard, Table } from "../components/ui";
import { dateStr, money, qty } from "../lib/format";

export default function ReceivingDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery<ReceivingDetailType>({ queryKey: ["receiving", id], queryFn: () => api.get(`/receiving/${id}`) });

  if (isLoading || !data) return <Spinner />;

  return (
    <div>
      <PageHeader
        title={`Receiving — ${dateStr(data.purchaseDate)}`}
        subtitle={data.supplier?.name ?? "No supplier specified"}
        action={
          data.invoiceFileStoragePath ? (
            <a href={`/api/receiving/${id}/invoice-file`} target="_blank" rel="noreferrer" className="btn-secondary">
              📄 View original invoice
            </a>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Invoice #" value={data.invoiceNumber ?? "—"} />
        <StatCard label="Products" value={data.items.length} />
        <StatCard label="Total cost" value={money(data.totalCost)} />
        <StatCard label="Received by" value={data.createdByUser?.name ?? "—"} />
      </div>

      {data.notes && <p className="mt-4 text-sm text-slate-500">{data.notes}</p>}

      <h2 className="mb-2 mt-6 text-lg font-bold">Products received</h2>
      <Table>
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Product</th>
            {data.items.some((i) => i.rawDescription) && <th className="px-3 py-2">Invoice text</th>}
            <th className="px-3 py-2">Qty</th>
            <th className="px-3 py-2">Unit cost</th>
            <th className="px-3 py-2">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.items.map((item) => (
            <tr key={item.id}>
              <td className="px-3 py-2 font-medium">{item.product.name}</td>
              {data.items.some((i) => i.rawDescription) && <td className="px-3 py-2 text-slate-400">{item.rawDescription ?? "—"}</td>}
              <td className="px-3 py-2">
                {qty(item.quantity)} {item.unitCode}
              </td>
              <td className="px-3 py-2">{money(item.unitCost)}</td>
              <td className="px-3 py-2 font-medium">{money(item.totalCost)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
