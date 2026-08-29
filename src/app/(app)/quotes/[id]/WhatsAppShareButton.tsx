"use client";
export default function WhatsAppShareButton({ phone, message }: { phone: string; message: string }) {
  const cleanPhone = phone.replace(/\D/g, "");
  const href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="bg-green-600 text-white rounded-lg px-4 py-2 text-sm">
      إرسال واتساب
    </a>
  );
}
