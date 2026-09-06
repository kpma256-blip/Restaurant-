import { useState } from "react";
import { Link } from "react-router-dom";
import { Product, Category } from "../types";
import { money, qty } from "../lib/format";
import { Modal, PageHeader, Table, EmptyState, StatusDot } from "../components/ui";
import { SkeletonTable, SkeletonStats } from "../components/Skeleton";
import { SelectInput, TextInput } from "../components/FormInputs";
import { useForm } from "../hooks/useForm";
import { useProducts, useCategories, useCreateProduct, useUnits } from "../hooks/useApi";
import ProductCreationModal from "../components/ProductCreationModal";

const INITIAL_PRODUCT = {
  name: "",
  categoryId: "",
  inventoryUnitCode: "",
  parLevel: "0",
  reorderLevel: "0",
  beginningQuantity: "0",
  beginningCost: "0",
};

export default function Products() {
  const [showNew, setShowNew] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const { data: products, isLoading: productsLoading } = useProducts();
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const { data: units } = useUnits();

  // Filter products based on selected filters
  const filteredProducts = products?.filter((p) => {
    if (categoryId && p.categoryId !== categoryId) return false;
    if (status && p.status !== status) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const isLoading = productsLoading || categoriesLoading;
  const productCount = filteredProducts?.length || 0;

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={!isLoading ? `${productCount} products` : undefined}
        action={
          <button className="btn-primary" onClick={() => setShowNew(true)}>
            + New product
          </button>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <TextInput
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />

        <SelectInput
          options={(categories || []).map((c) => ({ value: c.id, label: c.name }))}
          placeholder="All categories"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        />

        <SelectInput
          options={[
            { value: "green", label: "Healthy" },
            { value: "yellow", label: "Low" },
            { value: "red", label: "Critical" },
          ]}
          placeholder="All statuses"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        />
      </div>

      {/* Products Table */}
      {isLoading ? (
        <SkeletonTable rows={8} />
      ) : filteredProducts && filteredProducts.length > 0 ? (
        <Table>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-right">On hand</th>
              <th className="px-3 py-2 text-right">Par / Reorder</th>
              <th className="px-3 py-2 text-right">Unit cost</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredProducts.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link to={`/products/${p.id}`} className="font-medium text-brand-700 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-sm text-slate-600">{p.category?.name}</td>
                <td className={`px-3 py-2 text-right font-medium ${p.currentQuantity < 0 ? "text-rose-600" : ""}`}>
                  {qty(p.currentQuantity)} <span className="text-xs text-slate-500">{p.inventoryUnitCode}</span>
                </td>
                <td className="px-3 py-2 text-right text-sm text-slate-600">
                  {qty(p.parLevel)} / {qty(p.reorderLevel)}
                </td>
                <td className="px-3 py-2 text-right">{money(p.effectiveUnitCost || 0)}</td>
                <td className="px-3 py-2 text-right font-medium">{money(p.inventoryValue || 0)}</td>
                <td className="px-3 py-2 text-center">
                  <StatusDot status={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState>
          {search || categoryId || status ? "No products match your filters" : "No products yet. Create one to get started."}
        </EmptyState>
      )}

      {/* Product Creation Modal */}
      <ProductCreationModal open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}
