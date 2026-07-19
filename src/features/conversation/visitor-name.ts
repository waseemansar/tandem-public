export function humaniseEmailLocal(email: string): string {
    const local = email.split("@")[0] ?? email;
    const cleaned = local.replace(/[._-]+/g, " ").trim();
    if (cleaned.length === 0) return local;
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function visitorDisplayNameOrNull({
    firstName,
    email,
}: {
    firstName: string | null;
    email: string | null;
}): string | null {
    if (firstName && firstName.trim().length > 0) return firstName.trim();
    if (email) return humaniseEmailLocal(email);
    return null;
}
