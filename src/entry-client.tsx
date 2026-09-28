import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start";
import { getRouter } from "./router";
import { installGlobalErrorReporting } from "@/lib/report-error";

const router = getRouter();

// Catches uncaught errors/rejections anywhere in the app (not just inside a
// route's own try/catch) and reports them silently — see report-error.ts.
installGlobalErrorReporting();

hydrateRoot(document, <StartClient router={router} />);
