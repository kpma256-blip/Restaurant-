import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { money, pct, qty } from "../lib/format";
import { Badge, EmptyState, PageHeader, StatCard, StatusDot, Table } from "../components/ui";
import { SkeletonStats } from "../components/Skeleton";
import { useDashboard } from "../hooks/useApi";

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
    { label: "Receive", icon: "➕", onClick: () => navigate("/receive?tab=quick"), color: "bg-blue-50" },
    { label: "Upload Invoice", icon: "📄", onClick: () => navigate("/receive?tab=upload"), color: "bg-green-50" },
    { label: "Add Waste", icon: "🗑️", onClick: () => navigate("/waste"), color: "bg-rose-50" },
    { label: "Adjust Stock", icon: "🔧", onClick: () => navigate("/adjust"), color: "bg-amber-50" },
    { label: "Count", icon: "📋", onClick: () => navigate("/counts"), color: "bg-purple-50" },
    {
      label: syncToast.isPending ? "Syncing…" : "Sync Toast",
      icon: "🔄",
      onClick: () => syncToast.mutate(),
      disabled: syncToast.isPending,
      color: "bg-indigo-50",
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
      {actions.map((a) => (
        <button
          key={a.label}
          onClick={a.onClick}
          disabled={a.disabled}
          className={`card flex flex-col items-center justify-center gap-2 p-3 text-center transition ${a.color} hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50`}
          title={a.label}
        >
          <span className="text-2xl">{a.icon}</span>
          <span className="text-xs font-semibold text-slate-700">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useDashboard();

  if (isLoading || !data) return <SkeletonStats />;

  const lastUpdate = new Date(data.asOf).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`Last updated: ${lastUpdate}`} />

      <QuickActions />

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Inventory value"
          value={money(data.currentInventoryValue)}
          hint="Current on-hand"
        />
        <StatCard
          label="Food cost %"
          value={pct(data.foodCostPercentage || 0)}
          tone={data.foodCostPercentage != null && data.foodCostPercentage > 35 ? "bad" : "good"}
          hint="Last 7 days"
        />
        <StatCard
          label="Received"
          value={money(data.inventoryReceivedThisWeek)}
          tone="good"
          hint="This week"
        />
        <StatCard
          label="Consumed"
          value={money(data.inventoryConsumedThisWeek)}
          hint="Food used"
        />
        <StatCard
          label="Food usage"
          value={money(data.foodUsageValueThisWeek)}
          hint="Theoretical (from sales)"
        />
        <StatCard
          label="Waste"
          value={money(data.wasteValueThisWeek)}
          tone={data.wasteValueThisWeek > 0 ? "warn" : "default"}
          hint="This week"
        />
        <StatCard
          label="Variance"
          value={money(Math.abs(data.inventoryVarianceValue))}
          tone={data.inventoryVarianceValue < 0 ? "bad" : "good"}
          hint="Physical vs theoretical"
        />
        <StatCard
          label="Revenue"
          value={money(data.weekRevenue)}
          hint="This week"
        />
      </div>

      {/* Alerts & Inventory Issues */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Alerts */}
        <section>
          <h2 className="mb-3 text-lg font-bold">
            Alerts <Badge tone={data.alertCounts.critical > 0 ? "red" : "slate"}>
              {data.alertCounts.critical} critical, {data.alertCounts.warning} warning
            </Badge>
          </h2>
          {data.alerts.length === 0 ? (
            <EmptyState>✅ No alerts — inventory looks healthy.</EmptyState>
          ) : (
            <div className="card divide-y divide-slate-100">
              {data.alerts.slice(0, 12).map((a: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3">
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      a.severity === "critical" ? "bg-rose-500" : a.severity === "warning" ? "bg-amber-500" : "bg-blue-500"
                    }`}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800">{a.message}</div>
                    {a.value != null && <div className="mt-1 text-xs text-slate-500">Value: {money(a.value)}</div>}
                  </div>
                  <Badge tone={a.severity === "critical" ? "red" : a.severity === "warning" ? "amber" : "blue"}>
                    {a.type.replace(/_/g, " ")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Low Stock */}
        <section>
          <h2 className="mb-3 text-lg font-bold">Low stock ({data.lowStockItems.length})</h2>
          {data.lowStockItems.length === 0 ? (
            <EmptyState>Everything is at or above par. ✓</EmptyState>
          ) : (
            <Table>
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">On hand</th>
                  <th className="px-3 py-2 text-right">Par</th>
                  <th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.lowStockItems.slice(0, 8).map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link to={`/products/${p.id}`} className="font-medium text-brand-700 hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right text-sm">
                      {qty(p.currentQuantity)} <span className="text-xs text-slate-500">{p.inventoryUnitCode}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-slate-600">
                      {qty(p.parLevel)} <span className="text-xs text-slate-500">{p.inventoryUnitCode}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <StatusDot status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        {/* Negative Inventory */}
        <section>
          <h2 className="mb-3 text-lg font-bold">Negative inventory ({data.negativeInventoryItems.length})</h2>
          {data.negativeInventoryItems.length === 0 ? (
            <EmptyState>No products are negative. ✓</EmptyState>
          ) : (
            <Table>
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.negativeInventoryItems.map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link to={`/products/${p.id}`} className="font-medium text-brand-700 hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-rose-600">
                      {qty(p.currentQuantity)} {p.inventoryUnitCode}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        {/* Largest Variances */}
        <section>
          <h2 className="mb-3 text-lg font-bold">Largest variances</h2>
          {data.largestVariances.length === 0 ? (
            <EmptyState>No physical counts completed in the last 7 days yet.</EmptyState>
          ) : (
            <Table>
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Theory</th>
                  <th className="px-3 py-2 text-right">Physical</th>
                  <th className="px-3 py-2 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.largestVariances.slice(0, 8).map((v: any) => (
                  <tr key={v.productId} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{v.productName}</td>
                    <td className="px-3 py-2 text-right text-sm">{qty(v.theoreticalEndingInventory)}</td>
                    <td className="px-3 py-2 text-right text-sm">{qty(v.physicalEndingInventory)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-semibold text-sm ${v.requiresInvestigation ? "text-rose-600" : "text-slate-700"}`}>
                        {qty(v.variance)} ({pct(v.variancePct)})
                        {v.requiresInvestigation && " ⚠️"}
                      </span>
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
