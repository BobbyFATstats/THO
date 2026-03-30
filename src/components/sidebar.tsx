"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Meeting } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "grid" },
  { href: "/action-items", label: "Action Items", icon: "check-square" },
  { href: "/topics", label: "Topics", icon: "message-square" },
  { href: "/crm-tracker", label: "CRM Tracker", icon: "bar-chart", phase2: true },
];

function NavIcon({ icon }: { icon: string }) {
  const icons: Record<string, string> = {
    grid: "M4 4h6v6H4V4zm10 0h6v6h-6V4zm-10 10h6v6H4v-6zm10 0h6v6h-6v-6z",
    "check-square": "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11",
    "message-square": "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
    "bar-chart": "M12 20V10M18 20V4M6 20v-4",
  };
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={icons[icon]} />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { data } = useSWR<{ meetings: Meeting[] }>("/api/meetings?limit=10", fetcher);

  return (
    <aside className="w-64 h-screen bg-card border-r border-border flex flex-col shrink-0">
      <div className="p-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          THO Stand-Up
        </Link>
      </div>

      <nav className="px-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              )}
            >
              <NavIcon icon={item.icon} />
              {item.label}
              {item.phase2 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  Phase 2
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      <Separator className="my-4" />

      <div className="px-4 pb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Recent Meetings
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {data?.meetings?.map((meeting) => {
          const meetingPath = `/meetings/${meeting.id}`;
          const active = pathname === meetingPath;
          return (
            <Link
              key={meeting.id}
              href={meetingPath}
              className={cn(
                "block px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              )}
            >
              {format(new Date(meeting.date + "T00:00:00"), "MMM d, yyyy")}
            </Link>
          );
        })}
        {data?.meetings?.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            No meetings yet
          </p>
        )}
      </div>
    </aside>
  );
}
