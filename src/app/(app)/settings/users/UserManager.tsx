"use client";
import React, { useState, useTransition } from "react";
import { createUser, toggleUserActive, deleteUser, updateUserPassword, createCustomRole } from "@/actions/settings";
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

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            await createUser(form);
            setForm({ username: "", fullName: "", password: "", roleId: roles[0]?.id || "" });
            router.refresh();
          });
        }}
        className="bg-white rounded-xl shadow p-4 grid sm:grid-cols-5 gap-3 items-end"
      >
        <input required placeholder="اسم المستخدم (للدخول)" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="border rounded px-3 py-2 text-sm" />
        <input required placeholder="الاسم بالكامل" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="border rounded px-3 py-2 text-sm" />
        <input required type="password" placeholder="كلمة المرور" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="border rounded px-3 py-2 text-sm" />
        <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} className="border rounded px-3 py-2 text-sm">
          {roles.map((r) => <option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
        </select>
        <button disabled={pending} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">+ إضافة موظف</button>
      </form>

      <form
        onSubmit={(e) => { e.preventDefault(); start(async () => { if (newRoleName) { await createCustomRole(newRoleName); setNewRoleName(""); router.refresh(); } }); }}
        className="flex gap-2"
      >
        <input placeholder="اسم دور جديد (مخصص)" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} className="border rounded px-3 py-2 text-sm" />
        <button className="bg-neutral-800 text-white rounded-lg px-4 py-2 text-sm">+ إضافة دور</button>
      </form>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b text-neutral-500"><th className="p-3">اسم المستخدم</th><th>الاسم</th><th>الدور</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <React.Fragment key={u.id}>
                <tr className="border-b last:border-0">
                  <td className="p-3 font-mono text-xs">{u.username}</td>
                  <td>{u.fullName}</td>
                  <td>{roleLabel(u.roleName)}</td>
                  <td>
                    <button onClick={() => start(async () => { await toggleUserActive(u.id, !u.active); router.refresh(); })} className={`text-xs rounded px-2 py-1 ${u.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {u.active ? "نشط" : "موقوف"}
                    </button>
                  </td>
                  <td className="flex gap-2 py-2">
                    <button onClick={() => setEditingUser(editingUser === u.id ? null : u.id)} className="text-xs text-gold">الصلاحيات</button>
                    <button onClick={() => setPwUser(pwUser === u.id ? null : u.id)} className="text-xs text-blue-600">كلمة المرور</button>
                    <button onClick={() => { if (confirm("مسح المستخدم؟")) start(async () => { await deleteUser(u.id); router.refresh(); }); }} className="text-xs text-red-600">حذف</button>
                  </td>
                </tr>
                {pwUser === u.id && (
                  <tr>
                    <td colSpan={5} className="p-3 bg-neutral-50">
                      <div className="flex gap-2 items-center">
                        <input type="password" placeholder="كلمة المرور الجديدة" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="border rounded px-3 py-1.5 text-sm" />
                        <button onClick={() => start(async () => { if (newPw) { await updateUserPassword(u.id, newPw); setNewPw(""); setPwUser(null); } })} className="bg-gold text-white text-xs rounded px-3 py-1.5">حفظ</button>
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

function roleLabel(name: string) {
  return { ADMIN: "مدير/أدمن", ACCOUNTANT: "محاسب", WAREHOUSE_KEEPER: "أمين مخزن", CASHIER: "كاشير/مبيعات" }[name] || name;
}
