import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Category, Unit } from "../types";
import { Modal } from "./ui";

interface ProductCreationModalProps {
  onClose: () => void;
  onSuccess?: (productId: string) => void;
}

export default function ProductCreationModal({ onClose, onSuccess }: ProductCreationModalProps) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"basic" | "units" | "advanced">("basic");
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    productTypeId: "",
    productTypeName: "",
    inventoryUnitCode: "",
    purchaseUnitCode: "",
    purchaseToInventoryFactor: "",
    costUnitCode: "",
    parLevel: "",
    reorderLevel: "",
    supplierId: "",
    currentCost: "",
  });
  const [showNewType, setShowNewType] = useState(false);

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: () => api.get("/categories"),
  });

  const { data: productTypes } = useQuery<any[]>({
    queryKey: ["product-types"],
    queryFn: () => api.get("/product-types"),
  });

  const { data: units } = useQuery<Unit[]>({
    queryKey: ["units"],
    queryFn: () => api.get("/units?active=true"),
  });

  const { data: suppliers } = useQuery<any[]>({
    queryKey: ["suppliers"],
    queryFn: () => api.get("/suppliers"),
  });

  const createType = useMutation({
    mutationFn: () => api.post("/product-types", { name: form.productTypeName }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["product-types"] });
      setForm({ ...form, productTypeId: created.id, productTypeName: "" });
      setShowNewType(false);
    },
  });

  const createProduct = useMutation({
    mutationFn: () => {
      const payload: any = {
        name: form.name,
        categoryId: form.categoryId,
        ...(form.productTypeId && { productTypeId: form.productTypeId }),
        inventoryUnitCode: form.inventoryUnitCode,
        costUnitCode: form.costUnitCode || form.inventoryUnitCode,
        ...(form.parLevel && { parLevel: parseFloat(form.parLevel) }),
        ...(form.reorderLevel && { reorderLevel: parseFloat(form.reorderLevel) }),
        ...(form.supplierId && { supplierId: form.supplierId }),
        ...(form.purchaseUnitCode && { purchaseUnitCode: form.purchaseUnitCode }),
        ...(form.purchaseToInventoryFactor && { purchaseToInventoryFactor: parseFloat(form.purchaseToInventoryFactor) }),
      };
      return api.post("/products", payload);
    },
    onSuccess: (product) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      onSuccess?.(product.id);
      onClose();
    },
  });

  const canContinue = form.name && form.categoryId && form.inventoryUnitCode;

  return (
    <Modal onClose={onClose}>
      <div className="space-y-4 max-w-md">
        <h2 className="text-2xl font-bold">Create Product</h2>

        {step === "basic" && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Product Name *</label>
              <input
                className="input w-full"
                placeholder="e.g., Chicken Breast"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Category *</label>
              <select
                className="input w-full"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">Select category…</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Product Type (optional)</label>
              <select
                className="input w-full"
                value={form.productTypeId}
                onChange={(e) => setForm({ ...form, productTypeId: e.target.value })}
              >
                <option value="">Select type…</option>
                {productTypes?.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.name}
                  </option>
                ))}
              </select>
              <button
                className="text-xs text-blue-600 mt-1"
                onClick={() => setShowNewType(true)}
              >
                + Create new type
              </button>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-primary" disabled={!canContinue} onClick={() => setStep("units")}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === "units" && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Inventory Unit *</label>
              <select
                className="input w-full"
                value={form.inventoryUnitCode}
                onChange={(e) => setForm({ ...form, inventoryUnitCode: e.target.value })}
              >
                <option value="">Select unit…</option>
                {units?.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.name} ({u.code})
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">Used for recipes and inventory levels</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Purchase Unit (optional)</label>
              <select
                className="input w-full"
                value={form.purchaseUnitCode}
                onChange={(e) => setForm({ ...form, purchaseUnitCode: e.target.value })}
              >
                <option value="">Same as inventory unit</option>
                {units?.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.name} ({u.code})
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">If purchases come in different unit (e.g., cases)</p>
            </div>

            {form.purchaseUnitCode && (
              <div>
                <label className="block text-sm font-medium mb-1">Conversion</label>
                <div className="flex gap-2 items-center">
                  <span className="text-sm">1</span>
                  <input
                    className="input flex-1 text-sm"
                    value={form.purchaseUnitCode}
                    disabled
                  />
                  <span className="text-sm">=</span>
                  <input
                    className="input w-20 text-sm"
                    type="number"
                    step="0.01"
                    placeholder="40"
                    value={form.purchaseToInventoryFactor}
                    onChange={(e) => setForm({ ...form, purchaseToInventoryFactor: e.target.value })}
                  />
                  <input
                    className="input flex-1 text-sm"
                    value={form.inventoryUnitCode}
                    disabled
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-4">
              <button className="btn-secondary" onClick={() => setStep("basic")}>
                Back
              </button>
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-primary" onClick={() => setStep("advanced")}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === "advanced" && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Par Level</label>
              <input
                className="input w-full"
                type="number"
                step="0.01"
                placeholder="0"
                value={form.parLevel}
                onChange={(e) => setForm({ ...form, parLevel: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Reorder Level</label>
              <input
                className="input w-full"
                type="number"
                step="0.01"
                placeholder="0"
                value={form.reorderLevel}
                onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Supplier</label>
              <select
                className="input w-full"
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              >
                <option value="">None</option>
                {suppliers?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <button className="btn-secondary" onClick={() => setStep("units")}>
                Back
              </button>
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={createProduct.isPending}
                onClick={() => createProduct.mutate()}
              >
                {createProduct.isPending ? "Creating…" : "Create Product"}
              </button>
            </div>
          </div>
        )}

        {showNewType && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-sm">
              <h3 className="text-lg font-semibold mb-4">Create Product Type</h3>
              <input
                className="input w-full mb-4"
                placeholder="e.g., Chicken Breast"
                value={form.productTypeName}
                onChange={(e) => setForm({ ...form, productTypeName: e.target.value })}
              />
              <div className="flex gap-2 justify-end">
                <button className="btn-secondary" onClick={() => setShowNewType(false)}>
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  disabled={!form.productTypeName || createType.isPending}
                  onClick={() => createType.mutate()}
                >
                  {createType.isPending ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
