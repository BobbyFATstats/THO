"use client";

import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatsCard } from "@/components/stats-card";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type StageInfo = { id: string; name: string; position: number };

type GHLData = {
  acquisition: {
    total: number;
    byStage: Record<string, number>;
    stages: StageInfo[];
    underContract: {
      id: string;
      name: string;
      value: number;
      stage: string;
      createdAt: string;
      customFields?: { id: string; fieldValueString?: string }[];
    }[];
  };
  disposition: {
    total: number;
    byStage: Record<string, number>;
    stages: StageInfo[];
    deals: {
      id: string;
      name: string;
      value: number;
      stage: string;
      createdAt: string;
    }[];
  };
  contacts: {
    total: number;
    recentCount: number;
  };
  error?: string;
};

const STAGE_COLORS: Record<string, string> = {
  "New": "bg-blue-100 text-blue-800",
  "Attempting Contact": "bg-yellow-100 text-yellow-800",
  "Engaged – Discovery": "bg-orange-100 text-orange-800",
  "Qualified – Underwriting": "bg-purple-100 text-purple-800",
  "Offer Sent": "bg-indigo-100 text-indigo-800",
  "Negotiating": "bg-pink-100 text-pink-800",
  "Contract Out": "bg-amber-100 text-amber-800",
  "Under Contract": "bg-green-100 text-green-800",
  "Dead / Withdrawn": "bg-gray-100 text-gray-500",
  "Intake / Prep": "bg-blue-100 text-blue-800",
  "Marketing Active": "bg-cyan-100 text-cyan-800",
  "Buyer Negotiations": "bg-orange-100 text-orange-800",
  "Buyer Selected": "bg-purple-100 text-purple-800",
  "Escrow Opened": "bg-indigo-100 text-indigo-800",
  "Inspection / Access": "bg-yellow-100 text-yellow-800",
  "Clear to Close": "bg-emerald-100 text-emerald-800",
  "Closed – Paid": "bg-green-100 text-green-800",
};

function StageBadge({ stage }: { stage: string }) {
  const color = STAGE_COLORS[stage] || "bg-gray-100 text-gray-800";
  return (
    <Badge variant="outline" className={`text-xs ${color}`}>
      {stage}
    </Badge>
  );
}

export default function CrmTrackerPage() {
  const { data, error, isLoading } = useSWR<GHLData>("/api/ghl", fetcher, {
    refreshInterval: 300000, // refresh every 5 min
  });

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">CRM Tracker</h1>
        <p className="text-muted-foreground">Loading GoHighLevel data...</p>
      </div>
    );
  }

  if (error || data?.error) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">CRM Tracker</h1>
        <Card>
          <CardContent className="p-4">
            <p className="text-destructive">
              Failed to load GHL data: {data?.error || error?.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">CRM Tracker</h1>

      {/* Top stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatsCard label="Acquisition Pipeline" value={data.acquisition.total} />
        <StatsCard label="Disposition Pipeline" value={data.disposition.total} />
        <StatsCard label="Under Contract" value={data.acquisition.underContract.length} />
        <StatsCard label="Total Contacts" value={data.contacts.total} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Acquisition Pipeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Acquisition Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.acquisition.stages
                .sort((a, b) => a.position - b.position)
                .map((stage) => {
                  const count = data.acquisition.byStage[stage.name] || 0;
                  if (count === 0) return null;
                  return (
                    <div
                      key={stage.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <StageBadge stage={stage.name} />
                      <span className="font-medium">{count}</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        {/* Disposition Pipeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Disposition & Closing Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.disposition.stages
                .sort((a, b) => a.position - b.position)
                .map((stage) => {
                  const count = data.disposition.byStage[stage.name] || 0;
                  if (count === 0) return null;
                  return (
                    <div
                      key={stage.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <StageBadge stage={stage.name} />
                      <span className="font-medium">{count}</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Under Contract Deals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Deals Under Contract ({data.acquisition.underContract.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.acquisition.underContract.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No deals currently under contract
            </p>
          ) : (
            <div className="space-y-3">
              {data.acquisition.underContract.map((deal) => (
                <div
                  key={deal.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div>
                    <p className="text-sm font-medium">{deal.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Contracted:{" "}
                      {format(new Date(deal.createdAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {deal.value > 0 && (
                      <span className="text-sm font-medium">
                        ${deal.value.toLocaleString()}
                      </span>
                    )}
                    <StageBadge stage={deal.stage} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disposition Active Deals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Disposition Deals ({data.disposition.deals.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.disposition.deals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active disposition deals
            </p>
          ) : (
            <div className="space-y-3">
              {data.disposition.deals.map((deal) => (
                <div
                  key={deal.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div>
                    <p className="text-sm font-medium">{deal.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(deal.createdAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {deal.value > 0 && (
                      <span className="text-sm font-medium">
                        ${deal.value.toLocaleString()}
                      </span>
                    )}
                    <StageBadge stage={deal.stage} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
