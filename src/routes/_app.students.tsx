import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_app/students")({ component: StudentsPage });

function StudentsPage() {
  // Use dynamic import so server-only function isn't bundled into client artifacts
  const admit = useServerFn(() =>
    import("@/lib/admissions.functions").then((m) => m.admitStudent),
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Students</h1>
      <p className="text-sm text-muted-foreground">Student administration tools.</p>
      {/* Replace with the real UI as needed. */}
    </div>
  );
}
