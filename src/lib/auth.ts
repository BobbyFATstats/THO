import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

let hashedPassword: string | null = null;

async function getHashedPassword(): Promise<string> {
  if (!hashedPassword) {
    const pw = process.env.TEAM_PASSWORD;
    if (!pw) throw new Error("Missing TEAM_PASSWORD env var");
    hashedPassword = await bcrypt.hash(pw, 10);
  }
  return hashedPassword;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Team Password",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.password) return null;
        const hash = await getHashedPassword();
        const valid = await bcrypt.compare(credentials.password, hash);
        if (valid) {
          return { id: "team", name: "THO Team" };
        }
        return null;
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  pages: {
    signIn: "/login",
  },
};
