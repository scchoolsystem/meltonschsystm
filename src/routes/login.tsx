@@
-import { useServerFn } from "@tanstack/react-start";
-import { lookupLoginEmail } from "@/lib/auth-admin.functions";
+import { useServerFn } from "@tanstack/react-start";
@@
-  const lookup = useServerFn(lookupLoginEmail);
+  const lookup = useServerFn(() => import("@/lib/auth-admin.functions").then((m) => m.lookupLoginEmail));
