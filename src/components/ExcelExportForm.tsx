import { cairoStartOfMonth, cairoYmd } from "@/lib/time";

// زرار "تنزيل Excel" مع اختيار الفترة - فورم GET عادي بيفتح رابط التصدير، والمتصفح بينزّل الملف على
// طول من غير ما يسيب الصفحة. الافتراضي: من أول الشهر الحالي لحد النهارده (بتوقيت القاهرة).
export default function ExcelExportForm({
  action,
  label = "تنزيل Excel",
  from,
  to,
}: {
  action: string;
  label?: string;
  from?: string;
  to?: string;
}) {
  const defFrom = from || cairoYmd(cairoStartOfMonth());
  const defTo = to || cairoYmd(new Date());
  return (
    <form method="get" action={action} className="no-print flex items-end gap-2 flex-wrap">
      <div>
        <label className="text-[11px] text-muted block mb-0.5">من</label>
        <input type="date" name="from" defaultValue={defFrom} className="border rounded px-2 py-1.5 text-xs" />
      </div>
      <div>
        <label className="text-[11px] text-muted block mb-0.5">إلى</label>
        <input type="date" name="to" defaultValue={defTo} className="border rounded px-2 py-1.5 text-xs" />
      </div>
      <button className="border border-green-700 text-green-800 rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-green-50">{label}</button>
    </form>
  );
}
