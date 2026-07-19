import { describe, expect, it } from "vitest";
import { authorizedCallback, isAdminPathProtected } from "@/shared/auth/path-gate";

function req(pathname: string): { nextUrl: { pathname: string } } {
    return { nextUrl: { pathname } };
}

describe("isAdminPathProtected", () => {
    it("protects /admin", () => {
        expect(isAdminPathProtected("/admin")).toBe(true);
    });

    it("protects nested /admin/* paths", () => {
        expect(isAdminPathProtected("/admin/inbox")).toBe(true);
    });

    it("exempts /admin/signin so unauthenticated visitors can sign in", () => {
        expect(isAdminPathProtected("/admin/signin")).toBe(false);
    });

    it("treats the root and non-admin routes as public", () => {
        expect(isAdminPathProtected("/")).toBe(false);
        expect(isAdminPathProtected("/api/chat")).toBe(false);
    });
});

describe("authorizedCallback", () => {
    it("allows public routes through regardless of auth state", () => {
        expect(authorizedCallback({ auth: null, request: req("/") })).toBe(true);
        expect(authorizedCallback({ auth: null, request: req("/admin/signin") })).toBe(true);
    });

    it("rejects unauthenticated requests to protected /admin routes", () => {
        expect(authorizedCallback({ auth: null, request: req("/admin") })).toBe(false);
    });

    it("allows authenticated requests to protected /admin routes", () => {
        const auth = { user: { email: "admin@example.com" } };
        expect(authorizedCallback({ auth, request: req("/admin") })).toBe(true);
    });
});
