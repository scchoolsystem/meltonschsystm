with open("src/core/rbac/permissions.ts", "r") as f:
    content = f.read()

content = content.replace(
    '  | "school_admin" | "academic_master"',
    '  | "school_admin" | "academic_master" | "hr_admin" | "hr"'
)
content = content.replace(
    'staff: [...ADMIN_ROLES, "hod"],',
    'staff: [...ADMIN_ROLES, "hod", "hr_admin", "hr"],'
)
content = content.replace(
    '"admin.leaving-certificates": [...ADMIN_ROLES],',
    '"admin.leaving-certificates": [...ADMIN_ROLES],\n  "admin.leaving-certificate": [...ADMIN_ROLES],'
)

with open("src/core/rbac/permissions.ts", "w") as f:
    f.write(content)

print("Done!")
