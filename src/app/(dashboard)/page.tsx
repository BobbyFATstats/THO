"use client";

import { useActionItems } from "@/lib/hooks/use-action-items";
import { useMeetings } from "@/lib/hooks/use-meetings";
import { useTopics } from "@/lib/hooks/use-topics";
import { StatsCard } from "@/components/stats-card";
import { PriorityBadge } from "@/components/priority-badge";
import { StatusBadge } from "@/components/status-badge";
import { ConfidenceIndicator } from "@/components/confidence-indicator";
import { AddActionItemDialog } from "@/components/add-action-item-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS, CONFIDENCE_THRESHOLDS } from "@/lib/constants";
import type { Category } from "@/lib/constants";
import { format } from "date-fns";
import Link from "next/link";

export default function DashboardPage() {
  const { data: meetingsData } = useMeetings(1);
  const { data: itemsData, mutate: mutateItems } = useActionItems();
  const { data: topicsData } = useTopics();

  const latestMeeting = meetingsData?.meetings?.[0];
  const allItems = itemsData?.action_items || [];
  const openItems = allItems.filter(
    (i) => i.status === "open" || i.status === "in_progress"
  );
  const completedThisWeek = allItems.filter((i) => {
    if (i.status !== "completed" || !i.completed_at) return false;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return new Date(i.completed_at) > weekAgo;
  });
  const needsReview = allItems.filter(
    (i) =>
      i.confidence_score < CONFIDENCE_THRESHOLDS.medium &&
      i.status === "open"
  );
  const topItems = openItems.slice(0, 5);
  const topics = topicsData?.topics || [];

  // Group recent topics by category
  const recentTopics = topics.slice(0, 10);
  const topicsByCategory = recentTopics.reduce(
    (acc, topic) => {
      if (!acc[topic.category]) acc[topic.category] = [];
      acc[topic.category].push(topic);
      return acc;
    },
    {} as Record<string, typeof topics>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <AddActionItemDialog onCreated={() => mutateItems()} />
      </div>

      {/* Latest meeting summary */}
      {latestMeeting && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              Latest Meeting
              <span className="text-sm text-muted-foreground font-normal">
                {format(new Date(latestMeeting.date), "EEEE, MMMM d, yyyy")}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {latestMeeting.ai_summary || "No summary available"}
            </p>
            <Link
              href={`/meetings/${latestMeeting.id}`}
              className="text-sm text-primary hover:underline mt-2 inline-block"
            >
              View details
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatsCard label="Open Items" value={openItems.length} />
        <StatsCard label="Completed This Week" value={completedThisWeek.length} />
        <StatsCard label="Needs Review" value={needsReview.length} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Top action items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Top Action Items
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topItems.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No open action items
              </p>
            )}
            {topItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{item.title}</span>
                  <ConfidenceIndicator score={item.confidence_score} />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.assignee && (
                    <Badge variant="outline" className="text-xs">
                      {item.assignee}
                    </Badge>
                  )}
                  <PriorityBadge priority={item.priority} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent topics by category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Recent Topics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.keys(topicsByCategory).length === 0 && (
              <p className="text-sm text-muted-foreground">
                No discussion topics yet
              </p>
            )}
            {Object.entries(topicsByCategory).map(([cat, catTopics]) => (
              <div key={cat}>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-1">
                  {CATEGORY_LABELS[cat as Category]}
                </p>
                {catTopics.map((topic) => (
                  <p key={topic.id} className="text-sm ml-2 mb-1">
                    {topic.title}
                  </p>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
