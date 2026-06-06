import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { useFeatureGate, type FeatureKey } from "@/hooks/use-feature-gate";

export function FeatureGate({
  feature,
  children,
}: {
  feature: FeatureKey;
  children: React.ReactNode;
}) {
  const { isEnabled } = useFeatureGate();
  if (isEnabled(feature)) return <>{children}</>;
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted grid place-items-center">
            <Lock className="w-5 h-5 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">Module not enabled</h2>
          <p className="text-sm text-muted-foreground">
            The <span className="font-mono">{feature}</span> module is disabled for this school.
            Ask your school administrator to enable it from Admin → Settings.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
