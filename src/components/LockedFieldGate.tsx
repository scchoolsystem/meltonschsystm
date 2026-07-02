@@
-import { useServerFn } from "@tanstack/react-start";
-import { useQuery } from "@tanstack/react-query";
-import { checkEdit, editWithOverride } from "@/lib/permission.functions";
+import { useServerFn } from "@tanstack/react-start";
+import { useQuery } from "@tanstack/react-query";
@@
-  const check = useServerFn(checkEdit);
-  const save = useServerFn(editWithOverride);
+  const check = useServerFn(() => import("@/lib/permission.functions").then((m) => m.checkEdit));
+  const save = useServerFn(() => import("@/lib/permission.functions").then((m) => m.editWithOverride));
