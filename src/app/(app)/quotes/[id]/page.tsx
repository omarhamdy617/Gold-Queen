import { getQuote } from "@/actions/sales";
import { money, dateAr } from "@/lib/format";
import { notFound } from "next/navigation";
import PrintButton from "@/components/PrintButton";
import WhatsAppShareButton from "./WhatsAppShareButton";

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getQuote(id);
  if (!data?.quote) return notFound();
  const { quote, items } = data;

  const message = buildMessage(quote, items);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="no-print flex justify-end gap-2">
        <WhatsAppShareButton phone={quote.customerPhone || ""} message={message} />
        <PrintButton />
      </div>
      <div className="bg-white rounded-xl shadow p-8 print:shadow-none">
        <div className="flex items-center justify-between border-b pb-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gold">جولد كوين</h1>
            <p className="text-xs text-neutral-500">عرض سعر</p>
          </div>
          <div className="text-left">
            <p className="font-mono text-sm">{quote.code}</p>
            <p className="text-xs text-neutral-500">{dateAr(quote.createdAt)}</p>
          </div>
        </div>
        {quote.customerName && <p className="mb-4 text-sm"><span className="text-neutral-500">العميل: </span>{quote.customerName}</p>}
        <table className="w-full text-sm mb-4">
          <thead><tr className="border-b text-neutral-500 text-right"><th className="py-2">الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b last:border-0">
                <td className="py-2">{it.productName}</td><td>{it.quantity}</td><td>{money(it.unitPrice)}</td><td>{money(Number(it.unitPrice) * it.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-1 text-sm border-t pt-3">
          <div className="flex justify-between"><span>الإجمالي الفرعي</span><span>{money(quote.subtotal)}</span></div>
          {quote.vatEnabled && <div className="flex justify-between"><span>ضريبة القيمة المضافة ({quote.vatRate}%)</span><span>مضمنة</span></div>}
          <div className="flex justify-between font-bold text-base"><span>الإجمالي النهائي</span><span>{money(quote.total)}</span></div>
        </div>
      </div>
    </div>
  );
}

function buildMessage(quote: any, items: any[]) {
  let msg = `عرض سعر من جولد كوين - ${quote.code}\n\n`;
  for (const it of items) msg += `${it.productName} × ${it.quantity} = ${Number(it.unitPrice) * it.quantity} ج.م\n`;
  msg += `\nالإجمالي: ${quote.total} ج.م`;
  return msg;
}
