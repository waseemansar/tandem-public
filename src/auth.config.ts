import type { NextAuthConfig } from "next-auth";
import { authorizedCallback } from "@/shared/auth/path-gate";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

export const authConfig = {
    session: { strategy: "jwt", maxAge: THIRTY_DAYS_IN_SECONDS },
    pages: { signIn: "/admin/signin" },
    callbacks: {
        authorized: authorizedCallback,
    },
    providers: [],
} satisfies NextAuthConfig;
