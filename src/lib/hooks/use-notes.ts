import useSWR from "swr";
import type { Note } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useNotes(meetingId?: string) {
  const url = meetingId
    ? `/api/notes?meeting_id=${meetingId}`
    : "/api/notes";

  return useSWR<{ notes: Note[] }>(url, fetcher);
}
