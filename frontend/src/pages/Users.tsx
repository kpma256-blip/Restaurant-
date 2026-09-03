import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { User } from "../types";
import { Badge, Modal, PageHeader, Table } from "../components/ui";
import { USER_ROLES } from "../lib/constants";

export default function Users() {
  const qc = useQueryClient();
  const { data: users, isLoading } = useQuery<User[]>({ queryKey: ["users"], queryFn: () => api.get("/users") });
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Everyone who shows up in “Acting as” and gets attributed on inventory changes — no passwords/login yet, see Settings for details"
        action={
          <button className="btn-primary" onClick={() => setShowNew(true)}>
            + New user
          </button>
        }
      />

      {isLoading ? (
        <div className="p-8 text-slate-400">Loading…</div>
      ) : (
        <Table>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users?.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">{u.name}</td>
                <td className="px-3 py-2 text-slate-500">{u.email}</td>
                <td className="px-3 py-2">
                  <Badge tone={u.role === "ADMIN" ? "red" : u.role === "MANAGER" ? "blue" : "slate"}>{u.role}</Badge>
                </td>
                <td className="px-3 py-2 flex gap-3">
                  <button className="text-sm text-brand-700 hover:underline" onClick={() => setEditing(u)}>
                    Edit
                  </button>
                  <button
                    className="text-sm text-rose-600 hover:underline"
                    onClick={() => confirm(`Remove ${u.name}?`) && remove.mutate(u.id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {(showNew || editing) && (
        <UserModal
          user={editing}
          onClose={() => {
            setShowNew(false);
            setEditing(null);
          }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["users"] })}
        />
      )}
    </div>
  );
}

function UserModal({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState(user?.role ?? "STAFF");

  const save = useMutation({
    mutationFn: () => (user ? api.patch(`/users/${user.id}`, { name, email, role }) : api.post("/users", { name, email, role })),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title={user ? "Edit user" : "New user"}>
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
          <label className="label">Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        {save.isError && <div className="text-sm text-rose-600">{(save.error as any)?.message}</div>}
        <button className="btn-primary mt-2" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </form>
    </Modal>
  );
}
