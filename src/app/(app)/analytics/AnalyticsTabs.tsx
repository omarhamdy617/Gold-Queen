"use client";
import { useState } from "react";
import SalesSection from "./SalesSection";
import FinancialSection from "./FinancialSection";
import ProductsSection from "./ProductsSection";
import InventorySection from "./InventorySection";
import EmployeesSection from "./EmployeesSection";
import MarketingSection from "./MarketingSection";
import CustomersSection from "./CustomersSection";
import OperationsSection from "./OperationsSection";

// كل الأقسام دي Mounted طول الوقت (نفس فكرة ConsignmentPanels) بس واحد بس مفتوح في نفس اللحظة -
// فتح قسم جديد بيقفل اللي قبله تلقائيًا (تاب واحد مفتوح بس)، وده بيضمن إن استعلامات قسمين مختلفين
// ميتفجروش مع بعض في نفس اللحظة من ضغطة واحدة. القسم اللي اتقفل بيفضل فاكر آخر بيانات جابها.
export default function AnalyticsTabs() {
  const [active, setActive] = useState<string | null>(null);
  const toggle = (id: string) => setActive((cur) => (cur === id ? null : id));

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-base">📂 تفاصيل الأقسام - اضغط على أي قسم عشان تشوف تفاصيله</h2>
      <SalesSection open={active === "sales"} onToggle={() => toggle("sales")} />
      <FinancialSection open={active === "financial"} onToggle={() => toggle("financial")} />
      <ProductsSection open={active === "products"} onToggle={() => toggle("products")} />
      <InventorySection open={active === "inventory"} onToggle={() => toggle("inventory")} />
      <EmployeesSection open={active === "employees"} onToggle={() => toggle("employees")} />
      <MarketingSection open={active === "marketing"} onToggle={() => toggle("marketing")} />
      <CustomersSection open={active === "customers"} onToggle={() => toggle("customers")} />
      <OperationsSection open={active === "operations"} onToggle={() => toggle("operations")} />
    </div>
  );
}
