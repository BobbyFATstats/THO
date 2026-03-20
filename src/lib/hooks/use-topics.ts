import useSWR from "swr";
import type { DiscussionTopic } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type TopicWithMeeting = DiscussionTopic & {
  meetings: { date: string } | null;
};

export function useTopics(category?: string) {
  const url = category
    ? `/api/topics?category=${category}`
    : "/api/topics";

  return useSWR<{ topics: TopicWithMeeting[] }>(url, fetcher);
}
