const DEFAULT_REDIRECT = "/admin/inbox";

export function resolveSignInRedirect(callbackUrl: string | null | undefined): string {
    if (!callbackUrl) return DEFAULT_REDIRECT;

    let pathname: string;
    let search = "";

    if (callbackUrl.startsWith("//")) {
        return DEFAULT_REDIRECT;
    }

    if (callbackUrl.startsWith("/")) {
        const qIndex = callbackUrl.indexOf("?");
        pathname = qIndex === -1 ? callbackUrl : callbackUrl.slice(0, qIndex);
        search = qIndex === -1 ? "" : callbackUrl.slice(qIndex);
    } else {
        try {
            const url = new URL(callbackUrl);
            pathname = url.pathname;
            search = url.search;
        } catch {
            return DEFAULT_REDIRECT;
        }
    }

    if (!pathname.startsWith("/admin/")) return DEFAULT_REDIRECT;
    if (pathname.startsWith("/admin/signin")) return DEFAULT_REDIRECT;

    return pathname + search;
}
