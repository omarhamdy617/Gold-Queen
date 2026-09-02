import { getCustomer, customerStatement } from "@/actions/customers";
import { listPaymentMethods } from "@/actions/cash";
import { money, dateAr } from "@/lib/format";
import { notFound } from "next/navigation";
import CollectionForm from "./CollectionForm";
import PeriodPicker from "./PeriodPicker";

export default async function CustomerDetailPage({
  params,
  searchParams,import { getCustomer, customerStatement } from "@/actions/customers";
import { listPaymentMethods } from "@/actions/cash";
import { money, dateAr } from "@/lib/format";
import { notFound } from "next/navigation";
import CollectionForm from "./CollectionForm";
import PeriodPicker from "./PeriodPicker";
import { buildCustomerTimeline } from "@/lib/statement";

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const { from, to } = await searchParams;
  const customer = await getCustomer(id);
  if (!customer) return notFound();

  const fromDate = from ? new Date(from) : new Date(new Date().setMonth(new Date().getMonth() - 3));
  const toDate = to ? new Date(to) : new Date();
  const { invoices, payments } = await customerStatement(id, fromDate, toDate);
  const paymentMethods = await listPaymentMethods();

  const { rows: timeline, opening } = buildCustomerTimeline(Number(customer.balance), invoices, payments);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">{customer.name}</h1>
          <p className="text-sm text-neutral-500">{customer.type === "TRADER" ? "تاجر" : "فرد"} · {customer.phone}</p>
        </div>
        <div className="bg-white rounded-xl shadow px-5 py-3 text-center">
          <div className="text-xs text-neutral-500">الرصيد الحالي</div>
          <div className={`text-xl font-bold ${Number(customer.balance) > 0 ? "text-red-600" : ""}`}>{money(customer.balance)}</div>
        </div>
      </div>

      <CollectionForm customerId={id} paymentMethods={paymentMethods} />

      {customer.orders && customer.orders.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4 space-y-2">
          <h2 className="font-bold">أوردرات العميل</h2>
          <table className="w-full text-sm text-right">
            <thead><tr className="border-b text-neutral-500"><th className="py-2">الكود</th><th>الحالة</th><th>التاريخ</th></tr></thead>
            <tbody>
              {customer.orders.map((o: any) => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="py-2"><a href={`/orders/${o.id}`} className="text-primary underline font-mono text-xs">{o.code}</a></td>
                  <td>{o.status}</td>
                  <td className="text-xs">{dateAr(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold">كشف الحساب</h2>
          <div className="flex gap-2 items-center">
            <PeriodPicker from={from} to={to} />
            <a href={`/api/export/customer-statement/${id}?from=${fromDate.toISOString()}&to=${toDate.toISOString()}&format=excel`} className="text-xs bg-green-700 text-white rounded px-3 py-1.5">Excel</a>
            <a href={`/api/export/customer-statement/${id}?from=${fromDate.toISOString()}&to=${toDate.toISOString()}&format=pdf`} className="text-xs bg-red-700 text-white rounded px-3 py-1.5">PDF</a>
          </div>
        </div>
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b text-neutral-500">
              <th className="py-2">التاريخ</th><th>البيان</th><th>مرجع</th><th>مدين (عليه)</th><th>دائن (له)</th><th>الرصيد</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b bg-neutral-50 text-neutral-500">
              <td className="py-2" colSpan={5}>رصيد افتتاحي (أول الفترة)</td>
              <td className="font-medium">{money(opening)}</td>
            </tr>
            {timeline.map((t, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2">{dateAr(t.date)}</td>
                <td>{t.type}</td>
                <td className="font-mono text-xs">{t.ref}</td>
                <td>{t.debit ? money(t.debit) : "-"}</td>
                <td>{t.credit ? money(t.credit) : "-"}</td>
                <td className="font-medium">{money(t.balance!)}</td>
              </tr>
            ))}
            {timeline.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-neutral-400">لا توجد حركات في الفترة دي</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const { from, to } = await searchParams;
  const customer = await getCustomer(id);
  if (!customer) return notFound();

  const fromDate = from ? new Date(from) : new Date(new Date().setMonth(new Date().getMonth() - 3));
  const toDate = to ? new Date(to) : new Date();
  const { invoices, payments } = await customerStatement(id, fromDate, toDate);
  const paymentMethods = await listPaymentMethods();

  const timeline = [
    ...invoices.map((i) => ({ date: i.createdAt, type: "فاتورة بيع", ref: i.code, debit: Number(i.total), credit: 0 })),
    ...payments.map((p) => ({ date: p.createdAt, type: "تحصيل", ref: "-", debit: 0, credit: Number(p.amount) })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">{customer.name}</h1>
          <p className="text-sm text-neutral-500">{customer.type === "TRADER" ? "تاجر" : "فرد"} · {customer.phone}</p>
        </div>
        <div className="bg-white rounded-xl shadow px-5 py-3 text-center">
          <div className="text-xs text-neutral-500">الرصيد الحالي</div>
          <div className={`text-xl font-bold ${Number(customer.balance) > 0 ? "text-red-600" : ""}`}>{money(customer.balance)}</div>
        </div>
      </div>

      <CollectionForm customerId={id} paymentMethods={paymentMethods} />

      {customer.orders && customer.orders.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4 space-y-2">
          <h2 className="font-bold">أوردرات العميل</h2>
          <table className="w-full text-sm text-right">
            <thead><tr className="border-b text-neutral-500"><th className="py-2">الكود</th><th>الحالة</th><th>التاريخ</th></tr></thead>
            <tbody>
              {customer.orders.map((o: any) => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="py-2"><a href={`/orders/${o.id}`} className="text-primary underline font-mono text-xs">{o.code}</a></td>
                  <td>{o.status}</td>
                  <td className="text-xs">{dateAr(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold">كشف الحساب</h2>
          <div className="flex gap-2 items-center">
            <PeriodPicker from={from} to={to} />
            <a href={`/api/export/customer-statement/${id}?from=${fromDate.toISOString()}&to=${toDate.toISOString()}&format=excel`} className="text-xs bg-green-700 text-white rounded px-3 py-1.5">Excel</a>
            <a href={`/api/export/customer-statement/${id}?from=${fromDate.toISOString()}&to=${toDate.toISOString()}&format=pdf`} className="text-xs bg-red-700 text-white rounded px-3 py-1.5">PDF</a>
          </div>
        </div>
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b text-neutral-500">
              <th className="py-2">التاريخ</th><th>البيان</th><th>مرجع</th><th>مدين (عليه)</th><th>دائن (له)</th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((t, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2">{dateAr(t.date)}</td>
                <td>{t.type}</td>
                <td className="font-mono text-xs">{t.ref}</td>
                <td>{t.debit ? money(t.debit) : "-"}</td>
                <td>{t.credit ? money(t.credit) : "-"}</td>
              </tr>
            ))}
            {timeline.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-neutral-400">لا توجد حركات في الفترة دي</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
