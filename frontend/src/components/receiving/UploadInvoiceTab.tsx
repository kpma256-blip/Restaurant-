import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { ParsedInvoiceResponse, Product, Supplier, Unit } from "../../types";
import SearchableSelect from "../SearchableSelect";
import { Badge } from "../ui";
import { dateStr, money, toInputDate } from "../../lib/format";
import QuickCreateProductModal from "./QuickCreateProductModal";

interface ReviewItem {
  key: number;
  rawDescription: string;
  quantity: string;
  unitCode: string;
  unitCost: string;
  productId: string;
  matchSource: "ALIAS" | "FUZZY" | "NONE" | "MANUAL";
  matchConfidence: number;
}

let keySeq = 0;

export default function UploadInvoiceTab() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: products } = useQuery<Product[]>({ queryKey: ["products"], queryFn: () => api.get("/products") });
  const { data: suppliers } = useQuery<Supplier[]>({ queryKey: ["suppliers"], queryFn: () => api.get("/suppliers") });
  const { data: units } = useQuery<Unit[]>({ queryKey: ["units"], queryFn: () => api.get("/units") });

  const [parsed, setParsed] = useState<ParsedInvoiceResponse | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(toInputDate(new Date()));
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [createForItem, setCreateForItem] = useState<{ key: number; name: string } | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const productOptions = (products ?? []).map((p) => ({ value: p.id, label: p.name, sublabel: `${p.currentQuantity} ${p.inventoryUnitCode} on hand` }));

  const parse = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return fetch("/api/receiving/parse", { method: "POST", body: form }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to parse invoice");
        return data as ParsedInvoiceResponse;
      });
    },
    onSuccess: (data) => {
      setParsed(data);
      setSupplierId(data.supplierId ?? "");
      setInvoiceNumber(data.invoiceNumber ?? "");
      setPurchaseDate(data.invoiceDate ? toInputDate(new Date(data.invoiceDate)) : toInputDate(new Date()));
      setItems(
        data.items.map((i) => ({
          key: keySeq++,
          rawDescription: i.rawDescription,
          quantity: i.quantity != null ? String(i.quantity) : "",
          unitCode: i.unitCode ?? "",
          unitCost: i.unitPrice != null ? String(i.unitPrice) : "",
          productId: i.match.productId ?? "",
          matchSource: i.match.source,
          matchConfidence: i.match.confidence,
        }))
      );
    },
  });

  const confirm = useMutation({
    mutationFn: () =>
      api.post("/receiving/confirm", {
        purchaseDate,
        supplierId: supplierId || undefined,
        invoiceNumber: invoiceNumber || undefined,
        draftStoragePath: parsed!.draftStoragePath,
        fileOriginalName: fileInputRef.current?.files?.[0]?.name,
        fileHash: parsed!.fileHash,
        items: items
          .filter((i) => i.productId && i.quantity && i.unitCode)
          .map((i) => ({
            productId: i.productId,
            quantity: Number(i.quantity),
            unitCode: i.unitCode,
            unitCost: i.unitCost ? Number(i.unitCost) : undefined,
            rawDescription: i.rawDescription,
          })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["receiving-history"] });
      setConfirmation("Invoice confirmed — inventory updated.");
      setParsed(null);
      setItems([]);
    },
  });

  const cancelReview = () => {
    if (parsed) api.post("/receiving/discard-draft", { draftStoragePath: parsed.draftStoragePath }).catch(() => {});
    setParsed(null);
    setItems([]);
  };

  const updateItem = (key: number, patch: Partial<ReviewItem>) => setItems((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  if (confirmation && !parsed) {
    return (
      <div className="rounded-xl bg-emerald-50 p-6 text-center">
        <div className="mb-2 text-3xl">✅</div>
        <p className="font-semibold text-emerald-700">{confirmation}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button className="btn-secondary" onClick={() => setConfirmation(null)}>
            Upload another invoice
          </button>
          <Link to="/receiving" className="btn-primary">
            View receiving history
          </Link>
        </div>
      </div>
    );
  }

  if (!parsed) {
    return (
      <div>
        <label className="card flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-300 p-10 text-center hover:border-brand-400 hover:bg-brand-50/40">
          <span className="text-4xl">📄</span>
          <span className="font-semibold text-slate-700">{parse.isPending ? "Reading invoice…" : "Upload Invoice PDF"}</span>
          <span className="text-sm text-slate-500">Text-based or scanned — supplier invoice, receipt, or packing slip</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={parse.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) parse.mutate(file);
            }}
          />
        </label>
        {parse.isError && <div className="mt-3 text-sm text-rose-600">{(parse.error as any)?.message}</div>}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 rounded-xl bg-blue-50 p-4">
        <div className="font-bold text-blue-900">INVOICE DETECTED</div>
        {parsed.usedOcr && (
          <p className="mt-1 text-xs text-blue-700">
            This looked like a scanned document, so text was read with OCR (confidence {Math.round(parsed.ocrConfidence ?? 0)}%) — double-check
            quantities and prices carefully below.
          </p>
        )}
      </div>

      {parsed.duplicateOf && (
        <div className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          ⚠️ This invoice file appears to already be in your receiving history (received {dateStr(parsed.duplicateOf.purchaseDate)}). Saving again
          will be blocked to avoid double-counting inventory.{" "}
          <Link to={`/receiving/${parsed.duplicateOf.purchaseId}`} className="font-semibold underline">
            View that record
          </Link>
          .
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Supplier</label>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— {parsed.supplierGuess ?? "unknown"} —</option>
            {suppliers?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Invoice #</label>
          <input className="input" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Invoice Item</th>
              <th className="px-3 py-2 text-left">Matched Product</th>
              <th className="px-3 py-2 text-left">Qty</th>
              <th className="px-3 py-2 text-left">Unit</th>
              <th className="px-3 py-2 text-left">Price</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.key}>
                <td className="min-w-[160px] px-3 py-2">
                  <input
                    className="input"
                    value={item.rawDescription}
                    onChange={(e) => updateItem(item.key, { rawDescription: e.target.value })}
                  />
                </td>
                <td className="min-w-[220px] px-3 py-2">
                  <SearchableSelect
                    options={productOptions}
                    value={item.productId || null}
                    placeholder="Choose product…"
                    allowCreate
                    onChange={(val) => updateItem(item.key, { productId: val, matchSource: "MANUAL" })}
                    onCreateNew={(typed) => setCreateForItem({ key: item.key, name: typed })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="any"
                    className="input w-20"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2">
                  <select className="input w-24" value={item.unitCode} onChange={(e) => updateItem(item.key, { unitCode: e.target.value })}>
                    <option value="">Unit…</option>
                    {units?.map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.code}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="any"
                    className="input w-24"
                    value={item.unitCost}
                    onChange={(e) => updateItem(item.key, { unitCost: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2">
                  {item.productId ? (
                    item.matchSource === "ALIAS" ? (
                      <Badge tone="green">✓ Remembered</Badge>
                    ) : item.matchSource === "FUZZY" ? (
                      <Badge tone="amber">Suggested</Badge>
                    ) : (
                      <Badge tone="blue">Selected</Badge>
                    )
                  ) : (
                    <Badge tone="red">No match</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirm.isError && <div className="mt-3 text-sm text-rose-600">{(confirm.error as any)?.message}</div>}

      <div className="mt-4 flex gap-2">
        <button className="btn-secondary" onClick={cancelReview}>
          Cancel
        </button>
        <button
          className="btn-primary"
          disabled={confirm.isPending || items.every((i) => !i.productId)}
          onClick={() => confirm.mutate()}
        >
          {confirm.isPending ? "Saving…" : "Save & Add to Inventory"}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Items with a confirmed product are remembered for this supplier — next time this text appears on an invoice from them, it'll match
        automatically.
      </p>

      {createForItem && (
        <QuickCreateProductModal
          open
          initialName={createForItem.name}
          onClose={() => setCreateForItem(null)}
          onCreated={(product) => {
            updateItem(createForItem.key, { productId: product.id, matchSource: "MANUAL" });
            setCreateForItem(null);
          }}
        />
      )}
    </div>
  );
}
