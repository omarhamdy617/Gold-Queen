"use client";
import { useEffect, useState, useTransition } from "react";
import { getRolePermissions, getUserPermissionOverrides, setRolePermission, setUserPermissionOverride } from "@/actions/settings";
import { PERMISSION_GROUPS } from "@/lib/permissions";

export default function PermissionEditor({ userId, roleId, roleName }: { userId: string; roleId: string; roleName: string }) {
  const [pending, start] = useTransition();
  const [rolePerms, setRolePerms] = useState<Record<string, boolean>>({});
  const [userOverrides, setUserOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const [rp, up] = await Promise.all([getRolePermissions(roleId), getUserPermissionOverrides(userId)]);
      setRolePerms(Object.fromEntries(rp.map((p: any) => [p.key, p.allow])));
      setUserOverrides(Object.fromEntries(up.map((p: any) => [p.key, p.allow])));
    })();
  }, [roleId, userId]);

  if (roleName === "ADMIN") return <p className="text-sm text-neutral-500">حساب الأدمن له كل الصلاحيات دائمًا.</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">✔️ = مسموح بدور "{roleName}". ✏️ الصفوف تحتها ممكن تخصص المستخدم ده تحديدًا (تجاوز فردي).</p>
      {PERMISSION_GROUPS.map((g) => (
        <div key={g.group}>
          <h3 className="font-bold text-sm mb-1">{g.group}</h3>
          <div className="grid sm:grid-cols-2 gap-1">
            {g.perms.map((p) => {
              const roleAllow = !!rolePerms[p.key];
              const override = userOverrides[p.key];
              const effective = override !== undefined ? override : roleAllow;
              return (
                <div key={p.key} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1.5 border">
                  <span>{p.label}</span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={roleAllow}
                        onChange={(e) => start(async () => {
                          await setRolePermission(roleId, p.key, e.target.checked);
                          setRolePerms({ ...rolePerms, [p.key]: e.target.checked });
                        })}
                      />
                      دور
                    </label>
                    <select
                      value={override === undefined ? "inherit" : override ? "allow" : "deny"}
                      onChange={(e) => start(async () => {
                        const v = e.target.value;
                        const allow = v === "inherit" ? null : v === "allow";
                        await setUserPermissionOverride(userId, p.key, allow);
                        const next = { ...userOverrides };
                        if (allow === null) delete next[p.key]; else next[p.key] = allow;
                        setUserOverrides(next);
                      })}
                      className="text-xs border rounded"
                    >
                      <option value="inherit">حسب الدور</option>
                      <option value="allow">مسموح دايمًا</option>
                      <option value="deny">ممنوع دايمًا</option>
                    </select>
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
