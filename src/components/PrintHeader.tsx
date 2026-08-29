import { getSettings } from "@/actions/settings";

export default async function PrintHeader({ subtitle, code, date }: { subtitle: string; code: string; date: string }) {
  const settings = await getSettings();
  return (
    <div className="flex items-start justify-between border-b pb-4 mb-4">
      <div>
        <h1 className="text-2xl font-bold text-gold">{settings?.companyName || "جولد كوين"}</h1>
        <p className="text-xs text-neutral-500">{subtitle}</p>
        {settings?.companyAddress && <p className="text-xs text-neutral-500 mt-1">{settings.companyAddress}</p>}
        {(settings?.companyPhone || settings?.companyPhone2) && (
          <p className="text-xs text-neutral-500">
            {[settings.companyPhone, settings.companyPhone2].filter(Boolean).join(" / ")}
          </p>
        )}
      </div>
      <div className="text-left">
        <p className="font-mono text-sm">{code}</p>
        <p className="text-xs text-neutral-500">{date}</p>
      </div>
    </div>
  );
}
