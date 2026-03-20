import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CrmTrackerPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">CRM Tracker</h1>
        <Badge variant="secondary">Phase 2</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            GoHighLevel integration will display pipeline deals, contact counts,
            conversation metrics, and task completion data here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
