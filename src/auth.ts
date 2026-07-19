import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { authorizeCredentials } from "@/shared/auth/authorize";

const credentialsSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

export const { auth, signIn, signOut, handlers } = NextAuth({
    ...authConfig,
    providers: [
        Credentials({
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(raw) {
                const parsed = credentialsSchema.safeParse(raw);
                if (!parsed.success) return null;
                return authorizeCredentials(parsed.data);
            },
        }),
    ],
});
