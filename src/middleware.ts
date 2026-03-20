import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    // Only protect page routes, not API routes
    // API routes are internal — called by the authenticated frontend
    "/((?!login|api|_next/static|_next/image|favicon.ico).*)",
  ],
};
