import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Category } from "../types";
import { PageHeader, Table } from "../components/ui";
import { money, pct, qty, toInputDate } from "../lib/format";

const REPORT_TYPES = [
  { key: "usage", label: "Inventory usage" },
  { key: "food-cost", label: "Food cost" },
  { key: "variance", label: "Theoretical vs actual (variance)" },
  { key: "waste", label: "Waste" },
  { key: "purchases", label: "Purchases" },
  { key: "valuation", label: "Inventory valuation" },
  { key: "menu-profitability", label: "Menu item profitability" },
] as const;

export default function Reports() {
  const [type, setType] = useState<(typeof REPORT_TYPES)[number]["key"]>("variance");
  const [from, setFrom] = useState(toInputDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(toInputDate(new Date()));
  const [categoryId, setCategoryId] = useState("");
  const [granularity, setGranularity] = useState<"daily" | "weekly" | "monthly">("daily");

  const { data: categories } = useQuery<Category[]>({ queryKey: ["categories"], queryFn: () => api.get("/categories") });

  const params = new URLSearchParams({ from: new Date(from).toISOString(), to: new Date(to).toISOString() });
  if (categoryId) params.set("categoryId", categoryId);
  if (type === "usage") params.set("granularity", granularity);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["report", type, from, to, categoryId, granularity],
    queryFn: () => api.get(`/reports/${type}?${params.toString()}`),
  });

  return (
    <div>
      <PageHeader title="Reports" subtitle="Daily, weekly, and monthly views — filter by date range and category" />

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input max-w-xs" value={type} onChange={(e) => setType(e.target.value as any)}>
          {REPORT_TYPES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <input type="date" className="input w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="input w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        <select className="input max-w-[200px]" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {type === "usage" && (
          <select className="input w-36" value={granularity} onChange={(e) => setGranularity(e.target.value as any)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        )}
      </div>

      {isLoading || !data ? (
        <div className="p-8 text-slate-400">Loading…</div>
      ) : (
        <ReportBody type={type} data={data} />
      )}
    </div>
  );
}

function ReportBody({ type, data }: { type: string; data: any }) {
  if (type === "usage") {
    return (
      <Table>
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Period</th>
            <th className="px-3 py-2">Sales usage</th>
            <th className="px-3 py-2">Waste</th>
            <th className="px-3 py-2">Total usage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.rows.map((r: any) => (
            <tr key={r.date}>
              <td className="px-3 py-2 font-medium">{r.date}</td>
              <td className="px-3 py-2">{qty(r.salesUsage)}</td>
              <td className="px-3 py-2">{qty(r.waste)}</td>
              <td className="px-3 py-2 font-semibold">{qty(r.totalUsage)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  }

  if (type === "food-cost") {
    return (
      <div>
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="card p-4">
            <div className="text-xs uppercase text-slate-500">Revenue</div>
            <div className="text-xl font-bold">{money(data.revenue)}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs uppercase text-slate-500">Ingredient cost</div>
            <div className="text-xl font-bold">{money(data.ingredientCost)}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs uppercase text-slate-500">Food cost %</div>
            <div className="text-xl font-bold">{pct(data.foodCostPercentage)}</div>
          </div>
        </div>
        <Table>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Revenue</th>
              <th className="px-3 py-2">Ingredient cost</th>
              <th className="px-3 py-2">Food cost %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.trend.map((r: any) => (
              <tr key={r.date}>
                <td className="px-3 py-2 font-medium">{r.date}</td>
                <td className="px-3 py-2">{money(r.revenue)}</td>
                <td className="px-3 py-2">{money(r.ingredientCost)}</td>
                <td className="px-3 py-2">{pct(r.foodCostPercentage)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    );
  }

  if (type === "variance") {
    return (
      <Table>
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Product</th>
            <th className="px-3 py-2">Beginning</th>
            <th className="px-3 py-2">Purchases</th>
            <th className="px-3 py-2">Consumption</th>
            <th className="px-3 py-2">Waste</th>
            <th className="px-3 py-2">Theoretical end</th>
            <th className="px-3 py-2">Physical end</th>
            <th className="px-3 py-2">Variance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((v: any) => (
            <tr key={v.productId} className={v.requiresInvestigation ? "bg-rose-50" : undefined}>
              <td className="px-3 py-2 font-medium">{v.productName}</td>
              <td className="px-3 py-2">{qty(v.beginningInventory)}</td>
              <td className="px-3 py-2">{qty(v.purchases)}</td>
              <td className="px-3 py-2">{qty(v.theoreticalConsumption)}</td>
              <td className="px-3 py-2">{qty(v.recordedWaste)}</td>
              <td className="px-3 py-2 font-medium">{qty(v.theoreticalEndingInventory)}</td>
              <td className="px-3 py-2">{qty(v.physicalEndingInventory)}</td>
              <td className="px-3 py-2">
                <span className={`font-semibold ${v.requiresInvestigation ? "text-rose-600" : ""}`}>
                  {qty(v.variance)} ({pct(v.variancePct)}) {v.requiresInvestigation && "⚠️"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  }

  if (type === "waste") {
    return (
      <div>
        <div className="mb-4 card p-4">
          <div className="text-xs uppercase text-slate-500">Total waste value</div>
          <div className="text-xl font-bold text-rose-600">{money(data.totalValue)}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.byReason.map((r: any) => (
              <span key={r.reason} className="badge bg-rose-50 text-rose-700">
                {r.reason.replace(/_/g, " ")}: {money(r.value)}
              </span>
            ))}
          </div>
        </div>
        <Table>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.records.map((r: any) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-slate-500">{new Date(r.wasteDate).toLocaleDateString()}</td>
                <td className="px-3 py-2 font-medium">{r.product?.name}</td>
                <td className="px-3 py-2">
                  {qty(r.quantity)} {r.unitCode}
                </td>
                <td className="px-3 py-2 text-slate-500">{r.reason.replace(/_/g, " ")}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    );
  }

  if (type === "purchases") {
    return (
      <div>
        <div className="mb-4 card p-4">
          <div className="text-xs uppercase text-slate-500">Total purchase cost</div>
          <div className="text-xl font-bold">{money(data.totalCost)}</div>
        </div>
        <Table>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2">Items</th>
              <th className="px-3 py-2">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.purchases.map((p: any) => (
              <tr key={p.id}>
                <td className="px-3 py-2 text-slate-500">{new Date(p.purchaseDate).toLocaleDateString()}</td>
                <td className="px-3 py-2">{p.supplier?.name ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500">{p.items.map((i: any) => i.product.name).join(", ")}</td>
                <td className="px-3 py-2 font-medium">{money(p.items.reduce((s: number, i: any) => s + i.totalCost, 0))}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    );
  }

  if (type === "valuation") {
    return (
      <div>
        <div className="mb-4 card p-4">
          <div className="text-xs uppercase text-slate-500">Total inventory value</div>
          <div className="text-xl font-bold">{money(data.total)}</div>
        </div>
        <Table>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Unit cost</th>
              <th className="px-3 py-2">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.lines.map((l: any) => (
              <tr key={l.productId}>
                <td className="px-3 py-2 font-medium">{l.productName}</td>
                <td className="px-3 py-2 text-slate-500">{l.category}</td>
                <td className="px-3 py-2">
                  {qty(l.quantity)} {l.unitCode}
                </td>
                <td className="px-3 py-2">{money(l.unitCost)}</td>
                <td className="px-3 py-2 font-medium">{money(l.value)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    );
  }

  if (type === "menu-profitability") {
    return (
      <Table>
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Menu item</th>
            <th className="px-3 py-2">Units sold</th>
            <th className="px-3 py-2">Revenue</th>
            <th className="px-3 py-2">Ingredient cost</th>
            <th className="px-3 py-2">Gross profit</th>
            <th className="px-3 py-2">Food cost %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.rows.map((r: any) => (
            <tr key={r.menuItemId ?? r.name}>
              <td className="px-3 py-2 font-medium">{r.name}</td>
              <td className="px-3 py-2">{r.unitsSold}</td>
              <td className="px-3 py-2">{money(r.revenue)}</td>
              <td className="px-3 py-2">{money(r.ingredientCost)}</td>
              <td className="px-3 py-2 font-semibold text-emerald-600">{money(r.grossProfit)}</td>
              <td className="px-3 py-2">{pct(r.foodCostPercentage)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  }

  return null;
}
