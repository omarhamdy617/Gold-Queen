import { listProductsWithStock, listCategories, getReorderAlerts } from "@/actions/products";
import { listLocations } from "@/actions/products";
import { money, num } from "@/lib/format";
import ProductForm from "./ProductForm";
import EditProductButton from "./EditProductButton";
import Link from "next/link";
import { can } from "@/lib/auth";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  // رجّعنا الاستعلامات الأربعة دي تتبعت واحد ورا التاني بدل ما تتزاحم كلها في نفس اللحظة - نفس
  // إصلاح صفحة الأوردرات (شوف التعليق هناك).
  const products = await listProductsWithStock(q);
  const categories = await listCategories();
  const locations = await listLocations();
  const alerts = await getReorderAlerts();
  // "متوسط التكلفة" رقم حساس (بيوضح هامش الربح) - مش كل حد عنده صلاحية "عرض المنتجات" العادية
  // المفروض يشوفه بالضرورة (زي موظف الشحن أو الكاشير). افتراضيًا الأدمن والمحاسب بس عندهم الصلاحية دي.
  const canSeeCost = await can("inventory.cost.view");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">المنتجات والمخزون</h1>
        <div className="flex gap-4">
          <Link href="/products/by-location" className="text-sm text-primary hover:underline">
            المخزون حسب المكان ←
          </Link>
          <Link href="/products/barcode" className="text-sm text-gold hover:underline">
            طباعة ملصقات باركود ←
          </Link>
        </div>
      </div>

      {(alerts.manual.length > 0 || alerts.smart.length > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
          <h2 className="font-bold text-red-700">⚠️ تنبيهات نواقص المخزون</h2>
          {alerts.manual.length > 0 && (
            <div className="text-sm">
              <span className="font-semibold">وصلت للحد اليدوي: </span>
              {alerts.manual.map((p) => p.name).join("، ")}
            </div>
          )}
          {alerts.smart.length > 0 && (
            <div className="text-sm">
              <span className="font-semibold">القائمة الذكية (هتنفد خلال أسبوعين بناءً على معدل البيع): </span>
              {alerts.smart.map((p) => `${p.name} (${Math.round(p.daysLeft)} يوم متبقي)`).join("، ")}
            </div>
          )}
        </div>
      )}

      <ProductForm categories={categories} />

      <div className="app-card p-4 text-sm text-muted leading-relaxed">
        💡 <b>الفرق بين الشاشات:</b> "المنتجات" هي بطاقة الصنف نفسه (اسمه، سعره، باركوده) وبتتسجل <b>مرة واحدة بس</b>. أما "المشتريات" فهي كل عملية شراء فعلية بتحصل من مورد (بتزوّد الكمية في المخزون وبتحدّث متوسط التكلفة تلقائيًا). يعني: تسجّل المنتج مرة، وبعدين كل مرة تشتريه تسجّل "مشترى جديد" لنفس المنتج ده من غير ما تعيد إنشاءه.
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="بحث بالاسم أو الباركود أو الكود"
          className="border rounded-lg px-3 py-2 text-sm flex-1 max-w-sm"
        />
        <button className="bg-neutral-800 text-white rounded-lg px-4 py-2 text-sm">بحث</button>
      </form>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm text-right min-w-[800px]">
          <thead>
            <tr className="border-b text-neutral-500">
              <th className="p-3">المنتج</th>
              <th>الباركود</th>
              <th>سعر الجملة</th>
              <th>سعر التجزئة</th>
              {canSeeCost && <th>متوسط التكلفة</th>}
              {locations.map((l) => (
                <th key={l.id}>{l.name}</th>
              ))}
              <th>الإجمالي</th>
              <th>حد الطلب</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className={`border-b last:border-0 ${p.totalStock <= p.reorderPoint ? "bg-red-50" : ""}`}>
                <td className="p-3 font-medium">
                  <div className="flex items-center gap-2">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-background flex-shrink-0" />
                    )}
                    <span>{p.name}{p.requiresSerial && <span className="mr-1 text-xs text-gold">(سيريال)</span>}</span>
                  </div>
                </td>
                <td className="font-mono text-xs">{p.barcode}</td>
                <td>{money(p.wholesalePrice)}</td>
                <td>{money(p.retailPrice)}</td>
                {canSeeCost && <td>{money(p.avgCost)}</td>}
                {locations.map((l) => (
                  <td key={l.id}>{num(p.stockByLocation[l.id] || 0)}</td>
                ))}
                <td className="font-bold">{num(p.totalStock)}</td>
                <td>{num(p.reorderPoint)}</td>
                <td>
                  <EditProductButton
                    // لو المستخدم مش عنده صلاحية شوف التكلفة، بنشيل avgCost من الأوبچكت نفسه قبل ما
                    // نبعته لـ EditProductButton - ده Client Component، فأي قيمة موجودة في الـ prop
                    // بتتبعت للمتصفح جوه استجابة الصفحة سواء استخدمناها في الفورم أو لأ، حتى لو
                    // العمود نفسه في الجدول مش ظاهر. الفورم أصلًا مش بيستخدم avgCost في أي حقل.
                    product={canSeeCost ? p : (({ avgCost, ...rest }) => rest)(p)}
                    categories={categories}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
