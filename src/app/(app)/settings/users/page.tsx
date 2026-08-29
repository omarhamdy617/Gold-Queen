import { listUsers, listRoles } from "@/actions/settings";
import UserManager from "./UserManager";

export default async function UsersSettingsPage() {
  const [users, roles] = await Promise.all([listUsers(), listRoles()]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">المستخدمون والصلاحيات</h1>
      <UserManager users={users} roles={roles} />
    </div>
  );
}
