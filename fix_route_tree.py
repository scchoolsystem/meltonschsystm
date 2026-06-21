import re

with open("src/routeTree.gen.ts", "r") as f:
    content = f.read()

pattern = r"const AppAdminStudentDocumentsRoute = AppAdminStudentDocumentsRouteImport\.update\(\{[^\}]+\}\)"
matches = list(re.finditer(pattern, content, re.DOTALL))
print(f"Found {len(matches)} occurrences")

if len(matches) > 1:
    second = matches[1]
    content = content[:second.start()].rstrip() + "\n" + content[second.end():]
    print("Removed duplicate!")

with open("src/routeTree.gen.ts", "w") as f:
    f.write(content)

print("Done!")
