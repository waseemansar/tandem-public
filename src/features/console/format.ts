import { visitorDisplayNameOrNull } from "@/features/conversation/visitor-name";

export function visitorDisplayName(input: {
    firstName: string | null;
    email: string | null;
}): string {
    return visitorDisplayNameOrNull(input) ?? "Visitor";
}

export function initialFromDisplayName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length === 0) return "?";
    return trimmed.charAt(0).toUpperCase();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(date: Date, now: Date = new Date()): string {
    const diff = now.getTime() - date.getTime();
    if (diff < MINUTE) return "just now";
    if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
    if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
    return `${Math.floor(diff / DAY)}d`;
}

export const JUST_NOW_WINDOW_MS = 60 * SECOND;

export function isJustNow(date: Date, now: Date = new Date()): boolean {
    return now.getTime() - date.getTime() < JUST_NOW_WINDOW_MS;
}
