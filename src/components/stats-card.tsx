import { Card, CardContent } from "@/components/ui/card";

export function StatsCard({
  label,
  value,
  prevValue,
  className,
}: {
  label: string;
  value: number | string;
  prevValue?: number;
  className?: string;
}) {
  const diff = prevValue != null ? Number(value) - prevValue : null;

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {diff != null && (
          <p
            className={`text-xs mt-1 ${
              diff > 0
                ? "text-green-600"
                : diff < 0
                  ? "text-red-500"
                  : "text-muted-foreground"
            }`}
          >
            {diff > 0 ? `↑ ${diff}` : diff < 0 ? `↓ ${Math.abs(diff)}` : "—"}{" "}
            vs last week
          </p>
        )}
      </CardContent>
    </Card>
  );
}
