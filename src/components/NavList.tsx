"use client";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav";

export default function NavList({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <div className="space-y-0.5">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <a
            key={item.href}
            href={item.href}
            className={
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition " +
              (active
                ? "bg-primary/15 text-primary-light font-medium"
                : "text-neutral-300 hover:bg-white/5 hover:text-white")
            }
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </a>
        );
      })}
    </div>
  );
}
