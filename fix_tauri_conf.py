import json

with open("src-tauri/tauri.conf.json", "r") as f:
    config = json.load(f)

config["app"]["withGlobalTauri"] = True

with open("src-tauri/tauri.conf.json", "w") as f:
    json.dump(config, f, indent=2)

print("Done!")
