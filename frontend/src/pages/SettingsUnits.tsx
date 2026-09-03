import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Unit } from "../types";
import { Modal, PageHeader, Spinner, Table } from "../components/ui";

export default function SettingsUnits() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", dimension: "WEIGHT", toBaseFactor: 1 });

  const { data: units, isLoading } = useQuery<Unit[]>({
    queryKey: ["units"],
    queryFn: () => api.get("/units"),
  });

  const create = useMutation({
    mutationFn: () => api.post("/units", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["units"] });
      setForm({ code: "", name: "", dimension: "WEIGHT", toBaseFactor: 1 });
      setShowNew(false);
    },
  });

  const toggle = useMutation({
    mutationFn: (code: string) =>
      api.patch(`/units/${code}`, {
        isActive: !units?.find((u) => u.code === code)?.isActive,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] }),
  });

  const systemUnits = units?.filter((u) => !u.isCustom) ?? [];
  const customUnits = units?.filter((u) => u.isCustom) ?? [];

  if (isLoading) return <Spinner />;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Units of Measurement"
        subtitle="Manage inventory units and create custom units"
        action={
          <button className="btn-primary" onClick={() => setShowNew(true)}>
            + Custom Unit
          </button>
        }
      />

      <div className="space-y-6">
        <div>
          <h3 className="mb-3 font-semibold">System Units</h3>
          <Table>
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Dimension</th>
                <th className="px-3 py-2 text-left">Factor</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {systemUnits.map((u) => (
                <tr key={u.code} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <code className="text-sm">{u.code}</code>
                  </td>
                  <td className="px-3 py-2">{u.name}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{u.dimension}</td>
                  <td className="px-3 py-2 text-sm">{u.toBaseFactor}</td>
                  <td className="px-3 py-2 text-sm">{u.isActive !== false ? "✓ Active" : "○ Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>

        {customUnits.length > 0 && (
          <div>
            <h3 className="mb-3 font-semibold">Custom Units</h3>
            <Table>
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Dimension</th>
                  <th className="px-3 py-2 text-left">Factor</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customUnits.map((u) => (
                  <tr key={u.code} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <code className="text-sm">{u.code}</code>
                    </td>
                    <td className="px-3 py-2">{u.name}</td>
                    <td className="px-3 py-2">{u.dimension}</td>
                    <td className="px-3 py-2">{u.toBaseFactor}</td>
                    <td className="px-3 py-2 text-sm">{u.isActive !== false ? "✓ Active" : "○ Inactive"}</td>
                    <td className="px-3 py-2">
                      <button
                        className="text-sm text-blue-600 hover:underline"
                        onClick={() => toggle.mutate(u.code)}
                      >
                        {u.isActive !== false ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </div>

      {showNew && (
        <Modal open={showNew} onClose={() => setShowNew(false)} title="Create Custom Unit">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Code (e.g., "tray")</label>
              <input
                className="input w-full"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })}
                placeholder="tray"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                className="input w-full"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Tray"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Dimension</label>
              <select
                className="input w-full"
                value={form.dimension}
                onChange={(e) => setForm({ ...form, dimension: e.target.value })}
              >
                <option value="WEIGHT">Weight</option>
                <option value="VOLUME">Volume</option>
                <option value="COUNT">Count</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Conversion to Base Unit</label>
              <input
                className="input w-full"
                type="number"
                step="0.01"
                value={form.toBaseFactor}
                onChange={(e) => setForm({ ...form, toBaseFactor: parseFloat(e.target.value) })}
                placeholder="1"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setShowNew(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={() => create.mutate()}>
                Create Unit
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
