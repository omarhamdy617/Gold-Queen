import { getSettings } from "@/actions/settings";
import { listPaymentMethods, createPaymentMethodWithDrawer } from "@/actions/cash";
import { listLocations, createLocation } from "@/actions/products";
import { listExpenseCategories } from "@/actions/expenses";
import { listCouriers, listShippingCompanies } from "@/actions/orders";
import { listAllOrderSources } from "@/actions/orderSources";
import SettingsForm from "./SettingsForm";
import AddPaymentMethod from "./AddPaymentMethod";
import AddLocation from "./AddLocation";
import LocationList from "./LocationList";
import BackupButton from "./BackupButton";
import ExpenseCategoryManager from "./ExpenseCategoryManager";
import ShippingManager from "./ShippingManager";
import OrderSourceList from "./OrderSourceList";
import AddOrderSource from "./AddOrderSource";

export default async function SettingsPage() {
  // رجّعنا الاستعلامات السبعة دي تتبعت واحد ورا التاني بدل ما تتزاحم كلها في نفس اللحظة - نفس
  // إصلاح صفحة الأوردرات (شوف التعليق هناك).
  const settings = await getSettings();
  const paymentMethods = await listPaymentMethods();
  const locations = await listLocations();
  const expenseCategories = await listExpenseCategories();
  const couriers = await listCouriers();
  const shippingCompanies = await listShippingCompanies();
  const orderSources = await listAllOrderSources();
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">الإعدادات العامة</h1>
      <SettingsForm settings={settings} />

      <div className="app-card p-4 space-y-3">
        <h2 className="font-bold">طرق الدفع والخزائن</h2>
        <ul className="text-sm space-y-1">
          {paymentMethods.map((m) => <li key={m.id}>• {m.name}</li>)}
        </ul>
        <AddPaymentMethod />
      </div>

      <div className="app-card p-4 space-y-3">
        <h2 className="font-bold">الفروع (المحل / المخزن)</h2>
        <LocationList locations={locations} />
        <AddLocation />
      </div>

      <ExpenseCategoryManager categories={expenseCategories} />

      <ShippingManager couriers={couriers} shippingCompanies={shippingCompanies} />

      <div className="app-card p-4 space-y-3">
        <h2 className="font-bold">مصادر الأوردر</h2>
        <p className="text-xs text-muted">المصادر دي بتظهر في القايمة المنسدلة وقت تسجيل فاتورة بيع أو أوردر جديد، وفي عمود "المصدر" في شاشتي الفواتير والأوردرات - عشان تعرف أكتر مبيعاتك جايالك منين.</p>
        <OrderSourceList sources={orderSources} />
        <AddOrderSource />
      </div>

      <div className="app-card p-4 space-y-3">
        <h2 className="font-bold">النسخ الاحتياطي</h2>
        <p className="text-xs text-muted">نسخة احتياطية تلقائية دورية متظبطة على السيرفر، وتقدر تنزل نسخة يدوية دلوقتي في أي وقت.</p>
        <BackupButton />
      </div>
    </div>
  );
}
