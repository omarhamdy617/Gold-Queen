"use client";
import { useEffect, useState, useTransition } from "react";
import { getRolePermissions, getUserPermissionOverrides, setRolePermission, setUserPermissionOverride } from "@/actions/settings";
import { PERMISSION_GROUPS } from "@/lib/permissions";

export default function PermissionEditor({ userId, roleId, roleName }: { userId: string; roleId: string; roleName: string }) {
  const [pending, start] = useTransition();
  const [rolePerms, setRolePerms] = useState<Record<string, boolean>>({});
  const [userOverrides, setUserOverrides] = useState<Record<string, boolean>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    (async () => {
      const [rp, up] = await Promise.all([getRolePermissions(roleId), getUserPermissionOverrides(userId)]);
      setRolePerms(Object.fromEntries(rp.map((p: any) => [p.key, p.allow])));
      setUserOverrides(Object.fromEntries(up.map((p: any) => [p.key, p.allow])));
    })();
  }, [roleId, userId]);

  if (roleName === "ADMIN") return <p className="text-sm text-muted">حساب الأدمن له كل الصلاحيات دايمًا تلقائيًا.</p>;

  function toggleEmployeePermission(key: string, checked: boolean) {
    // تحديد صلاحية هذا الموظف بالذات - override فردي، من غير ما يأثر على باقي زمايله في نفس الدور
    start(async () => {
      await setUserPermissionOverride(userId, key, checked);
      setUserOverrides((prev) => ({ ...prev, [key]: checked }));
    });
  }

  function resetToRoleDefault(key: string) {
    start(async () => {
      await setUserPermissionOverride(userId, key, null);
      setUserOverrides((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted">
          حدد بالضبط كل خطوة/شاشة يقدر الموظف ده يوصلها أو يعملها. أي صلاحية متعلمة معناها إنه يقدر يعملها، وأي صلاحية فاضية معناها ممنوعة عليه.
        </p>
        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-xs text-primary underline">
          {showAdvanced ? "إخفاء إعدادات الدور المتقدمة" : "تعديل الصلاحية الافتراضية لكل الدور (متقدم)"}
        </button>
      </div>

      {PERMISSION_GROUPS.map((g) => (
        <div key={g.group} className="app-card p-3">
          <h3 className="font-bold text-sm mb-2">{g.group}</h3>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {g.perms.map((p) => {
              const roleAllow = !!rolePerms[p.key];
              const override = userOverrides[p.key];
              const effective = override !== undefined ? override : roleAllow;
              const isCustomized = override !== undefined;
              return (
                <div key={p.key} className="flex items-center justify-between text-xs bg-neutral-50 rounded px-2 py-1.5 border">
                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={effective}
                      disabled={pending}
                      onChange={(e) => toggleEmployeePermission(p.key, e.target.checked)}
                    />
                    <span>{p.label}</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    {isCustomized && (
                      <button type="button" title="رجّع لإعداد الدور الافتراضي" onClick={() => resetToRoleDefault(p.key)} className="text-[10px] text-muted underline">
                        مخصص ↺
                      </button>
                    )}
                    {showAdvanced && (
                      <label className="flex items-center gap-1 text-[10px] text-muted border-r pr-1.5">
                        <input
                          type="checkbox"
                          checked={roleAllow}
                          disabled={pending}
                          onChange={(e) => start(async () => {
                            await setRolePermission(roleId, p.key, e.target.checked);
                            setRolePerms((prev) => ({ ...prev, [p.key]: e.target.checked }));
                          })}
                        />
                        كل الدور
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
