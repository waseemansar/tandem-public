import { fullName } from "@/config/site";
import type { MessageSender } from "@/db/schema";

export interface TranscriptRow {
    sender: MessageSender;
    content: string;
}

export interface RenderTranscriptInput {
    rows: TranscriptRow[];
    visitorDisplayName: string | null;
}

export function renderTranscript({ rows, visitorDisplayName }: RenderTranscriptInput): string {
    if (rows.length === 0) return "";
    const visitorLabel = visitorDisplayName ? `Visitor (${visitorDisplayName})` : "Visitor";
    return rows.map((row) => renderRow(row, visitorLabel)).join("\n\n");
}

const LEADING_TANDEM_LABEL = /^tandem:\s*/i;

export function sanitizeTwinReply(rawReply: string): string {
    return rawReply.replace(LEADING_TANDEM_LABEL, "");
}

function renderRow(row: TranscriptRow, visitorLabel: string): string {
    switch (row.sender) {
        case "visitor":
            return `${visitorLabel}: ${row.content}`;
        case "twin":
            return `Tandem: ${row.content}`;
        case "human":
            return `${fullName}: ${row.content}`;
        case "system":
            return `[${row.content}]`;
    }
}
