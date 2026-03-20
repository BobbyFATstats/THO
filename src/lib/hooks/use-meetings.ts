import useSWR from "swr";
import type { Meeting, MeetingWithRelations } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useMeetings(limit = 20) {
  return useSWR<{ meetings: Meeting[]; total: number }>(
    `/api/meetings?limit=${limit}`,
    fetcher
  );
}

export function useMeeting(id: string | undefined) {
  return useSWR<MeetingWithRelations>(
    id ? `/api/meetings/${id}` : null,
    fetcher
  );
}
