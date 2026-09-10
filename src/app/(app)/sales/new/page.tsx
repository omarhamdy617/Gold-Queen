import { listProductsWithStock, listLocations } from "@/actions/products";
import { listCustomers } from "@/actions/customers";
import { listPaymentMethods } from "@/actions/cash";
import { listOrderSources } from "@/actions/orderSources";
import NewInvoiceForm from "./NewInvoiceForm";

export default async function NewSalePage() {
  const [products, locations, customers, paymentMethods, orderSources] = await Promise.all([
    listProductsWithStock(),
    listLocations(),
    listCustomers(),
    listPaymentMethods(),
    listOrderSources(),
  ]);
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
