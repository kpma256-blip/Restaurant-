import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Category, Product, Unit } from "../types";
import { money, qty } from "../lib/format";
import { Modal, PageHeader, Spinner, StatusDot, Table } from "../components/ui";

export default function Products() {
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);

  const { data: categories } = useQuery<Category[]>({ queryKey: ["categories"], queryFn: () => api.get("/categories") });
  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["products", categoryId, status, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (categoryId) params.set("categoryId", categoryId);
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      return api.get(`/products?${params.toString()}`);
    },
  });

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={products ? `${products.length} products` : undefined}
        action={
          <button className="btn-primary" onClick={() => setShowNew(true)}>
            + New product
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[200px]" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input max-w-[160px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="green">Healthy</option>
          <option value="yellow">Low</option>
          <option value="red">Critical</option>
        </select>
      </div>

      {isLoading || !products ? (
        <Spinner />
      ) : (
        <Table>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">On hand</th>
              <th className="px-3 py-2">Par / Reorder</th>
              <th className="px-3 py-2">Unit cost</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link to={`/products/${p.id}`} className="font-medium text-brand-700 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-500">{p.category?.name}</td>
                <td className={`px-3 py-2 font-medium ${p.currentQuantity < 0 ? "text-rose-600" : ""}`}>
                  {qty(p.currentQuantity)} {p.inventoryUnitCode}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {qty(p.parLevel)} / {qty(p.reorderLevel)}
                </td>
                <td className="px-3 py-2">{money(p.effectiveUnitCost)}</td>
                <td className="px-3 py-2">{money(p.inventoryValue)}</td>
                <td className="px-3 py-2">
                  <StatusDot status={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <NewProductModal open={showNew} onClose={() => setShowNew(false)} categories={categories ?? []} />
    </div>
  );
}

function NewProductModal({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: Category[] }) {
  const qc = useQueryClient();
  const { data: units } = useQuery<Unit[]>({ queryKey: ["units"], queryFn: () => api.get("/units"), enabled: open });
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    inventoryUnitCode: "",
    parLevel: 0,
    reorderLevel: 0,
    beginningQuantity: 0,
    beginningCost: 0,
  });

  const create = useMutation({
    mutationFn: () => api.post("/products", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      onClose();
      setForm({ name: "", categoryId: "", inventoryUnitCode: "", parLevel: 0, reorderLevel: 0, beginningQuantity: 0, beginningCost: 0 });
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="New product">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <label className="label">Name</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Inventory unit</label>
          <select
            className="input"
            required
            value={form.inventoryUnitCode}
            onChange={(e) => setForm({ ...form, inventoryUnitCode: e.target.value })}
          >
            <option value="">Select…</option>
            {units?.map((u) => (
              <option key={u.code} value={u.code}>
                {u.name} ({u.code})
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Par level</label>
            <input
              type="number"
              step="any"
              className="input"
              value={form.parLevel}
              onChange={(e) => setForm({ ...form, parLevel: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Reorder level</label>
            <input
              type="number"
              step="any"
              className="input"
              value={form.reorderLevel}
              onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
          <div>
            <label className="label">Beginning quantity</label>
            <input
              type="number"
              step="any"
              className="input"
              value={form.beginningQuantity}
              onChange={(e) => setForm({ ...form, beginningQuantity: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Cost per unit</label>
            <input
              type="number"
              step="any"
              className="input"
              value={form.beginningCost}
              onChange={(e) => setForm({ ...form, beginningCost: Number(e.target.value) })}
            />
          </div>
        </div>
        {create.isError && <div className="text-sm text-rose-600">{(create.error as any)?.message}</div>}
        <button className="btn-primary mt-2" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create product"}
        </button>
      </form>
    </Modal>
  );
}
