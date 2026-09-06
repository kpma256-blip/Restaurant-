import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Supplier } from "../types";
import { EmptyState, Modal, PageHeader, Table, Spinner } from "../components/ui";
import { SkeletonTable } from "../components/Skeleton";
import { TextInput, TextArea } from "../components/FormInputs";
import { getErrorMessage } from "../lib/constants";
import { useForm } from "../hooks/useForm";
import { useSuppliers } from "../hooks/useApi";

export default function Suppliers() {
  const { data: suppliers, isLoading } = useSuppliers();
  const [editing, setEditing] = useState<Supplier | null | "new">(null);

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Vendors you receive inventory from"
        action={
          <button className="btn-primary" onClick={() => setEditing("new")}>
            + New supplier
          </button>
        }
      />

      {isLoading ? (
        <SkeletonTable rows={5} />
      ) : !suppliers || suppliers.length === 0 ? (
        <EmptyState>No suppliers yet. Create one to track your vendors.</EmptyState>
      ) : (
        <Table>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Contact</th>
              <th className="px-3 py-2 text-left">Phone</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {suppliers.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">{s.name}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{s.contactName ?? "—"}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{s.phone ?? "—"}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{s.email ?? "—"}</td>
                <td className="px-3 py-2">
                  <button className="text-sm font-medium text-brand-700 hover:underline" onClick={() => setEditing(s)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {editing && (
        <SupplierModal
          supplier={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SupplierModal({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !supplier;

  const INITIAL = {
    name: supplier?.name ?? "",
    contactName: supplier?.contactName ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    notes: supplier?.notes ?? "",
  };

  const form = useForm(INITIAL);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.values.name,
        contactName: form.values.contactName || undefined,
        phone: form.values.phone || undefined,
        email: form.values.email || undefined,
        notes: form.values.notes || undefined,
      };
      return isNew ? api.post("/suppliers", body) : api.patch(`/suppliers/${supplier.id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      onClose();
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.values.name.trim()) {
      form.setError("name", "Supplier name is required");
      return;
    }
    save.mutate();
  };

  return (
    <Modal open onClose={onClose} title={isNew ? "New supplier" : `Edit ${supplier?.name}`}>
      <form onSubmit={onSubmit} className="space-y-3">
        <TextInput
          label="Name"
          required
          placeholder="e.g., ABC Foods"
          value={form.values.name}
          onChange={(e) => form.set("name", e.target.value)}
          error={form.errors.name}
        />

        <TextInput
          label="Contact name"
          placeholder="e.g., John Smith"
          value={form.values.contactName}
          onChange={(e) => form.set("contactName", e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <TextInput
            label="Phone"
            type="tel"
            placeholder="(555) 123-4567"
            value={form.values.phone}
            onChange={(e) => form.set("phone", e.target.value)}
          />

          <TextInput
            label="Email"
            type="email"
            placeholder="contact@supplier.com"
            value={form.values.email}
            onChange={(e) => form.set("email", e.target.value)}
          />
        </div>

        <TextArea
          label="Notes"
          placeholder="Delivery schedule, payment terms, etc."
          value={form.values.notes}
          onChange={(e) => form.set("notes", e.target.value)}
        />

        {save.isError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {getErrorMessage(save.error)}
          </div>
        )}

        <button className="btn-primary w-full" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save supplier"}
        </button>
      </form>
    </Modal>
  );
}
