import { integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const healthChecks = pgTable("health_checks", {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const conversationState = pgEnum("conversation_state", [
    "twin_only",
    "awaiting_you",
    "active_you",
    "awaiting_visitor",
    "resolved",
]);

export const messageSender = pgEnum("message_sender", ["visitor", "twin", "human", "system"]);

export type ConversationState = (typeof conversationState.enumValues)[number];

export type MessageSender = (typeof messageSender.enumValues)[number];

export const conversations = pgTable("conversations", {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email"),
    firstName: text("first_name"),
    state: conversationState("state").notNull().default("twin_only"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    lastHumanActivityAt: timestamp("last_human_activity_at", { withTimezone: true }),
    escalationOfferedAt: timestamp("escalation_offered_at", { withTimezone: true }),
});

export const messages = pgTable("messages", {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
        .notNull()
        .references(() => conversations.id, { onDelete: "cascade" }),
    sender: messageSender("sender").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const knowledgeDoc = pgTable("knowledge_doc", {
    id: integer("id").primaryKey(),
    content: text("content").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Anti-abuse rate-limit counters, one row per (key, wall-clock
// minute). The layer prefix on `key` ("conv:<id>", "ip:<bucket>") lets a single
// table serve every layer. A periodic sweep deletes rows older than two minutes.
export const rateLimitBuckets = pgTable(
    "rate_limit_buckets",
    {
        key: text("key").notNull(),
        bucketMinute: timestamp("bucket_minute", { withTimezone: true }).notNull(),
        count: integer("count").notNull().default(0),
    },
    (t) => [primaryKey({ columns: [t.key, t.bucketMinute] })],
);

export const faqSuggestionStatus = pgEnum("faq_suggestion_status", [
    "pending",
    "approved",
    "dismissed",
]);

export const faqSuggestions = pgTable("faq_suggestions", {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
        .notNull()
        .references(() => conversations.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    status: faqSuggestionStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
