import { Badge } from "@/components/ui/badge";
import type { Priority } from "@/lib/constants";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES: Record<Priority, string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-green-100 text-green-800 border-green-200",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge variant="outline" className={cn("text-xs", PRIORITY_STYLES[priority])}>
      {priority}
    </Badge>
  );
}
