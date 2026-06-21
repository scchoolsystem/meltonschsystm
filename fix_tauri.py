with open("src/hooks/use-tenant.tsx", "r") as f:
    content = f.read()

content = content.replace(
    'export function isNativeApp(): boolean {\n  return typeof window !== "undefined" &&\n    (window as any)?.Capacitor?.isNativePlatform?.() === true;\n}',
    'export function isNativeApp(): boolean {\n  return typeof window !== "undefined" && (\n    (window as any)?.Capacitor?.isNativePlatform?.() === true ||\n    (window as any).__TAURI__ !== undefined\n  );\n}'
)

with open("src/hooks/use-tenant.tsx", "w") as f:
    f.write(content)

print("Done!")
