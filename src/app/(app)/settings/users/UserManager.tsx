"use client";
import React, { useState, useTransition } from "react";
import { createUser, toggleUserActive, deleteUser, updateUserPassword, createCustomRole, updateUser, renameRole } from "@/actions/settings";
import { useRouter } from "next/navigation";
import PermissionEditor from "./PermissionEditor";

export default function UserManager({ users, roles }: { users: any[]; roles: any[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [form, setForm] = useState({ username: "", fullName: "", password: "", roleId: roles[0]?.id || "" });
  const [newRoleName, setNewRoleName] = useState("");
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [pwUser, setPwUser] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");
  const [infoUser, setInfoUser] = useState<string | null>(null);
  const [infoForm, setInfoForm] = useState({ username: "", fullName: "", roleId: "" });
  const [infoError, setInfoError] = useState("");
  const [showRoles, setShowRoles] = useState(false);

  return (
    <div className="space-y-6">
      <div className="app-card p-4 space-y-3">
        <h2 className="font-bold">إضافة موظف جديد</h2>
        <p className="text-xs text-muted">بعد ما تضيف الموظف، هتفتحلك تلقائيًا شاشة الصلاحيات التفصيلية عشان تحدد بالظبط كل خطوة/إجراء يقدر يعمله - مش مجرد وصف وظيفي عام.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const u = await createUser(form);
              setForm({ username: "", fullName: "", password: "", roleId: roles[0]?.id || "" });
              setEditingUser(u.id);
              router.refresh();
            });
          }}
          className="grid sm:grid-cols-5 gap-3 items-end"
        >
          <input required placeholder="اسم المستخدم (للدخول)" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="border rounded px-3 py-2 text-sm" />
          <input required placeholder="الاسم بالكامل" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="border rounded px-3 py-2 text-sm" />
          <input required type="password" placeholder="كلمة المرور" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="border rounded px-3 py-2 text-sm" />
          <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} className="border rounded px-3 py-2 text-sm">
            {roles.map((r) => <option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
          </select>
          <button disabled={pending} className="bg-primary text-white rounded-lg px-4 py-2 text-sm">+ إضافة موظف</button>
        </form>
      </div>

      <div className="app-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">المسميات الوظيفية (الأدوار)</h2>
          <button onClick={() => setShowRoles(!showRoles)} className="text-xs text-primary underline">
            {showRoles ? "إخفاء" : "عرض / تعديل المسميات"}
          </button>
        </div>
        {showRoles && (
          <div className="space-y-2">
            {roles.map((r) => (
              <RoleRow key={r.id} role={r} onSaved={() => router.refresh()} />
            ))}
            <form
              onSubmit={(e) => { e.preventDefault(); start(async () => { if (newRoleName) { await createCustomRole(newRoleName); setNewRoleName(""); router.refresh(); } }); }}
              className="flex gap-2 pt-2 border-t"
            >
              <input placeholder="اسم دور/مسمى وظيفي جديد" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} className="border rounded px-3 py-2 text-sm flex-1" />
              <button className="bg-navy text-white rounded-lg px-4 py-2 text-sm">+ إضافة مسمى جديد</button>
            </form>
          </div>
        )}
      </div>

      <div className="app-card overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b text-muted"><th className="p-3">اسم المستخدم</th><th>الاسم</th><th>الدور</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <React.Fragment key={u.id}>
                <tr className="border-b last:border-0">
                  <td className="p-3 font-mono text-xs">{u.username}</td>
                  <td>{u.fullName}</td>
                  <td><span className="badge badge-blue">{roleLabel(u.roleName)}</span></td>
                  <td>
                    <button onClick={() => start(async () => { await toggleUserActive(u.id, !u.active); router.refresh(); })} className={`text-xs rounded px-2 py-1 ${u.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {u.active ? "نشط" : "موقوف"}
                    </button>
                  </td>
                  <td className="flex gap-2 py-2 flex-wrap">
                    <button
                      onClick={() => {
                        if (infoUser === u.id) { setInfoUser(null); return; }
                        setInfoUser(u.id);
                        setInfoForm({ username: u.username, fullName: u.fullName, roleId: u.roleId });
                        setInfoError("");
                      }}
                      className="text-xs text-navy font-medium"
                    >
                      بيانات الدخول والدور
                    </button>
                    <button onClick={() => setEditingUser(editingUser === u.id ? null : u.id)} className="text-xs text-primary font-medium">
                      {editingUser === u.id ? "إخفاء الصلاحيات" : "الصلاحيات التفصيلية"}
                    </button>
                    <button onClick={() => setPwUser(pwUser === u.id ? null : u.id)} className="text-xs text-blue-600">كلمة المرور</button>
                    <button onClick={() => { if (confirm("مسح المستخدم؟")) start(async () => { await deleteUser(u.id); router.refresh(); }); }} className="text-xs text-red-600">حذف</button>
                  </td>
                </tr>
                {infoUser === u.id && (
                  <tr>
                    <td colSpan={5} className="p-3 bg-neutral-50">
                      <div className="flex flex-wrap gap-2 items-center">
                        <input placeholder="اسم المستخدم (الدخول)" value={infoForm.username} onChange={(e) => setInfoForm({ ...infoForm, username: e.target.value })} className="border rounded px-3 py-1.5 text-sm" />
                        <input placeholder="الاسم بالكامل" value={infoForm.fullName} onChange={(e) => setInfoForm({ ...infoForm, fullName: e.target.value })} className="border rounded px-3 py-1.5 text-sm" />
                        <select value={infoForm.roleId} onChange={(e) => setInfoForm({ ...infoForm, roleId: e.target.value })} className="border rounded px-3 py-1.5 text-sm">
                          {roles.map((r) => <option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
                        </select>
                        <button
                          onClick={() =>
                            start(async () => {
                              setInfoError("");
                              try {
                                await updateUser(u.id, { username: infoForm.username, fullName: infoForm.fullName, roleId: infoForm.roleId });
                                setInfoUser(null);
                                router.refresh();
                              } catch (e: any) {
                                setInfoError(e?.message || "حصل خطأ");
                              }
                            })
                          }
                          className="bg-primary text-white text-xs rounded px-3 py-1.5"
                        >
                          حفظ
                        </button>
                        {infoError && <span className="text-red-600 text-xs">{infoError}</span>}
                      </div>
                    </td>
                  </tr>
                )}
                {pwUser === u.id && (
                  <tr>
                    <td colSpan={5} className="p-3 bg-neutral-50">
                      <div className="flex gap-2 items-center">
                        <input type="password" placeholder="كلمة المرور الجديدة" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="border rounded px-3 py-1.5 text-sm" />
                        <button onClick={() => start(async () => { if (newPw) { await updateUserPassword(u.id, newPw); setNewPw(""); setPwUser(null); } })} className="bg-primary text-white text-xs rounded px-3 py-1.5">حفظ</button>
                      </div>
                    </td>
                  </tr>
                )}
                {editingUser === u.id && (
                  <tr>
                    <td colSpan={5} className="p-3 bg-neutral-50">
                      <PermissionEditor userId={u.id} roleId={u.roleId} roleName={u.roleName} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleRow({ role, onSaved }: { role: any; onSaved: () => void }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(role.name);
  const [error, setError] = useState("");
  return (
    <div className="flex items-center gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} className="border rounded px-3 py-1.5 text-sm flex-1 max-w-xs" />
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError("");
            try {
              await renameRole(role.id, name);
              onSaved();
            } catch (e: any) {
              setError(e?.message || "حصل خطأ");
            }
          })
        }
        className="bg-navy text-white text-xs rounded px-3 py-1.5"
      >
        حفظ
      </button>
      {error && <span className="text-red-600 text-xs">{error}</span>}
    </div>
  );
}

function roleLabel(name: string) {
  return { ADMIN: "مدير/أدمن", ACCOUNTANT: "محاسب", WAREHOUSE_KEEPER: "أمين مخزن", CASHIER: "كاشير/مبيعات" }[name] || name;
}
