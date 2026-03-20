import { Badge } from "@/components/ui/badge";
import type { Status } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<Status, string> = {
  open: "bg-blue-100 text-blue-800 border-blue-200",
  in_progress: "bg-purple-100 text-purple-800 border-purple-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

const STATUS_LABELS: Record<Status, string> = {
  open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge variant="outline" className={cn("text-xs", STATUS_STYLES[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
