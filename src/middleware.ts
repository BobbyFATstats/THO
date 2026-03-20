import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    // Protect everything except login, api/auth, api/cron, and static files
    "/((?!login|api/auth|api/cron|_next/static|_next/image|favicon.ico).*)",
  ],
};
