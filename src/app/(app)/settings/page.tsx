import { getSettings } from "@/actions/settings";
import { listPaymentMethods, createPaymentMethodWithDrawer } from "@/actions/cash";
import { listLocations, createLocation } from "@/actions/products";
import SettingsForm from "./SettingsForm";
import AddPaymentMethod from "./AddPaymentMethod";
import AddLocation from "./AddLocation";
import BackupButton from "./BackupButton";

export default async function SettingsPage() {
  const [settings, paymentMethods, locations] = await Promise.all([getSettings(), listPaymentMethods(), listLocations()]);
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">الإعدادات العامة</h1>
      <SettingsForm settings={settings} />

      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <h2 className="font-bold">طرق الدفع والخزائن</h2>
        <ul className="text-sm space-y-1">
          {paymentMethods.map((m) => <li key={m.id}>• {m.name}</li>)}
        </ul>
        <AddPaymentMethod />
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <h2 className="font-bold">الفروع (المحل / المخزن)</h2>
        <ul className="text-sm space-y-1">
          {locations.map((l) => <li key={l.id}>• {l.name} ({l.type === "SHOP" ? "محل" : l.type === "WAREHOUSE" ? "مخزن" : "أخرى"})</li>)}
        </ul>
        <AddLocation />
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <h2 className="font-bold">النسخ الاحتياطي</h2>
        <p className="text-xs text-neutral-500">نسخة احتياطية تلقائية دورية متظبطة على السيرفر، وتقدر تنزل نسخة يدوية دلوقتي في أي وقت.</p>
        <BackupButton />
      </div>
    </div>
  );
}
