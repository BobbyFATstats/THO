"use client";

import { useState } from "react";
import { useTopics } from "@/lib/hooks/use-topics";
import { ConfidenceIndicator } from "@/components/confidence-indicator";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/constants";
import type { Category } from "@/lib/constants";
import { format } from "date-fns";

export default function TopicsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  const category = activeTab === "all" ? undefined : activeTab;
  const { data } = useTopics(category);
  const topics = data?.topics || [];

  const filtered = search
    ? topics.filter(
        (t) =>
          t.title.toLowerCase().includes(search.toLowerCase()) ||
          t.summary?.toLowerCase().includes(search.toLowerCase())
      )
    : topics;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Discussion Topics</h1>

      <div className="flex items-center gap-4">
        <Input
          placeholder="Search topics..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          {CATEGORIES.map((cat) => (
            <TabsTrigger key={cat} value={cat}>
              {CATEGORY_LABELS[cat]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No topics found
          </p>
        )}
        {filtered.map((topic) => (
          <Card key={topic.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{topic.title}</span>
                    <Badge variant="secondary" className="text-xs">
                      {CATEGORY_LABELS[topic.category as Category]}
                    </Badge>
                    <ConfidenceIndicator score={topic.confidence_score} />
                  </div>
                  {topic.summary && (
                    <p className="text-sm text-muted-foreground">
                      {topic.summary}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0 ml-4">
                  {topic.meetings?.date
                    ? format(new Date(topic.meetings.date), "MMM d, yyyy")
                    : ""}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
