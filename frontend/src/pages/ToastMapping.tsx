import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { MenuItem, ToastMenuItemMapping } from "../types";
import { Badge, EmptyState, PageHeader, Table } from "../components/ui";

export default function ToastMapping() {
  const qc = useQueryClient();
  const { data: mappings, isLoading } = useQuery<ToastMenuItemMapping[]>({
    queryKey: ["toast-mappings"],
    queryFn: () => api.get("/toast/menu-items"),
  });
  const { data: menuItems } = useQuery<MenuItem[]>({ queryKey: ["menu-items"], queryFn: () => api.get("/menu-items") });

  const refresh = useMutation({
    mutationFn: () => api.post("/toast/refresh-menu"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["toast-mappings"] }),
  });

  const map = useMutation({
    mutationFn: ({ toastGuid, internalMenuItemId }: { toastGuid: string; internalMenuItemId: string }) =>
      api.post(`/toast/menu-items/${toastGuid}/map`, { internalMenuItemId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["toast-mappings"] });
      qc.invalidateQueries({ queryKey: ["toast-status"] });
    },
  });

  const ignore = useMutation({
    mutationFn: (toastGuid: string) => api.post(`/toast/menu-items/${toastGuid}/ignore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["toast-mappings"] });
      qc.invalidateQueries({ queryKey: ["toast-status"] });
    },
  });

  const unmapped = mappings?.filter((m) => !m.internalMenuItemId && !m.isIgnored) ?? [];
  const mapped = mappings?.filter((m) => m.internalMenuItemId) ?? [];
  const ignored = mappings?.filter((m) => m.isIgnored) ?? [];

  return (
    <div>
      <PageHeader
        title="Toast menu mapping"
        subtitle="Connect Toast menu items to your internal recipes so their sales deduct the right ingredients"
        action={
          <button className="btn-secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? "Refreshing…" : "Refresh from Toast"}
          </button>
        }
      />

      {refresh.isError && <div className="mb-4 text-sm text-rose-600">{(refresh.error as any)?.message}</div>}

      {isLoading ? (
        <div className="p-8 text-slate-400">Loading…</div>
      ) : !mappings || mappings.length === 0 ? (
        <EmptyState>
          No Toast menu items yet. Connect Toast on the{" "}
          <a href="/toast" className="text-brand-700 underline">
            Toast Integration
          </a>{" "}
          page, then refresh the menu here.
        </EmptyState>
      ) : (
        <>
          {unmapped.length > 0 && (
            <div className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              ⚠️ {unmapped.length} Toast item{unmapped.length === 1 ? "" : "s"} are not mapped to inventory recipes.
            </div>
          )}

          <h2 className="mb-2 text-lg font-bold">Unmapped ({unmapped.length})</h2>
          <Table>
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Toast item</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Map to internal recipe</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {unmapped.map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2 font-medium">{m.toastName}</td>
                  <td className="px-3 py-2 text-slate-500">{m.toastCategory}</td>
                  <td className="px-3 py-2">
                    <select
                      className="input"
                      defaultValue=""
                      onChange={(e) => e.target.value && map.mutate({ toastGuid: m.toastGuid, internalMenuItemId: e.target.value })}
                    >
                      <option value="" disabled>
                        Select a menu item…
                      </option>
                      {menuItems?.map((mi) => (
                        <option key={mi.id} value={mi.id}>
                          {mi.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button className="text-sm text-slate-500 hover:underline" onClick={() => ignore.mutate(m.toastGuid)}>
                      Ignore
                    </button>
                  </td>
                </tr>
              ))}
              {unmapped.length === 0 && (
                <tr>
                  <td className="px-3 py-2 text-slate-400" colSpan={4}>
                    Nothing unmapped. 🎉
                  </td>
                </tr>
              )}
            </tbody>
          </Table>

          <h2 className="mb-2 mt-6 text-lg font-bold">Mapped ({mapped.length})</h2>
          <Table>
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Toast item</th>
                <th className="px-3 py-2">Internal recipe</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mapped.map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2 font-medium">{m.toastName}</td>
                  <td className="px-3 py-2">
                    <Badge tone="green">{m.internalMenuItem?.name}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="input"
                      value={m.internalMenuItemId ?? ""}
                      onChange={(e) => map.mutate({ toastGuid: m.toastGuid, internalMenuItemId: e.target.value })}
                    >
                      {menuItems?.map((mi) => (
                        <option key={mi.id} value={mi.id}>
                          {mi.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          {ignored.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-lg font-bold">Ignored ({ignored.length})</h2>
              <Table>
                <tbody className="divide-y divide-slate-100">
                  {ignored.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2 font-medium">{m.toastName}</td>
                      <td className="px-3 py-2 text-slate-400">Not synced to inventory</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </>
      )}
    </div>
  );
}
