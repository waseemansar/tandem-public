export type ChatMessage = {
    id: string;
    from: "visitor" | "twin" | "human" | "system";
    text: string;
    createdAt: string;
};
