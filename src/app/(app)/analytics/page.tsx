import AnalyticsDashboard from "./AnalyticsDashboard";

// صفحة "لوحة تحليلات الأعمال" - Business Management Dashboard شاملة (دفعة 16). الصلاحية المطلوبة
// (analytics.view) اتسجلت في lib/nav.ts وبتتفحص تلقائيًا في layout.tsx زي أي صفحة تانية في السيستم.
// كل جلب البيانات الفعلي بيحصل جوه AnalyticsDashboard (كومبوننت كلاينت) عشان الفلتر الزمني المشترك
// يقدر يحدّث كل الأقسام من غير إعادة تحميل الصفحة بالكامل.
export default function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">🧭 لوحة تحليلات الأعمال</h1>
        <p className="text-xs text-muted mt-1">
          نظرة شاملة على أداء الشركة - المبيعات والأرباح والمخزون والموظفين والعملاء في مكان واحد. غيّر الفترة الزمنية من الشريط تحت وكل الأقسام هتتحدّث. كل رقم هنا من بيانات حقيقية مسجّلة في السيستم - مفيش أي تقدير أو رقم مخترع، وأي بيانات ناقصة (زي تكلفة الإعلانات أو حضور الموظفين) متوضّحة صراحةً في القسم بتاعها بدل ما تتجاهل.
        </p>
      </div>
      <AnalyticsDashboard />
    </div>
  );
}
