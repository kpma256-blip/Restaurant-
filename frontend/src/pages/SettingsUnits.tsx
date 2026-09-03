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
    <div>
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
          <Table
            columns={["Code", "Name", "Dimension", "Factor", "Status"]}
            rows={(systemUnits || []).map((u) => [
              <code key="code">{u.code}</code>,
              u.name,
              <span key="dim" className="text-sm text-gray-600">
                {u.dimension}
              </span>,
              <span key="factor" className="text-sm">
                {u.toBaseFactor}
              </span>,
              <span key="status" className="text-sm">
                {u.isActive ? "✓ Active" : "○ Inactive"}
              </span>,
            ])}
          />
        </div>

        {customUnits.length > 0 && (
          <div>
            <h3 className="mb-3 font-semibold">Custom Units</h3>
            <Table
              columns={["Code", "Name", "Dimension", "Factor", "Status", "Action"]}
              rows={(customUnits || []).map((u) => [
                <code key="code">{u.code}</code>,
                u.name,
                u.dimension,
                u.toBaseFactor,
                <span key="status" className="text-sm">
                  {u.isActive ? "✓ Active" : "○ Inactive"}
                </span>,
                <button
                  key="toggle"
                  className="text-sm text-blue-600 hover:underline"
                  onClick={() => toggle.mutate(u.code)}
                >
                  {u.isActive ? "Deactivate" : "Activate"}
                </button>,
              ])}
            />
          </div>
        )}
      </div>

      {showNew && (
        <Modal onClose={() => setShowNew(false)}>
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Create Custom Unit</h3>
            <div>
              <label className="block text-sm font-medium">Code (e.g., "tray")</label>
              <input
                className="input w-full"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })}
                placeholder="tray"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Name</label>
              <input
                className="input w-full"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Tray"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Dimension</label>
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
              <label className="block text-sm font-medium">Conversion to Base Unit</label>
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
