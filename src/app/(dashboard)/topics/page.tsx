"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useTopics } from "@/lib/hooks/use-topics";
import { ConfidenceIndicator } from "@/components/confidence-indicator";
import { PriorityBadge } from "@/components/priority-badge";
import { StatusBadge } from "@/components/status-badge";
import { SortableItem } from "@/components/sortable-item";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  PRIORITIES,
  STATUSES,
  TEAM_MEMBERS,
} from "@/lib/constants";
import type { Category, Priority, Status } from "@/lib/constants";
import type { DiscussionTopic } from "@/lib/types";
import { format } from "date-fns";
import { toast } from "sonner";

export default function TopicsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const category = activeTab === "all" ? undefined : activeTab;
  const { data, mutate } = useTopics(category);
  const topics = data?.topics || [];

  const filtered = search
    ? topics.filter(
        (t) =>
          t.title.toLowerCase().includes(search.toLowerCase()) ||
          t.summary?.toLowerCase().includes(search.toLowerCase())
      )
    : topics;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  async function updateTopic(id: string, updates: Partial<DiscussionTopic>) {
    const res = await fetch(`/api/topics/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      mutate();
      toast.success("Updated");
    } else {
      toast.error("Update failed");
    }
  }

  function startEdit(topic: DiscussionTopic) {
    setEditingId(topic.id);
    setEditTitle(topic.title);
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return;
    await updateTopic(id, { title: editTitle.trim() });
    setEditingId(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filtered.findIndex((t) => t.id === active.id);
    const newIndex = filtered.findIndex((t) => t.id === over.id);
    const reordered = arrayMove(filtered, oldIndex, newIndex);

    mutate({ topics: reordered }, false);

    await fetch("/api/topics/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: reordered.map((t, idx) => ({ id: t.id, sort_order: idx })),
      }),
    });

    mutate();
  }

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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={filtered.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No topics found
              </p>
            )}
            {filtered.map((topic) => (
              <SortableItem key={topic.id} id={topic.id}>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {/* Title (editable) */}
                      <div className="flex-1 min-w-0">
                        {editingId === topic.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit(topic.id);
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              className="h-7 text-sm"
                              autoFocus
                            />
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => saveEdit(topic.id)}>Save</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-sm font-medium cursor-pointer hover:underline ${
                                  topic.status === "cancelled" ? "line-through text-muted-foreground/50" : ""
                                } ${topic.status === "completed" ? "line-through text-muted-foreground" : ""}`}
                                onClick={() => startEdit(topic)}
                              >
                                {topic.title}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {CATEGORY_LABELS[topic.category as Category]}
                              </Badge>
                              <ConfidenceIndicator score={topic.confidence_score} />
                            </div>
                            {topic.summary && (
                              <p className="text-xs text-muted-foreground mt-1">{topic.summary}</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Assignee */}
                      <DropdownMenu>
                        <DropdownMenuTrigger className="text-xs px-2 py-1 rounded hover:bg-accent">
                          {topic.assignee || "Unassigned"}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {TEAM_MEMBERS.map((member) => (
                            <DropdownMenuItem key={member} onClick={() => updateTopic(topic.id, { assignee: member })}>
                              {member}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Priority */}
                      <DropdownMenu>
                        <DropdownMenuTrigger className="cursor-pointer">
                          <PriorityBadge priority={topic.priority} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {PRIORITIES.map((p) => (
                            <DropdownMenuItem key={p} onClick={() => updateTopic(topic.id, { priority: p as Priority })}>
                              {p}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Status */}
                      <DropdownMenu>
                        <DropdownMenuTrigger className="cursor-pointer">
                          <StatusBadge status={topic.status} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {STATUSES.map((s) => (
                            <DropdownMenuItem key={s} onClick={() => updateTopic(topic.id, { status: s as Status })}>
                              {s.replace("_", " ")}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Cancel */}
                      {topic.status !== "cancelled" && topic.status !== "completed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => updateTopic(topic.id, { status: "cancelled" as Status })}
                        >
                          Cancel
                        </Button>
                      )}

                      {/* Date */}
                      <span className="text-xs text-muted-foreground shrink-0">
                        {topic.meetings?.date
                          ? format(new Date(topic.meetings.date), "MMM d")
                          : ""}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </SortableItem>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
