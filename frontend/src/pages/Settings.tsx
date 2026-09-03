import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { AppSettings } from "../types";
import { PageHeader, Spinner } from "../components/ui";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card mb-6 p-5">
      <h2 className="mb-4 font-bold">{title}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input type="checkbox" className="h-5 w-5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function Settings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<AppSettings>({ queryKey: ["settings"], queryFn: () => api.get("/settings") });
  const [form, setForm] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.patch("/settings", form),
    onSuccess: (updated: any) => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (isLoading || !form) return <Spinner />;
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setForm({ ...form, [key]: value });

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Restaurant profile, inventory behavior, and notification preferences" />

      <Section title="Restaurant">
        <div>
          <label className="label">Restaurant name</label>
          <input className="input" value={form.restaurantName} onChange={(e) => set("restaurantName", e.target.value)} />
        </div>
        <div>
          <label className="label">Currency</label>
          <input className="input" value={form.currency} onChange={(e) => set("currency", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Address</label>
          <input className="input" value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div>
          <label className="label">Time zone</label>
          <input className="input" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="America/New_York" />
        </div>
      </Section>

      <Section title="Inventory">
        <div>
          <label className="label">Default inventory unit</label>
          <input className="input" value={form.defaultInventoryUnitCode} onChange={(e) => set("defaultInventoryUnitCode", e.target.value)} />
        </div>
        <div>
          <label className="label">Variance threshold (%)</label>
          <input
            type="number"
            className="input"
            value={form.varianceThresholdPct}
            onChange={(e) => set("varianceThresholdPct", Number(e.target.value))}
          />
          <p className="mt-1 text-xs text-slate-400">Variance beyond this % is flagged as "requires investigation".</p>
        </div>
        <div className="sm:col-span-2">
          <Toggle label="Alert when items fall below par/reorder level" checked={form.lowStockNotify} onChange={(v) => set("lowStockNotify", v)} />
        </div>
        <div className="sm:col-span-2">
          <Toggle
            label="Require every product to be counted before a physical count can be completed"
            checked={form.countRequiresFullList}
            onChange={(v) => set("countRequiresFullList", v)}
          />
        </div>
      </Section>

      <Section title="Food Cost">
        <div>
          <label className="label">Cost calculation method</label>
          <select className="input" value={form.costMethod} onChange={(e) => set("costMethod", e.target.value as AppSettings["costMethod"])}>
            <option value="WEIGHTED_AVERAGE">Weighted average cost</option>
            <option value="LAST_COST">Most recent purchase cost</option>
          </select>
        </div>
        <div>
          <label className="label">Food cost target (%)</label>
          <input
            type="number"
            className="input"
            value={form.foodCostTargetPct}
            onChange={(e) => set("foodCostTargetPct", Number(e.target.value))}
          />
          <p className="mt-1 text-xs text-slate-400">Menu items above this % trigger a high food cost alert.</p>
        </div>
      </Section>

      <Section title="Integrations">
        <div className="sm:col-span-2">
          <Link to="/toast" className="btn-secondary inline-flex">
            🔗 Manage Toast POS integration
          </Link>
          <p className="mt-2 text-xs text-slate-400">More POS/integration options will appear here as they're added.</p>
        </div>
      </Section>

      <Section title="Notifications">
        <Toggle label="Low inventory alerts" checked={form.notifyLowStock} onChange={(v) => set("notifyLowStock", v)} />
        <Toggle label="High variance alerts" checked={form.notifyHighVariance} onChange={(v) => set("notifyHighVariance", v)} />
        <Toggle label="Failed Toast sync alerts" checked={form.notifyFailedToastSync} onChange={(v) => set("notifyFailedToastSync", v)} />
        <Toggle label="Unmapped Toast item alerts" checked={form.notifyUnmappedToast} onChange={(v) => set("notifyUnmappedToast", v)} />
      </Section>

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
        {saved && <span className="text-sm text-emerald-600">✅ Saved</span>}
        {save.isError && <span className="text-sm text-rose-600">{(save.error as any)?.message}</span>}
      </div>
    </div>
  );
}
