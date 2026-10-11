// فحوصات سريعة (من غير قاعدة بيانات ولا سيرفر) لنوع الغلط اللي اتكرر أكتر من مرة في السيستم ده:
// قايمة جديدة اتضاف لها حاجة في مكان، واتنسيت في نسخة تانية من نفس القايمة في مكان تاني.
// كل فحص هنا اتكتب بعد ما الغلطة دي حصلت فعلًا (رقم الدفعة مكتوب جنب كل فحص).
// التشغيل: npx tsx --test src/tests/consistency.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

function allFiles(dir: string, out: string[] = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) allFiles(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const schema = read("db/schema.ts");
const cashTypes = (() => {
  const m = schema.match(/cashTxTypeEnum = pgEnum\("cash_tx_type", \[([\s\S]*?)\]\)/);
  assert.ok(m, "cashTxTypeEnum مش لاقيه في schema.ts");
  return [...m[1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
})();

test("كل جدول في schema.ts موجود في النسخة الاحتياطية (الدفعة 4 والدفعة 26)", () => {
  const tables = [...schema.matchAll(/^export const (\w+) = pgTable\(/gm)].map((m) => m[1]);
  const backup = read("lib/backup.ts");
  const missing = tables.filter((t) => !new RegExp(`schema\\.${t}\\b`).test(backup));
  assert.deepEqual(missing, [], `جداول ناقصة من src/lib/backup.ts: ${missing.join(", ")}`);
});

test("كل رابط في القائمة الجانبية متحط في قسم من أقسامها (الدفعة 24)", () => {
  const nav = read("lib/nav.ts");
  const hrefs = [...nav.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
  const layout = read("app/(app)/layout.tsx");
  const sections = layout.match(/const SECTIONS[\s\S]*?\];/);
  assert.ok(sections, "SECTIONS مش لاقيها في layout.tsx");
  const missing = hrefs.filter((h) => !sections[0].includes(`"${h}"`));
  assert.deepEqual(missing, [], `روابط مش هتظهر في القائمة: ${missing.join(", ")}`);
});

test("كل نوع حركة خزينة ليه اسم عربي (الدفعة 23)", () => {
  const labels = read("lib/cashTypes.ts");
  const missing = cashTypes.filter((t) => !new RegExp(`\\b${t}:`).test(labels));
  assert.deepEqual(missing, [], `أنواع حركات من غير اسم: ${missing.join(", ")}`);
});

test("كل نوع حركة خزينة خارجة (_OUT) اتجاهه الافتراضي خصم (الدفعة 26)", () => {
  const ops = read("lib/ops.ts");
  const outList = ops.match(/:\s*\[([^\]]*)\]\.includes\(type\)/);
  assert.ok(outList, "قايمة الاتجاه الافتراضي مش لاقيها في ops.ts");
  const missing = cashTypes.filter((t) => t.endsWith("_OUT") && !outList[1].includes(`"${t}"`));
  assert.deepEqual(missing, [], `أنواع خارجة هتتسجل كإضافة بالغلط: ${missing.join(", ")}`);
});

test("كل نوع حركة خزينة متصنّف في التدفق النقدي بلوحة التحليلات (الدفعة 23)", () => {
  const analytics = read("actions/analytics.ts");
  const inSet = analytics.match(/const IN_TYPES = new Set\(\[([^\]]*)\]\)/);
  const outSet = analytics.match(/const OUT_TYPES = new Set\(\[([^\]]*)\]\)/);
  assert.ok(inSet && outSet, "IN_TYPES/OUT_TYPES مش لاقيهم في analytics.ts");
  // التحويلات بين الخزائن مستبعدة عمدًا، والتسويات ورأس المال والمسحوبات بيتعرضوا لوحدهم
  const handledSeparately = new Set(["ADJUSTMENT", "TRANSFER_IN", "TRANSFER_OUT", "CAPITAL_IN", "OWNER_DRAW_OUT"]);
  const missing = cashTypes.filter((t) => !handledSeparately.has(t) && !inSet[1].includes(`"${t}"`) && !outSet[1].includes(`"${t}"`));
  assert.deepEqual(missing, [], `أنواع مش محسوبة في التدفق النقدي: ${missing.join(", ")}`);
});

test("مفيش أكواد مصادر أوردر ثابتة قديمة في الشاشات (الدفعة 28)", () => {
  const offenders = allFiles(join(SRC, "app"))
    .filter((f) => /value="(WEBSITE|PHONE|WHATSAPP|FACEBOOK)"|\|\|\s*"WEBSITE"/.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(SRC.length + 1));
  assert.deepEqual(offenders, [], `ملفات لسه فيها أكواد المصادر القديمة: ${offenders.join(", ")}`);
});

test("صافي الربح بنفس المعادلة في كل الأماكن اللي بتحسبه (الدفعة 27)", () => {
  // كل مكان بيحسب صافي الربح لازم يضيف الإيرادات الأخرى - لو مكان جديد اتضاف ونسيها، الرقم هيختلف بين الشاشات
  const places: [string, RegExp][] = [
    ["actions/reports.ts", /netProfit: grossProfit - expensesTotal \+ otherIncomeTotal/],
    ["actions/reports.ts", /netProfit: grossProfits\[i\] - expensesTotals\[i\] \+ otherIncomeTotals\[i\]/],
    ["actions/dashboard.ts", /const netProfit = grossProfit - Number\(expensesMonth\[0\]\?\.total \|\| 0\) \+ Number\(otherIncomeMonth/],
    ["actions/analytics.ts", /grossProfit\.current - expensesTotal\.current \+ otherIncome\.current/],
  ];
  for (const [file, re] of places) assert.match(read(file), re, `${file} مش بيحسب صافي الربح بالمعادلة الموحدة`);
  // ومفيش مكان تاني بيحسبه بطريقة تانية
  const others = allFiles(SRC)
    .filter((f) => !f.includes(`${join("src", "tests")}`))
    .filter((f) => /netProfit\s*[:=]\s*[^,;\n]*-\s*[^,;\n]*expenses/i.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(SRC.length + 1))
    .filter((f) => !["actions/reports.ts", "actions/dashboard.ts", "actions/analytics.ts"].includes(f));
  assert.deepEqual(others, [], `أماكن تانية بتحسب صافي الربح: ${others.join(", ")}`);
});
