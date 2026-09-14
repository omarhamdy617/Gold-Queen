"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// تحديث تلقائي خفيف للصفحة: بيعيد جلب بيانات السيرفر كل فترة معينة (بنفس آلية router.refresh()
// اللي بتحصل عادي بعد أي عملية حفظ في السيستم) من غير ما يعمل reload كامل للمتصفح - يعني لو
// موظف تاني سجّل فاتورة أو أوردر جديد وانت فاتح نفس الشاشة، هتظهرلك من غير ما تحتاج تعمل تحديث
// (F5) بنفسك.
//
// بيتوقف تلقائيًا لو التاب/الصفحة مش ظاهرة قدام المستخدم دلوقتي (تاب تانية مفتوحة، أو المتصفح
// مصغّر) - عشان ما نعملش حمل على السيرفر وقاعدة البيانات من غير داعي وهو أصلًا مش متابعها. ده
// مهم بالذات في محل فيه أكتر من جهاز/تاب مفتوحين طول الوقت.
export default function AutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
