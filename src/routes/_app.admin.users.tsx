@@
-import {
-  createAccount,
-  resetPassword,
-  setAccountActive,
-} from "@/lib/auth-admin.functions";
+// Do not statically import server-only functions into client bundle.
@@
-  const createFn = useServerFn(createAccount);
-  const resetFn = useServerFn(resetPassword);
-  const setActiveFn = useServerFn(setAccountActive);
+  const createFn = useServerFn(() => import("@/lib/auth-admin.functions").then((m) => m.createAccount));
+  const resetFn = useServerFn(() => import("@/lib/auth-admin.functions").then((m) => m.resetPassword));
+  const setActiveFn = useServerFn(() => import("@/lib/auth-admin.functions").then((m) => m.setAccountActive));
