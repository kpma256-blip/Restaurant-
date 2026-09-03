import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { ProductType } from "../types";
import { Modal, PageHeader, Spinner, Table } from "../components/ui";

export default function SettingsProductTypes() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });

  const { data: productTypes, isLoading } = useQuery<ProductType[]>({
    queryKey: ["product-types"],
    queryFn: () => api.get("/product-types"),
  });

  const create = useMutation({
    mutationFn: () => api.post("/product-types", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-types"] });
      setForm({ name: "", description: "" });
      setShowNew(false);
    },
  });

  const update = useMutation({
    mutationFn: () => api.patch(`/product-types/${editId}`, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-types"] });
      setEditId(null);
      setForm({ name: "", description: "" });
    },
  });

  const toggleActive = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/product-types/${id}`, {
        isActive: !productTypes?.find((pt) => pt.id === id)?.isActive,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-types"] }),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Product Types"
        subtitle="Define product types for your inventory"
        action={
          <button className="btn-primary" onClick={() => setShowNew(true)}>
            + New Type
          </button>
        }
      />

      <Table>
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left">Name</th>
            <th className="px-3 py-2 text-left">Products</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {(productTypes || []).map((pt) => (
            <tr key={pt.id} className="hover:bg-slate-50">
              <td className="px-3 py-2">{pt.name}</td>
              <td className="px-3 py-2 text-sm text-gray-600">
                {pt._count?.products || 0} product{(pt._count?.products || 0) !== 1 ? "s" : ""}
              </td>
              <td className="px-3 py-2 text-sm">{pt.isActive ? "✓ Active" : "○ Inactive"}</td>
              <td className="px-3 py-2">
                <div className="flex gap-2">
                  <button
                    className="text-sm text-blue-600 hover:underline"
                    onClick={() => {
                      setEditId(pt.id);
                      setForm({ name: pt.name, description: "" });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="text-sm text-gray-600 hover:underline"
                    onClick={() => toggleActive.mutate(pt.id)}
                  >
                    {pt.isActive ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      {(showNew || editId) && (
        <Modal open={showNew || !!editId} onClose={() => { setShowNew(false); setEditId(null); }} title={editId ? "Edit Product Type" : "Create Product Type"}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                className="input w-full"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Chicken Breast"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description (optional)</label>
              <textarea
                className="input w-full"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional details about this product type"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                className="btn-secondary"
                onClick={() => { setShowNew(false); setEditId(null); }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => editId ? update.mutate() : create.mutate()}
              >
                {editId ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
