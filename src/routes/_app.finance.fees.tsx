@@
-import { upsertClassFee, generateTermInvoices } from "@/lib/class-fees.functions";
+import { upsertClassFee, generateTermInvoices } from "@/lib/class-fees.functions";
@@
-  const genFn = useServerFn(generateTermInvoices);
+  const genFn = useServerFn(() => import("@/lib/class-fees.functions").then((m) => m.generateTermInvoices));
