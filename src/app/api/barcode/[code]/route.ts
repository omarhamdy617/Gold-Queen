import { NextRequest, NextResponse } from "next/server";
import { createCanvas } from "canvas";
import JsBarcode from "jsbarcode";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const canvas = createCanvas(300, 120);
  try {
    JsBarcode(canvas, code, {
      format: "CODE128",
      width: 2,
      height: 60,
      displayValue: true,
      fontSize: 14,
      margin: 5,
    });
  } catch {
    return NextResponse.json({ error: "باركود غير صالح" }, { status: 400 });
  }
  const buffer = canvas.toBuffer("image/png");
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
