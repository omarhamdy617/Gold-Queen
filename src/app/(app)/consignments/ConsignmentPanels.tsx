"use client";
import { useState } from "react";
import ConsignmentDetail from "./ConsignmentDetail";
import ConsignmentActivity from "./ConsignmentActivity";

// قبل كده "تفاصيل البضاعة" و"النشاط والمبيعات" كانوا زرارين منفصلين ممكن الاتنين يتفتحوا مع بعض
// ويتكدسوا فوق بعض في نفس الكارت (كارت طويل جدًا ومزدحم). دلوقتي بقوا تابين (زي تابات المتصفح) -
// واحد بس مفتوح في نفس اللحظة، وضغط على تاب تاني بيقفل اللي قبله تلقائي.
export default function ConsignmentPanels({
  consignmentId,
  holderId,
  locations,
  paymentMethods,
}: {
  consignmentId: string;
  holderId: string;
  locations: any[];
  paymentMethods: any[];
}) {
  const [tab, setTab] = useState<"none" | "items" | "activity">("none");

  return (
    <div className="border-t pt-2.5">
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setTab(tab === "items" ? "none" : "items")}
          className={`text-xs rounded-md px-3 py-1.5 font-semibold transition-colors ${
            tab === "items" ? "bg-navy text-white" : "bg-neutral-100 text-navy hover:bg-neutral-200"
          }`}
        >
          📦 البضاعة (بيع / رجوع)
        </button>
        <button
          type="button"
          onClick={() => setTab(tab === "activity" ? "none" : "activity")}
          className={`text-xs rounded-md px-3 py-1.5 font-semibold transition-colors ${
            tab === "activity" ? "bg-navy text-white" : "bg-neutral-100 text-navy hover:bg-neutral-200"
          }`}
        >
          📊 النشاط والمبيعات
        </button>
      </div>
      {tab !== "none" && (
        <div className="mt-2.5">
          <ConsignmentDetail consignmentId={consignmentId} locations={locations} paymentMethods={paymentMethods} open={tab === "items"} />
          <ConsignmentActivity holderId={holderId} open={tab === "activity"} />
        </div>
      )}
    </div>
  );
}
