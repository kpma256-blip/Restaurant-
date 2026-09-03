import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Supplier } from "../types";
import { EmptyState, Modal, PageHeader, Table } from "../components/ui";

export default function Suppliers() {
  const qc = useQueryClient();
  const { data: suppliers, isLoading } = useQuery<Supplier[]>({ queryKey: ["suppliers"], queryFn: () => api.get("/suppliers") });
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
        <div className="p-8 text-slate-400">Loading…</div>
      ) : !suppliers || suppliers.length === 0 ? (
        <EmptyState>No suppliers yet.</EmptyState>
      ) : (
        <Table>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {suppliers.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">{s.name}</td>
                <td className="px-3 py-2 text-slate-500">{s.contactName ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500">{s.phone ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500">{s.email ?? "—"}</td>
                <td className="px-3 py-2">
                  <button className="text-sm text-brand-700 hover:underline" onClick={() => setEditing(s)}>
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
          onSaved={() => qc.invalidateQueries({ queryKey: ["suppliers"] })}
        />
      )}
    </div>
  );
}

function SupplierModal({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [contactName, setContactName] = useState(supplier?.contactName ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");

  const save = useMutation({
    mutationFn: () => {
      const body = { name, contactName: contactName || undefined, phone: phone || undefined, email: email || undefined, notes: notes || undefined };
      return supplier ? api.patch(`/suppliers/${supplier.id}`, body) : api.post("/suppliers", body);
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title={supplier ? "Edit supplier" : "New supplier"}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div>
          <label className="label">Name</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Contact name</label>
          <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Phone</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Notes</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {save.isError && <div className="text-sm text-rose-600">{(save.error as any)?.message}</div>}
        <button className="btn-primary mt-2" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </form>
    </Modal>
  );
}
