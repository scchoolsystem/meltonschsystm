const fs = require("fs");
const base = JSON.parse(fs.readFileSync("wrangler.jsonc", "utf8"));
base.main = "./server.js";
base.assets = { directory: "../client", binding: "ASSETS" };
fs.writeFileSync("dist/server/wrangler.json", JSON.stringify(base, null, 2));
