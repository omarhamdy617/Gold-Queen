import { NextRequest, NextResponse } from "next/server";
import { buildFullBackup } from "@/lib/backup";
import { createClient } from "@supabase/supabase-js";

// بيتنادى تلقائيًا عن طريق Vercel Cron (شوف vercel.json) - نسخة احتياطية دورية يومية/أسبوعية
// وبيتخزن في Supabase Storage لو متظبط SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const backup = await buildFullBackup();
  const json = JSON.stringify(backup);
  const filename = `goldqueen-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.storage.from("backups").upload(filename, json, { contentType: "application/json" });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // تنظيف تلقائي: كل تشغيل كان بيعمل ملف جديد للأبد من غير ما يمسح القديم - يعني تخزين Supabase
    // بيتملى تدريجيًا لحد ما يوصل للحد المسموح بيه ويبدأ يرفض أي رفع جديد (حتى النسخ الاحتياطية
    // الجديدة). دلوقتي بنسيب آخر 45 نسخة بس (تقريبًا 45 يوم لو التشغيل يومي) ونمسح الباقي.
    const KEEP_LATEST = 45;
    try {
      const { data: files } = await supabase.storage.from("backups").list("", { limit: 1000, sortBy: { column: "name", order: "desc" } });
      if (files && files.length > KEEP_LATEST) {
        const toDelete = files.slice(KEEP_LATEST).map((f) => f.name);
        if (toDelete.length) await supabase.storage.from("backups").remove(toDelete);
      }
    } catch {
      // فشل التنظيف مايوقفش نجاح النسخة الاحتياطية نفسها - هيتحاول تاني بكرة
    }

    return NextResponse.json({ ok: true, storedAs: filename });
  }

  // لو مفيش تخزين سحابي متظبط، على الأقل نرجع النسخة عشان نتأكد إن العملية شغالة
  return NextResponse.json({ ok: true, note: "SUPABASE_STORAGE غير مفعل - النسخة اتولدت بس مترفعتش لمكان دائم", size: json.length });
}
