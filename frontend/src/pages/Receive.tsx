import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/ui";
import QuickEntryTab from "../components/receiving/QuickEntryTab";
import UploadInvoiceTab from "../components/receiving/UploadInvoiceTab";

export default function Receive() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "upload" ? "upload" : "quick";

  return (
    <div>
      <PageHeader title="Receive Inventory" subtitle="Add stock in seconds — enter it directly, or upload the supplier's invoice" />

      <div className="mb-4 flex gap-2 border-b border-slate-200">
        <button
          className={`border-b-2 px-4 py-2 text-sm font-semibold ${tab === "quick" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500"}`}
          onClick={() => setParams({ tab: "quick" })}
        >
          Quick Manual Entry
        </button>
        <button
          className={`border-b-2 px-4 py-2 text-sm font-semibold ${tab === "upload" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500"}`}
          onClick={() => setParams({ tab: "upload" })}
        >
          📄 Upload Invoice
        </button>
      </div>

      {tab === "quick" ? <QuickEntryTab /> : <UploadInvoiceTab />}
    </div>
  );
}
