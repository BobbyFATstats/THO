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
import { useActionItems } from "@/lib/hooks/use-action-items";
import { PriorityBadge } from "@/components/priority-badge";
import { StatusBadge } from "@/components/status-badge";
import { ConfidenceIndicator } from "@/components/confidence-indicator";
import { AddActionItemDialog } from "@/components/add-action-item-dialog";
import { SortableItem } from "@/components/sortable-item";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TEAM_MEMBERS,
  STATUSES,
  PRIORITIES,
  SOURCES,
} from "@/lib/constants";
import type { ActionItem } from "@/lib/types";
import type { Status, Priority } from "@/lib/constants";
import { toast } from "sonner";
import { format } from "date-fns";

const ALL = "__all__";

export default function ActionItemsPage() {
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [assigneeFilter, setAssigneeFilter] = useState(ALL);
  const [priorityFilter, setPriorityFilter] = useState(ALL);
  const [sourceFilter, setSourceFilter] = useState(ALL);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const filters: Record<string, string> = {};
  if (statusFilter !== ALL) filters.status = statusFilter;
  if (assigneeFilter !== ALL) filters.assignee = assigneeFilter;
  if (priorityFilter !== ALL) filters.priority = priorityFilter;
  if (sourceFilter !== ALL) filters.source = sourceFilter;

  const { data, mutate } = useActionItems(filters);
  const items = data?.action_items || [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  async function updateItem(id: string, updates: Partial<ActionItem>) {
    const res = await fetch(`/api/action-items/${id}`, {
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

  function startEdit(item: ActionItem) {
    setEditingId(item.id);
    setEditTitle(item.title);
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return;
    await updateItem(id, { title: editTitle.trim() });
    setEditingId(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);

    // Optimistic update
    mutate({ action_items: reordered }, false);

    // Persist
    await fetch("/api/action-items/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: reordered.map((item, idx) => ({ id: item.id, sort_order: idx })),
      }),
    });

    mutate();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Action Items</h1>
        <AddActionItemDialog onCreated={() => mutate()} />
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assigneeFilter} onValueChange={(v) => v && setAssigneeFilter(v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Assignees</SelectItem>
            {TEAM_MEMBERS.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => v && setPriorityFilter(v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Priorities</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={(v) => v && setSourceFilter(v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Sources</SelectItem>
            {SOURCES.map((s) => (
              <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Items list with drag-and-drop */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No action items match your filters
              </p>
            )}
            {items.map((item) => (
              <SortableItem key={item.id} id={item.id}>
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
                  {/* Checkbox */}
                  <button
                    onClick={() =>
                      updateItem(item.id, {
                        status: item.status === "completed" ? "open" : "completed",
                      })
                    }
                    className="shrink-0"
                  >
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        item.status === "completed"
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/30 hover:border-primary"
                      }`}
                    >
                      {item.status === "completed" && (
                        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </div>
                  </button>

                  {/* Title (editable) */}
                  <div className="flex-1 min-w-0">
                    {editingId === item.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(item.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="h-7 text-sm"
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => saveEdit(item.id)}>Save</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium cursor-pointer hover:underline ${
                            item.status === "completed" ? "line-through text-muted-foreground" : ""
                          } ${item.status === "cancelled" ? "line-through text-muted-foreground/50" : ""}`}
                          onClick={() => startEdit(item)}
                        >
                          {item.title}
                        </span>
                        <ConfidenceIndicator score={item.confidence_score} />
                      </div>
                    )}
                    {item.description && editingId !== item.id && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
                    )}
                  </div>

                  {/* Assignee */}
                  <DropdownMenu>
                    <DropdownMenuTrigger className="text-xs px-2 py-1 rounded hover:bg-accent">
                      {item.assignee || "Unassigned"}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {TEAM_MEMBERS.map((member) => (
                        <DropdownMenuItem key={member} onClick={() => updateItem(item.id, { assignee: member })}>
                          {member}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Priority */}
                  <DropdownMenu>
                    <DropdownMenuTrigger className="cursor-pointer">
                      <PriorityBadge priority={item.priority} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {PRIORITIES.map((p) => (
                        <DropdownMenuItem key={p} onClick={() => updateItem(item.id, { priority: p as Priority })}>
                          {p}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Status */}
                  <DropdownMenu>
                    <DropdownMenuTrigger className="cursor-pointer">
                      <StatusBadge status={item.status} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {STATUSES.map((s) => (
                        <DropdownMenuItem key={s} onClick={() => updateItem(item.id, { status: s as Status })}>
                          {s.replace("_", " ")}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Cancel button */}
                  {item.status !== "cancelled" && item.status !== "completed" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => updateItem(item.id, { status: "cancelled" as Status })}
                    >
                      Cancel
                    </Button>
                  )}

                  {/* Source & Date */}
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {item.source === "ai_extracted" ? "AI" : "Manual"}
                  </Badge>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(item.created_at), "MMM d")}
                  </span>
                </div>
              </SortableItem>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
