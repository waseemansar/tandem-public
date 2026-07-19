import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { knowledgeDoc, users } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { ADMIN_EMAIL, ADMIN_PASSWORD, KNOWLEDGE_DOC_CONTENT } from "@tests/e2e/setup/constants";

const KNOWLEDGE_DOC_ID = 1;

export type TestDbHandle = {
    db: ReturnType<typeof drizzle<typeof schema>>;
    close: () => Promise<void>;
};

export function connect(): TestDbHandle {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (check .env.test)");
    const client = postgres(url);
    const db = drizzle(client, { schema });
    return {
        db,
        close: async () => {
            await client.end({ timeout: 5 });
        },
    };
}

export async function migrate(db: TestDbHandle["db"]): Promise<void> {
    await runMigrations(db);
}

export async function resetAndSeed(db: TestDbHandle["db"]): Promise<void> {
    await db.execute(sql`
        TRUNCATE TABLE
            "messages",
            "faq_suggestions",
            "conversations",
            "knowledge_doc",
            "users"
        RESTART IDENTITY CASCADE
    `);

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 4);
    await db.insert(users).values({ email: ADMIN_EMAIL, passwordHash });

    await db.insert(knowledgeDoc).values({ id: KNOWLEDGE_DOC_ID, content: KNOWLEDGE_DOC_CONTENT });
}
