import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Alert, User } from "../types";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "📊", end: true },
  { to: "/products", label: "Inventory", icon: "📦" },
  { to: "/receive", label: "Receive", icon: "🚚" },
  { to: "/waste", label: "Waste", icon: "🗑️" },
  { to: "/sales", label: "Sales", icon: "🧾" },
  { to: "/counts", label: "Counts", icon: "🔢" },
  { to: "/recipes", label: "Recipes", icon: "📖" },
  { to: "/history", label: "History", icon: "🕒" },
  { to: "/reports", label: "Reports", icon: "📈" },
  { to: "/toast", label: "Toast POS", icon: "🔗" },
];

const MOBILE_ITEMS = ["/", "/products", "/receive", "/waste", "/sales"];

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

export default function Layout() {
  const { users, userId, setUser } = useCurrentUser();

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 px-2">
          <div className="text-lg font-bold text-brand-700">🍽️ InvTrack</div>
          <div className="text-xs text-slate-500">Restaurant Inventory</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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
        </nav>
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

      <div className="flex min-h-screen flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="font-bold text-brand-700">🍽️ InvTrack</div>
          <AlertBell />
        </header>

        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-10 flex border-t border-slate-200 bg-white md:hidden">
          {NAV_ITEMS.filter((i) => MOBILE_ITEMS.includes(i.to)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${isActive ? "text-brand-700" : "text-slate-500"}`
              }
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
