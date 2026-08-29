import { listProductsWithStock } from "@/actions/products";
import BarcodeSheet from "./BarcodeSheet";

export default async function BarcodePage() {
  const products = await listProductsWithStock();
  return <BarcodeSheet products={products.map((p) => ({ id: p.id, name: p.name, barcode: p.barcode, retailPrice: p.retailPrice }))} />;
}
