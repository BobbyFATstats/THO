import useSWR from "swr";
import type { ActionItem } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Filters = {
  status?: string;
  assignee?: string;
  priority?: string;
  source?: string;
};

export function useActionItems(filters: Filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.assignee) params.set("assignee", filters.assignee);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.source) params.set("source", filters.source);

  const query = params.toString();
  const url = `/api/action-items${query ? `?${query}` : ""}`;

  return useSWR<{ action_items: ActionItem[] }>(url, fetcher);
}
