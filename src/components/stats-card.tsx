import { Card, CardContent } from "@/components/ui/card";

export function StatsCard({
  label,
  value,
  tooltip,
  className,
}: {
  label: string;
  value: number | string;
  tooltip?: string;
  className?: string;
}) {
  return (
    <Card className={`${className ?? ""} ${tooltip ? "relative group" : ""}`}>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {tooltip && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
            <div className="bg-popover text-popover-foreground text-xs rounded-md border px-3 py-2 shadow-md whitespace-pre-line">
              {tooltip}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
