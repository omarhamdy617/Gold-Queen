"use client";

function toWhatsAppNumber(phone: string) {
  let digits = phone.replace(/\D/g, "");
  // أرقام مصر المحلية بتبدأ بصفر (01xxxxxxxxx) - واتساب محتاج الرقم الدولي من غير الصفر مع كود الدولة 20
  if (digits.startsWith("0")) digits = "20" + digits.slice(1);
  else if (!digits.startsWith("20")) digits = "20" + digits;
  return digits;
}

export default function WhatsAppShareButton({ phone, message }: { phone: string; message: string }) {
  const cleanPhone = toWhatsAppNumber(phone);
  const href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="bg-green-600 text-white rounded-lg px-4 py-2 text-sm">
      إرسال واتساب
    </a>
  );
}
