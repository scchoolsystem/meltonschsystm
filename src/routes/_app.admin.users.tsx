import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_app/admin/users")({ component: AdminUsersPage });

function AdminUsersPage() {
  // Do not statically import server-only functions into client bundle.
  const createFn = useServerFn(() => import("@/lib/auth-admin.functions").then((m) => m.createAccount));
  const resetFn = useServerFn(() => import("@/lib/auth-admin.functions").then((m) => m.resetPassword));
  const setActiveFn = useServerFn(() => import("@/lib/auth-admin.functions").then((m) => m.setAccountActive));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Admin — Users</h1>
      <p className="text-sm text-muted-foreground">User management actions (create, reset, activate).</p>
      {/* Replace with real user management UI. */}
    </div>
  );
}
