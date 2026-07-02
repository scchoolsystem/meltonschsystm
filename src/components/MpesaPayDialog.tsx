@@
-import { initiateMpesaPayment } from "@/lib/mpesa.functions";
+import { initiateMpesaPayment } from "@/lib/mpesa.functions";
@@
-  const initiate = useServerFn(initiateMpesaPayment);
+  const initiate = useServerFn(() => import("@/lib/mpesa.functions").then((m) => m.initiateMpesaPayment));
