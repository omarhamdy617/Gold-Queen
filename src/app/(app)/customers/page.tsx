import { listCustomers } from "@/actions/customers";
import { money } from "@/lib/format";
import Link from "next/link";
import CustomerForm from "./CustomerForm";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; owes?: string }>;
}) {
  const { q, type, owes } = await searchParams;
  const customers = await listCustomers(q, {
    type: type === "TRADER" || type === "RETAIL" ? type : undefined,
    owesOnly: owes === "1",
  });
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">العملاء والتجار</h1>
      <CustomerForm />
      <form className="flex flex-wrap gap-2 items-center">
        <input name="q" defaultValue={q} placeholder="بحث بالاسم أو الهاتف" className="border rounded-lg px-3 py-2 text-sm flex-1 max-w-sm" />
        <select name="type" defaultValue={type || ""} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">الكل (فرد وتاجر)</option>
          <option value="TRADER">تجار بس</option>
          <option value="RETAIL">أفراد بس</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm border rounded-lg px-3 py-2">
          <input type="checkbox" name="owes" value="1" defaultChecked={owes === "1"} /> عليه فلوس بس
        </label>
        <button className="bg-neutral-800 text-white rounded-lg px-4 py-2 text-sm">فلترة</button>
        {(q || type || owes) && <a href="/customers" className="text-xs text-muted underline">مسح الفلاتر</a>}
      </form>
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b text-neutral-500">
              <th className="p-3">الاسم</th>
              <th>النوع</th>
              <th>الهاتف</th>
              <th>حد الائتمان</th>
              <th>الرصيد الحالي</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className={`border-b last:border-0 ${c.creditLimit && Number(c.balance) >= Number(c.creditLimit) && Number(c.creditLimit) > 0 ? "bg-red-50" : ""}`}>
                <td className="p-3 font-medium">{c.name}</td>
                <td>{c.type === "TRADER" ? "تاجر" : "فرد"}</td>
                <td>{c.phone}</td>
                <td>{c.type === "TRADER" ? money(c.creditLimit) : "-"}</td>
                <td className={Number(c.balance) > 0 ? "text-red-600 font-bold" : ""}>{money(c.balance)}</td>
                <td><Link href={`/customers/${c.id}`} className="text-gold text-xs">كشف حساب</Link></td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-muted">مفيش عملاء مطابقين للفلترة دي</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
