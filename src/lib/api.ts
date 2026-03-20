import { NextResponse } from "next/server";

// Auth is handled by middleware (src/middleware.ts) which protects all routes
// except /login, /api/auth/*, /api/cron/*, and static files.
// API routes don't need additional auth checks.

export function requireCronAuth(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function jsonError(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status });
}
