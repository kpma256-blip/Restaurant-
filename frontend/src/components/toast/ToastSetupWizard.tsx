import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { MenuItem, ToastMenuItemMapping } from "../../types";
import { Badge, Modal } from "../ui";
import { toInputDate } from "../../lib/format";

const STEPS = ["Connect", "Import menu", "Modifiers", "Map items", "Historical sales", "Finish"] as const;

function StepDots({ current }: { current: number }) {
  return (
    <div className="mb-5 flex items-center gap-1">
      {STEPS.map((s, i) => (
        <div key={s} className="flex flex-1 items-center gap-1">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              i < current ? "bg-brand-600 text-white" : i === current ? "bg-brand-100 text-brand-700 ring-2 ring-brand-500" : "bg-slate-100 text-slate-400"
            }`}
          >
            {i < current ? "✓" : i + 1}
          </div>
          {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${i < current ? "bg-brand-600" : "bg-slate-200"}`} />}
        </div>
      ))}
    </div>
  );
}

export default function ToastSetupWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);

  // Step 1: connect
  const [environment, setEnvironment] = useState("sandbox");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [restaurantGuid, setRestaurantGuid] = useState("");

  const connect = useMutation({
    mutationFn: () => api.post("/toast/connect", { environment, clientId, clientSecret, restaurantGuid }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["toast-status"] });
      setStep(1);
    },
  });

  // Step 2: import menu
  const importMenu = useMutation({
    mutationFn: () => api.post<{ created: number; updated: number; total: number }>("/toast/refresh-menu"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["toast-mappings"] }),
  });

  // Step 4: mapping
  const { data: mappings } = useQuery<ToastMenuItemMapping[]>({
    queryKey: ["toast-mappings"],
    queryFn: () => api.get("/toast/menu-items"),
    enabled: step === 3,
  });
  const { data: menuItems } = useQuery<MenuItem[]>({ queryKey: ["menu-items"], queryFn: () => api.get("/menu-items"), enabled: step === 3 });
  const map = useMutation({
    mutationFn: ({ toastGuid, internalMenuItemId }: { toastGuid: string; internalMenuItemId: string }) =>
      api.post(`/toast/menu-items/${toastGuid}/map`, { internalMenuItemId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["toast-mappings"] }),
  });
  const unmapped = mappings?.filter((m) => !m.internalMenuItemId && !m.isIgnored) ?? [];

  // Step 5: historical sales
  const [preset, setPreset] = useState("30");
  const [startDate, setStartDate] = useState(toInputDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [endDate, setEndDate] = useState(toInputDate(new Date()));
  const [confirmedHistorical, setConfirmedHistorical] = useState(false);
  const [skippedHistorical, setSkippedHistorical] = useState(false);
  const applyPreset = (days: string) => {
    setPreset(days);
    if (days !== "custom") {
      setStartDate(toInputDate(new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000)));
      setEndDate(toInputDate(new Date()));
    }
  };
  const importHistorical = useMutation({
    mutationFn: () => api.post<{ ordersImported: number }>("/toast/import-historical", { startDate, endDate, confirm: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["toast-status"] });
      qc.invalidateQueries({ queryKey: ["toast-logs"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setStep(5);
    },
  });

  const finish = () => {
    qc.invalidateQueries({ queryKey: ["toast-status"] });
    onClose();
    setStep(0);
  };

  return (
    <Modal open={open} onClose={onClose} title="Connect Toast — setup">
      <StepDots current={step} />

      {step === 0 && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            connect.mutate();
          }}
        >
          <p className="text-sm text-slate-500">
            Enter the API credentials Toast issued for your restaurant (Standard API Access from the Toast admin portal, or Partner
            credentials). See <code>backend/src/integrations/toast/README.md</code> for exactly what's required. These are validated with a
            live call to Toast, then encrypted at rest server-side — never sent back to this browser.
          </p>
          <div>
            <label className="label">Environment</label>
            <select className="input" value={environment} onChange={(e) => setEnvironment(e.target.value)}>
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </div>
          <div>
            <label className="label">Client ID</label>
            <input className="input" required value={clientId} onChange={(e) => setClientId(e.target.value)} />
          </div>
          <div>
            <label className="label">Client secret</label>
            <input className="input" type="password" required value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
          </div>
          <div>
            <label className="label">Restaurant GUID</label>
            <input className="input" required value={restaurantGuid} onChange={(e) => setRestaurantGuid(e.target.value)} />
          </div>
          {connect.isError && <div className="text-sm text-rose-600">{(connect.error as any)?.message}</div>}
          <button className="btn-primary" disabled={connect.isPending}>
            {connect.isPending ? "Testing connection…" : "Connect & continue"}
          </button>
        </form>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">Pull your menu items from Toast so we know what's on it.</p>
          {!importMenu.isSuccess ? (
            <button className="btn-primary self-start" onClick={() => importMenu.mutate()} disabled={importMenu.isPending}>
              {importMenu.isPending ? "Importing menu…" : "Import Toast menu items"}
            </button>
          ) : (
            <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
              ✅ Imported {importMenu.data.total} menu item{importMenu.data.total === 1 ? "" : "s"} ({importMenu.data.created} new).
            </div>
          )}
          {importMenu.isError && <div className="text-sm text-rose-600">{(importMenu.error as any)?.message}</div>}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setStep(0)}>
              Back
            </button>
            <button className="btn-primary" disabled={!importMenu.isSuccess} onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            Modifiers (like "Extra Cheese") are detected automatically as Toast orders sync in — each modifier on an order is matched
            against your recipes' modifiers by name, and any that don't match yet show up for mapping the same way menu items do, on the{" "}
            <strong>Toast menu mapping</strong> page. There's nothing to import separately here — this step is just so you know what to
            expect once real orders start flowing in.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="btn-primary" onClick={() => setStep(3)}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            Connect each Toast menu item to the internal recipe that should be deducted when it sells. You can also finish this later from
            the Toast Integration page — anything left unmapped is clearly flagged there.
          </p>
          {unmapped.length === 0 ? (
            <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">✅ Everything is already mapped.</div>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
              {unmapped.map((m) => (
                <div key={m.id} className="flex items-center gap-2 border-b border-slate-100 p-2 last:border-0">
                  <span className="flex-1 truncate text-sm font-medium">{m.toastName}</span>
                  <select
                    className="input w-44"
                    defaultValue=""
                    onChange={(e) => e.target.value && map.mutate({ toastGuid: m.toastGuid, internalMenuItemId: e.target.value })}
                  >
                    <option value="" disabled>
                      Map to…
                    </option>
                    {menuItems?.map((mi) => (
                      <option key={mi.id} value={mi.id}>
                        {mi.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setStep(2)}>
              Back
            </button>
            <button className="btn-primary" onClick={() => setStep(4)}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">Optionally pull in past sales so your inventory history isn't starting from zero.</p>
          {!skippedHistorical && !importHistorical.isSuccess && (
            <>
              <div className="flex gap-2">
                {[
                  ["7", "Last 7 days"],
                  ["30", "Last 30 days"],
                  ["90", "Last 90 days"],
                  ["custom", "Custom"],
                ].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    className={`btn-secondary ${preset === val ? "!bg-brand-100 !text-brand-700" : ""}`}
                    onClick={() => applyPreset(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start date</label>
                  <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">End date</label>
                  <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={confirmedHistorical} onChange={(e) => setConfirmedHistorical(e.target.checked)} />
                I understand this will deduct inventory for every order in this range (already-synced orders are skipped automatically).
              </label>
              {importHistorical.isError && <div className="text-sm text-rose-600">{(importHistorical.error as any)?.message}</div>}
            </>
          )}
          {importHistorical.isSuccess && (
            <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
              ✅ Imported {importHistorical.data.ordersImported} order{importHistorical.data.ordersImported === 1 ? "" : "s"}.
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setStep(3)}>
              Back
            </button>
            {!importHistorical.isSuccess && (
              <button
                className="btn-secondary"
                onClick={() => {
                  setSkippedHistorical(true);
                  setStep(5);
                }}
              >
                Skip for now
              </button>
            )}
            <button
              className="btn-primary"
              disabled={importHistorical.isSuccess ? false : !confirmedHistorical || importHistorical.isPending}
              onClick={() => (importHistorical.isSuccess ? setStep(5) : importHistorical.mutate())}
            >
              {importHistorical.isSuccess ? "Continue" : importHistorical.isPending ? "Importing…" : "Import & continue"}
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-emerald-50 p-4 text-center">
            <div className="mb-2 text-3xl">🎉</div>
            <p className="font-semibold text-emerald-700">Toast is connected</p>
          </div>
          <ul className="text-sm text-slate-600">
            <li>✅ Connected to Toast ({environment})</li>
            <li>✅ Menu items imported</li>
            {unmapped.length > 0 && <li>⚠️ {unmapped.length} item(s) still need mapping — visible on the Toast Integration page</li>}
            {importHistorical.isSuccess && <li>✅ Historical sales imported</li>}
          </ul>
          <p className="text-sm text-slate-500">
            Going forward, new sales sync automatically on the schedule you set (or use "Sync Toast Now" any time).
          </p>
          <button className="btn-primary" onClick={finish}>
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}
