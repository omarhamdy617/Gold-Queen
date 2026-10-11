import { getCapitalPageData } from "@/actions/capital";
import { money, dateAr } from "@/lib/format";
import { cairoStartOfDay, cairoStartOfMonth } from "@/lib/time";
import CapitalForm from "./CapitalForm";
import CapitalRowActions from "./CapitalRowActions";

const DAY_MS = 24 * 60 * 60 * 1000;
const isDateParam = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

// "YYYY-MM-DD" بيتفسّر كيوم بتوقيت القاهرة (مش UTC) - الظهر UTC لنفس التاريخ دايمًا بيقع في نفس اليوم
// في القاهرة، فـ cairoStartOfDay بيرجع بداية اليوم الصح من غير ما حركة حصلت بعد نص الليل بساعة تقع برا الفترة.
function cairoDayStart(ymd: string) {
  return cairoStartOfDay(new Date(ymd + "T12:00:00Z"));
}
function cairoDayEnd(ymd: string) {
  return new Date(cairoStartOfDay(new Date(new Date(ymd + "T12:00:00Z").getTime() + DAY_MS)).getTime() - 1);
}
function cairoYmd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className={`font-bold tabular-nums ${tone === "green" ? "text-green-700" : tone === "red" ? "text-red-600" : ""}`}>{value}</span>
    </div>
  );
}

function Verdict({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className={`text-xs rounded-lg px-3 py-2 mt-2 ${ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{children}</div>
  );
}

export default async function CapitalPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = await searchParams;
  const fromDate = isDateParam(from) ? cairoDayStart(from!) : cairoStartOfMonth();
  const toDate = isDateParam(to) ? cairoDayEnd(to!) : new Date();

  const data = await getCapitalPageData(fromDate, toDate);
  const { period, allTime } = data;

  const periodOver = period.netProfit === null ? 0 : period.draws - Math.max(period.netProfit, 0);
  const retained = allTime.netProfit === null ? null : allTime.netProfit - allTime.draws;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">رأس المال والمسحوبات</h1>
        <p className="text-xs text-muted mt-1 max-w-3xl">
          هنا بتسجّل فلوسك إنت كصاحب شغل: اللي بتحطه في الشركة (رأس مال)، واللي بتسحبه لنفسك (مسحوبات). المسحوبات مش مصروف، فمش بتقلل صافي الربح، لأنها جزء من ربح اتعمل وإنت بتاخده. ورأس المال مش إيراد، فمش بيظهر كأنه ربح. الاتنين بيأثروا على رصيد الخزينة اللي تختارها فورًا.
        </p>
      </div>

      <CapitalForm drawers={data.drawers} />

      <form className="flex gap-2 items-end flex-wrap app-card p-4">
        <div>
          <label className="text-xs text-muted block mb-0.5">من</label>
          <input type="date" name="from" defaultValue={cairoYmd(fromDate)} className="border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-0.5">إلى</label>
          <input type="date" name="to" defaultValue={cairoYmd(toDate)} className="border rounded px-3 py-2 text-sm" />
        </div>
        <button className="bg-gold text-white rounded-lg px-4 py-2 text-sm">تحديث</button>
      </form>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="app-card p-4">
          <h2 className="font-bold mb-2">الفترة المختارة</h2>
          <Row label="رأس مال دخل" value={money(period.capitalIn)} />
          <Row label="مسحوبات شخصية" value={money(period.draws)} />
          {period.netProfit !== null ? (
            <>
              <Row label="صافي ربح الفترة" value={money(period.netProfit)} tone={period.netProfit >= 0 ? "green" : "red"} />
              {period.draws === 0 ? (
                <Verdict ok>مفيش مسحوبات في الفترة دي.</Verdict>
              ) : periodOver > 0 ? (
                <Verdict ok={false}>
                  سحبت أكتر من صافي ربح الفترة بـ {money(periodOver)}. المبلغ ده مش ربح، ده طالع من فلوس الشغل نفسها (رأس المال، أو فلوس لسه عليك لموردين).
                </Verdict>
              ) : (
                <Verdict ok>المسحوبات في حدود الربح. فضل في الشغل من ربح الفترة {money((period.netProfit ?? 0) - period.draws)}.</Verdict>
              )}
            </>
          ) : (
            <p className="text-xs text-muted mt-2">مقارنة المسحوبات بالربح محتاجة صلاحية "عرض التقارير".</p>
          )}
        </div>

        <div className="app-card p-4">
          <h2 className="font-bold mb-2">من البداية لحد النهارده</h2>
          <Row label="إجمالي رأس المال اللي دخل" value={money(allTime.capitalIn)} />
          <Row label="إجمالي المسحوبات" value={money(allTime.draws)} />
          {allTime.netProfit !== null && retained !== null ? (
            <>
              <Row label="إجمالي صافي الربح" value={money(allTime.netProfit)} tone={allTime.netProfit >= 0 ? "green" : "red"} />
              <Row label="الربح اللي فضل في الشغل" value={money(retained)} tone={retained >= 0 ? "green" : "red"} />
              {retained < 0 ? (
                <Verdict ok={false}>
                  مسحوباتك من البداية أكبر من كل الربح اللي الشغل عمله بـ {money(-retained)}، يعني الجزء ده اتسحب من رأس المال نفسه.
                </Verdict>
              ) : (
                <Verdict ok>مسحوباتك من البداية لسه في حدود الربح اللي الشغل عمله.</Verdict>
              )}
            </>
          ) : (
            <p className="text-xs text-muted mt-2">مقارنة المسحوبات بالربح محتاجة صلاحية "عرض التقارير".</p>
          )}
        </div>
      </div>

      <div className="app-card p-4">
        <h2 className="font-bold mb-3">الحركات</h2>
        {data.movements.length === 0 ? (
          <p className="text-sm text-muted">مفيش حركات لسه. سجّل أول إيداع رأس مال أو سحب من الفورم اللي فوق.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="border-b text-muted">
                  <th className="py-2">التاريخ</th>
                  <th>النوع</th>
                  <th>المبلغ</th>
                  <th>الخزينة</th>
                  <th>ملاحظة</th>
                  <th>اللي سجّلها</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.movements.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-2 whitespace-nowrap">{dateAr(m.createdAt)}</td>
                    <td>
                      <span className={`badge ${m.kind === "CAPITAL_IN" ? "badge-green" : "badge-amber"}`}>
                        {m.kind === "CAPITAL_IN" ? "إيداع رأس مال" : "مسحوبات شخصية"}
                      </span>
                    </td>
                    <td className="tabular-nums">{money(m.amount)}</td>
                    <td>{m.paymentMethodName}</td>
                    <td className="text-muted">{m.note}</td>
                    <td className="text-xs">{m.createdByName || "-"}</td>
                    <td><CapitalRowActions id={m.id} kind={m.kind} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
