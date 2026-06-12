import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start";
import { getRouter } from "./router";
import { installNativeApiBasePatch } from "./lib/native-api-base";

installNativeApiBasePatch();

const router = getRouter();

hydrateRoot(document, <StartClient router={router} />);
