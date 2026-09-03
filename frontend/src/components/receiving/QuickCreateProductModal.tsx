import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Category, Product, Unit } from "../../types";
import { Modal } from "../ui";

/** A fast "create this product right now" modal used from receiving screens, so a new item on an invoice never blocks the whole receiving. */
export default function QuickCreateProductModal({
  open,
  onClose,
  initialName,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  initialName: string;
  onCreated: (product: Product) => void;
}) {
  const qc = useQueryClient();
  const { data: categories } = useQuery<Category[]>({ queryKey: ["categories"], queryFn: () => api.get("/categories"), enabled: open });
  const { data: units } = useQuery<Unit[]>({ queryKey: ["units"], queryFn: () => api.get("/units"), enabled: open });

  const [name, setName] = useState(initialName);
  const [categoryId, setCategoryId] = useState("");
  const [inventoryUnitCode, setInventoryUnitCode] = useState("");
  const [parLevel, setParLevel] = useState(0);
  const [reorderLevel, setReorderLevel] = useState(0);

  const create = useMutation({
    mutationFn: () => api.post<Product>("/products", { name, categoryId, inventoryUnitCode, parLevel, reorderLevel }),
    onSuccess: (product) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      onCreated(product);
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Create new product">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <label className="label">Name</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select…</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Inventory unit</label>
          <select className="input" required value={inventoryUnitCode} onChange={(e) => setInventoryUnitCode(e.target.value)}>
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
            <input type="number" step="any" className="input" value={parLevel} onChange={(e) => setParLevel(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Reorder level</label>
            <input type="number" step="any" className="input" value={reorderLevel} onChange={(e) => setReorderLevel(Number(e.target.value))} />
          </div>
        </div>
        {create.isError && <div className="text-sm text-rose-600">{(create.error as any)?.message}</div>}
        <button className="btn-primary mt-2" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create & use this product"}
        </button>
      </form>
    </Modal>
  );
}
