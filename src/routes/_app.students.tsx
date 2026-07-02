@@
-import { admitStudent, createStaff } from "@/lib/admissions.functions";
+import { admitStudent, createStaff } from "@/lib/admissions.functions";
@@
-  const admit = useServerFn(admitStudent);
+  const admit = useServerFn(() => import("@/lib/admissions.functions").then((m) => m.admitStudent));
