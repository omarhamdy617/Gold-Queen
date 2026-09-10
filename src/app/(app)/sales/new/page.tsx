import { listProductsWithStock, listLocations } from "@/actions/products";
import { listCustomers } from "@/actions/customers";
import { listPaymentMethods } from "@/actions/cash";
import { listOrderSources } from "@/actions/orderSources";
import NewInvoiceForm from "./NewInvoiceForm";

export default async function NewSalePage() {
  // رجّعنا الاستعلامات الخمسة دي تتبعت واحد ورا التاني بدل ما تتزاحم كلها في نفس اللحظة - نفس
  // إصلاح صفحة الأوردرات (شوف التعليق هناك).
  const products = await listProductsWithStock();
  const locations = await listLocations();
  const customers = await listCustomers();
  const paymentMethods = await listPaymentMethods();
  const orderSources = await listOrderSources();
  return (
    <NewInvoiceForm
      products={products}
      locations={locations}
      customers={customers}
      paymentMethods={paymentMethods}
      orderSources={orderSources}
    />
  );
}
