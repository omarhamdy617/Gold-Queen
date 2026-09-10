"use client";
import { PeriodProvider } from "./PeriodContext";
import PeriodBar from "./PeriodBar";
import ExecutiveOverview from "./ExecutiveOverview";
import AnalyticsTabs from "./AnalyticsTabs";

export default function AnalyticsDashboard() {
  return (
    <PeriodProvider>
      <div className="space-y-5">
        <PeriodBar />
        <ExecutiveOverview />
        <AnalyticsTabs />
      </div>
    </PeriodProvider>
  );
}
