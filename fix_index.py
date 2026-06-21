with open("src/routes/index.tsx", "r") as f:
    content = f.read()

content = content.replace(
    'if ((native || isAppSubdomain) && !slug) return <SchoolPicker onPicked={(s) => { if (s) navigate({ to: "/login" }); }} />;',
    'if ((native || isAppSubdomain) && !slug) return <SchoolPicker onPicked={(s) => { if (s) navigate({ to: "/login" }); }} />;\n  if (native && slug && !school) return <SchoolPicker onPicked={(s) => { if (s) navigate({ to: "/login" }); }} />;'
)

with open("src/routes/index.tsx", "w") as f:
    f.write(content)

print("Done!")
