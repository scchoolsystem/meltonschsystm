@@
-import { setStudentLifecycle, setStaffLifecycle } from "@/lib/lifecycle.functions";
+import { setStudentLifecycle, setStaffLifecycle } from "@/lib/lifecycle.functions";
@@
-  const setStudent = useServerFn(setStudentLifecycle);
-  const setStaff = useServerFn(setStaffLifecycle);
+  const setStudent = useServerFn(() => import("@/lib/lifecycle.functions").then((m) => m.setStudentLifecycle));
+  const setStaff = useServerFn(() => import("@/lib/lifecycle.functions").then((m) => m.setStaffLifecycle));
