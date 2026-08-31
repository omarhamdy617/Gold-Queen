import { listSuppliers, getTotalSuppliersPayable } from "@/actions/purchases";
import { money } from "@/lib/format";
import Link from "next/link";

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [suppliers, totalPayable] = await Promise.all([listSuppliers(q), getTotalSuppliersPayable()]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">الموردين</h1>

      <div className="app-card p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-muted">إجمالي المستحق لكل الموردين (اللي عليك)</div>
          <div className="text-2xl font-bold text-red-600">{money(totalPayable)}</div>
        </div>
      </div>

      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="بحث بالاسم أو رقم الهاتف" className="border rounded-lg px-3 py-2 text-sm flex-1 max-w-sm" />
        <button className="bg-primary text-white rounded-lg px-4 py-2 text-sm">بحث</button>
      </form>

      <div className="app-card overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b text-muted">
              <th className="p-3">الاسم</th><th>الهاتف</th><th>المستحق عليّ</th><th></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="p-3">{s.name}</td>
                <td>{s.phone || "-"}</td>
                <td className={Number(s.balance) > 0 ? "text-red-600 font-medium" : ""}>{money(s.balance)}</td>
                <td className="p-2"><Link href={`/suppliers/${s.id}`} className="text-primary text-xs underline">فتح كشف الحساب</Link></td>
              </tr>
            ))}
            {suppliers.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted">مفيش موردين لسه - سجل مورد جديد من شاشة المشتريات</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
