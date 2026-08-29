import { listQuotes } from "@/actions/sales";
import { listProductsWithStock } from "@/actions/products";
import { listCustomers } from "@/actions/customers";
import { money, dateAr } from "@/lib/format";
import QuoteForm from "./QuoteForm";
import Link from "next/link";

export default async function QuotesPage() {
  const [quotes, products, customers] = await Promise.all([listQuotes(), listProductsWithStock(), listCustomers()]);
  const templates = quotes.filter((q) => q.isTemplate);
  const regular = quotes.filter((q) => !q.isTemplate);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">عروض الأسعار</h1>
      <QuoteForm products={products} customers={customers} templates={templates} />
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b text-neutral-500">
              <th className="p-3">الكود</th>
              <th>العميل</th>
              <th>الإجمالي</th>
              <th>التاريخ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {regular.map((q) => (
              <tr key={q.id} className="border-b last:border-0">
                <td className="p-3 font-mono text-xs">{q.code}</td>
                <td>{q.customerName || "-"}</td>
                <td>{money(q.total)}</td>
                <td>{dateAr(q.createdAt)}</td>
                <td><Link href={`/quotes/${q.id}`} className="text-gold text-xs">عرض</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
