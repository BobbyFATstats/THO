import { CONFIDENCE_THRESHOLDS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function ConfidenceIndicator({ score }: { score: number }) {
  if (score > CONFIDENCE_THRESHOLDS.high) return null;

  const isLow = score < CONFIDENCE_THRESHOLDS.medium;

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn(
          "w-2 h-2 rounded-full",
          isLow ? "bg-amber-500" : "bg-amber-400"
        )}
      />
      {isLow && (
        <span className="text-xs text-amber-600">AI flagged</span>
      )}
    </span>
  );
}
