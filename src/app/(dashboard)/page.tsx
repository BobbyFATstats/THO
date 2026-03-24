"use client";

import { useState } from "react";
import useSWR from "swr";
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
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS, CONFIDENCE_THRESHOLDS } from "@/lib/constants";
import type { Category } from "@/lib/constants";
import { format } from "date-fns";
import { RefreshCw } from "lucide-react";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DashboardPage() {
  const { data: meetingsData, mutate: mutateMeetings } = useMeetings(1);
  const { data: itemsData, mutate: mutateItems } = useActionItems();
  const { data: topicsData } = useTopics();
  const { data: ghlData, mutate: mutateGhl } = useSWR<{
    contacts: { total: number; buyerCount: number; prevBuyerCount: number };
    acquisitionActivity: { recentCount: number; prevCount: number };
    refreshedAt: string;
    error?: string;
  }>("/api/ghl", fetcher, { revalidateOnFocus: false });
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function handleRefreshGhl() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/ghl", { method: "POST" });
      const fresh = await res.json();
      mutateGhl(fresh, false);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSyncMeetings() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/ingest", { method: "POST" });
      const result = await res.json();
      if (result.error) {
        setSyncResult(`Error: ${result.error}`);
      } else if (result.processed > 0) {
        setSyncResult(`Synced ${result.processed} new meeting(s)`);
        mutateMeetings();
      } else if (result.found === 0) {
        setSyncResult("No new meetings found");
      } else {
        setSyncResult(`${result.found} found, all already synced`);
      }
    } catch {
      setSyncResult("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

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
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            {ghlData?.refreshedAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Last refreshed: {format(new Date(ghlData.refreshedAt), "MMM d, yyyy h:mm a")}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshGhl}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh GHL"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncMeetings}
            disabled={syncing}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Meetings"}
          </Button>
          {syncResult && (
            <span className="text-xs text-muted-foreground">{syncResult}</span>
          )}
        </div>
        <AddActionItemDialog onCreated={() => mutateItems()} />
      </div>

      {/* GHL Weekly Stats */}
      {ghlData && !ghlData.error && (
        <div className="grid grid-cols-2 gap-4">
          <StatsCard
            label="Buyer Contacts Added (7d)"
            value={ghlData.contacts.buyerCount ?? 0}
            prevValue={ghlData.contacts.prevBuyerCount}
          />
          <StatsCard
            label="New Acquisition Opps (7d)"
            value={ghlData.acquisitionActivity?.recentCount ?? 0}
            prevValue={ghlData.acquisitionActivity?.prevCount}
          />
        </div>
      )}

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
                  {item.meetings?.date ? (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(item.meetings.date + "T00:00:00"), "MMM d")}
                    </span>
                  ) : null}
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
