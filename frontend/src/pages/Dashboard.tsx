import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { DashboardData } from "../types";
import { money, pct, qty } from "../lib/format";
import { Badge, EmptyState, PageHeader, Spinner, StatCard, StatusDot, Table } from "../components/ui";

function QuickActions() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const syncToast = useMutation({
    mutationFn: () => api.post("/toast/sync"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["toast-status"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const actions = [
    { label: "Receive Inventory", icon: "➕", onClick: () => navigate("/receive?tab=quick") },
    { label: "Upload Invoice", icon: "📄", onClick: () => navigate("/receive?tab=upload") },
    { label: "Record Waste", icon: "🗑️", onClick: () => navigate("/waste") },
    { label: "Inventory Count", icon: "📋", onClick: () => navigate("/counts") },
    {
      label: syncToast.isPending ? "Syncing…" : syncToast.isSuccess ? "Synced ✓" : "Sync Toast",
      icon: "🔄",
      onClick: () => syncToast.mutate(),
      disabled: syncToast.isPending,
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
      {actions.map((a) => (
        <button
          key={a.label}
          onClick={a.onClick}
          disabled={a.disabled}
          className="card flex flex-col items-center justify-center gap-1.5 p-4 text-center transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60"
        >
          <span className="text-2xl">{a.icon}</span>
          <span className="text-sm font-semibold text-slate-700">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => api.get("/dashboard"),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) return <Spinner />;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`As of ${new Date(data.asOf).toLocaleString()}`} />

      <QuickActions />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Current inventory value" value={money(data.currentInventoryValue)} />
        <StatCard
          label="Food cost %"
          value={pct(data.foodCostPercentage)}
          tone={data.foodCostPercentage != null && data.foodCostPercentage > 35 ? "bad" : "good"}
          hint="Last 7 days"
        />
        <StatCard label="Received this week" value={money(data.inventoryReceivedThisWeek)} tone="good" />
        <StatCard label="Consumed this week" value={money(data.inventoryConsumedThisWeek)} />
        <StatCard label="Estimated food usage" value={money(data.foodUsageValueThisWeek)} hint="Theoretical, from sales" />
        <StatCard label="Waste this week" value={money(data.wasteValueThisWeek)} tone={data.wasteValueThisWeek > 0 ? "warn" : "default"} />
        <StatCard
          label="Inventory variance"
          value={money(data.inventoryVarianceValue)}
          tone={data.inventoryVarianceValue < 0 ? "bad" : "good"}
          hint="Physical vs theoretical, counted items"
        />
        <StatCard label="Revenue this week" value={money(data.weekRevenue)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-lg font-bold">Alerts ({data.alerts.length})</h2>
          {data.alerts.length === 0 ? (
            <EmptyState>✅ No active alerts — inventory looks healthy.</EmptyState>
          ) : (
            <div className="card divide-y divide-slate-100">
              {data.alerts.slice(0, 12).map((a, i) => (
                <div key={i} className="flex items-start gap-3 p-3">
                  <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${a.severity === "critical" ? "bg-rose-500" : "bg-amber-500"}`} />
                  <div className="flex-1 text-sm">
                    <div className="font-medium text-slate-800">{a.message}</div>
                  </div>
                  <Badge tone={a.severity === "critical" ? "red" : "amber"}>{a.type.replace(/_/g, " ")}</Badge>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold">Low stock items</h2>
          {data.lowStockItems.length === 0 ? (
            <EmptyState>Everything is at or above par.</EmptyState>
          ) : (
            <Table>
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">On hand</th>
                  <th className="px-3 py-2">Par</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.lowStockItems.slice(0, 8).map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <Link to={`/products/${p.id}`} className="font-medium text-brand-700 hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {qty(p.currentQuantity)} {p.inventoryUnitCode}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {qty(p.parLevel)} {p.inventoryUnitCode}
                    </td>
                    <td className="px-3 py-2">
                      <StatusDot status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold">Negative inventory</h2>
          {data.negativeInventoryItems.length === 0 ? (
            <EmptyState>No products are negative. 👍</EmptyState>
          ) : (
            <Table>
              <tbody className="divide-y divide-slate-100">
                {data.negativeInventoryItems.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <Link to={`/products/${p.id}`} className="font-medium text-brand-700 hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-semibold text-rose-600">
                      {qty(p.currentQuantity)} {p.inventoryUnitCode}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold">Largest variances (theoretical vs actual)</h2>
          {data.largestVariances.length === 0 ? (
            <EmptyState>No physical counts completed in the last 7 days yet.</EmptyState>
          ) : (
            <Table>
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Theoretical</th>
                  <th className="px-3 py-2">Physical</th>
                  <th className="px-3 py-2">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.largestVariances.slice(0, 8).map((v) => (
                  <tr key={v.productId}>
                    <td className="px-3 py-2 font-medium">{v.productName}</td>
                    <td className="px-3 py-2">
                      {qty(v.theoreticalEndingInventory)} {v.unitCode}
                    </td>
                    <td className="px-3 py-2">
                      {qty(v.physicalEndingInventory)} {v.unitCode}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`font-semibold ${v.requiresInvestigation ? "text-rose-600" : "text-slate-700"}`}>
                        {qty(v.variance)} ({pct(v.variancePct)})
                      </span>
                      {v.requiresInvestigation && <span className="ml-1">⚠️</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      </div>
    </div>
  );
}
