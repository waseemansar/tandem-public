const ADMIN_PUBLIC_PATHS = new Set(["/admin/signin"]);

export function isAdminPathProtected(pathname: string): boolean {
    if (ADMIN_PUBLIC_PATHS.has(pathname)) return false;
    return pathname.startsWith("/admin");
}

type AuthorizedCallbackArgs = {
    auth: { user?: unknown } | null;
    request: { nextUrl: { pathname: string } };
};

export function authorizedCallback({ auth, request }: AuthorizedCallbackArgs): boolean {
    if (!isAdminPathProtected(request.nextUrl.pathname)) return true;
    return !!auth?.user;
}
