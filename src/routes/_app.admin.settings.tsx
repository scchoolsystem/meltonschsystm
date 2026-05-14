import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <div className="p-6"><Card><CardContent className="py-12 text-center text-muted-foreground">Admins only.</CardContent></Card></div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">School Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage school-wide configuration</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">School Identity</CardTitle>
          <CardDescription>Greenfield Academy · Primary + Secondary</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Future modules to enable in upcoming phases:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Academics — Subjects, Exams, Marks entry, Report cards (PDF)</li>
            <li>Finance — Fees, Payments, Receipts, MPESA</li>
            <li>Operations — Attendance, Discipline, Library, Boarding, Clinic, Transport, Inventory</li>
            <li>Portals — Parent and Student self-service</li>
            <li>Communication — Email, SMS, in-app messaging</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
