"use client";
import LazySection from "./LazySection";
import { getProductsAnalytics } from "@/actions/analytics";
import { money, num } from "@/lib/format";

type Data = Exclude<Awaited<ReturnType<typeof getProductsAnalytics>>, { error: string }>;

function ProductTable({ title, rows, valueKey, valueLabel }: { title: string; rows: any[]; valueKey: string; valueLabel: string }) {
  return (
    <div className="app-card overflow-x-auto">
      <h4 className="text-xs font-bold text-muted p-3 pb-1">{title}</h4>
      <table className="w-full text-sm text-right">
        <thead className="border-b text-muted"><tr><th className="p-2">المنتج</th><th>الكمية</th><th>{valueLabel}</th></tr></thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.productId || i} className="border-b last:border-0">
              <td className="p-2">{p.name}</td>
              <td>{num(p.qty ?? p.stockQty)}</td>
              <td className={valueKey === "profit" && p[valueKey] < 0 ? "text-red-600 font-semibold" : "font-semibold"}>{money(p[valueKey])}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-muted">لا يوجد</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function render(data: Data) {
  return (
    <div className="space-y-4">
      <ProductTable title="🏆 الأكثر مبيعًا (بالكمية)" rows={data.topSellers} valueKey="revenue" valueLabel="الإيراد" />
      <ProductTable title="💰 الأكثر ربحًا" rows={data.mostProfitable} valueKey="profit" valueLabel="الربح" />
      {data.leastProfitable.length > 0 && <ProductTable title="⚠️ الأقل ربحًا (من اللي اتباعوا فعلًا)" rows={data.leastProfitable} valueKey="profit" valueLabel="الربح" />}
      <div className="app-card overflow-x-auto">
        <h4 className="text-xs font-bold text-muted p-3 pb-1">🐢 منتجات راكدة (فيها مخزون ومبيعتش خالص في الفترة دي)</h4>
        <table className="w-full text-sm text-right">
          <thead className="border-b text-muted"><tr><th className="p-2">المنتج</th><th>الكمية في المخزون</th><th>قيمتها بالتكلفة</th></tr></thead>
          <tbody>
            {data.slowMovers.map((p) => (
              <tr key={p.productId} className="border-b last:border-0">
                <td className="p-2">{p.name}</td>
                <td>{num(p.stockQty)}</td>
                <td className="font-semibold">{money(p.stockValue)}</td>
              </tr>
            ))}
            {data.slowMovers.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-muted">مفيش منتجات راكدة - كل المخزون بيتحرك 👍</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ProductsSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <LazySection id="products" title="تحليل المنتجات" icon="📦" open={open} onToggle={onToggle} loader={getProductsAnalytics} render={render} />;
}
