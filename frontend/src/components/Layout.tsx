import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Alert, User } from "../types";
import { useEffect, useState } from "react";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  { label: "", items: [{ to: "/", label: "Dashboard", icon: "📊", end: true }] },
  {
    label: "Inventory",
    items: [
      { to: "/products", label: "Inventory", icon: "📦" },
      { to: "/receive", label: "Receive Inventory", icon: "🚚" },
      { to: "/receiving", label: "Receiving History", icon: "📜" },
      { to: "/counts", label: "Inventory Counts", icon: "🔢" },
      { to: "/waste", label: "Waste", icon: "🗑️" },
    ],
  },
  {
    label: "Menu",
    items: [
      { to: "/sales", label: "Sales", icon: "🧾" },
      { to: "/recipes", label: "Recipes", icon: "📖" },
      { to: "/menu-items", label: "Menu Items", icon: "🍽️" },
      { to: "/suppliers", label: "Suppliers", icon: "🏭" },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/history", label: "History", icon: "🕒" },
      { to: "/reports", label: "Reports", icon: "📈" },
      { to: "/toast", label: "Toast Integration", icon: "🔗" },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/settings", label: "Settings", icon: "⚙️" },
      { to: "/users", label: "Users", icon: "👤" },
    ],
  },
];

function useCurrentUser() {
  const { data: users } = useQuery<User[]>({ queryKey: ["users"], queryFn: () => api.get("/users") });
  const [userId, setUserId] = useState<string | null>(localStorage.getItem("userId"));

  useEffect(() => {
    if (!userId && users && users.length > 0) {
      setUserId(users[0].id);
      localStorage.setItem("userId", users[0].id);
    }
  }, [users, userId]);

  const setUser = (id: string) => {
    localStorage.setItem("userId", id);
    setUserId(id);
    window.location.reload();
  };

  return { users: users ?? [], userId, setUser };
}

function AlertBell() {
  const { data: alerts } = useQuery<Alert[]>({ queryKey: ["alerts"], queryFn: () => api.get("/alerts"), refetchInterval: 60_000 });
  const critical = alerts?.filter((a) => a.severity === "critical").length ?? 0;
  const warning = alerts?.filter((a) => a.severity === "warning").length ?? 0;
  if (!alerts || alerts.length === 0) return null;
  return (
    <NavLink to="/" className="relative flex items-center gap-1 rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold">
      🔔
      {critical > 0 && <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-xs text-white">{critical}</span>}
      {critical === 0 && warning > 0 && <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-xs text-white">{warning}</span>}
    </NavLink>
  );
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-4">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi}>
          {group.label && <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{group.label}</div>}
          <div className="flex flex-col gap-1">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                  }`
                }
              >
                <span>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function Layout() {
  const { users, userId, setUser } = useCurrentUser();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 px-2">
          <div className="text-lg font-bold text-brand-700">🍽️ InvTrack</div>
          <div className="text-xs text-slate-500">Restaurant Inventory</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavContent />
        </div>
        <div className="mt-4 border-t border-slate-200 pt-4">
          <label className="label">Acting as</label>
          <select className="input" value={userId ?? ""} onChange={(e) => setUser(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </div>
      </aside>

      {/* Mobile hamburger drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col overflow-y-auto bg-white p-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between px-2">
              <div>
                <div className="text-lg font-bold text-brand-700">🍽️ InvTrack</div>
                <div className="text-xs text-slate-500">Restaurant Inventory</div>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="Close menu">
                ✕
              </button>
            </div>
            <NavContent onNavigate={() => setDrawerOpen(false)} />
            <div className="mt-4 border-t border-slate-200 pt-4">
              <label className="label">Acting as</label>
              <select className="input" value={userId ?? ""} onChange={(e) => setUser(e.target.value)}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-xl p-2 text-2xl leading-none text-slate-700 hover:bg-slate-100"
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="font-bold text-brand-700">🍽️ InvTrack</div>
          <AlertBell />
        </header>

        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
