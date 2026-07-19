import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { createDb, setDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";

let container: StartedPostgreSqlContainer | undefined;
let db: Db | undefined;

export async function startTestDb(): Promise<Db> {
    if (!container) {
        container = await new PostgreSqlContainer("postgres:17-alpine").start();
        db = createDb(container.getConnectionUri());
        await runMigrations(db);
        setDb(db);
    }
    return db!;
}

export async function resetTestDb(): Promise<void> {
    if (!db) return;
    const rows = await db.execute<{ tablename: string }>(sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'
  `);
    const tables = rows.map((r) => r.tablename);
    if (tables.length === 0) return;
    const quoted = tables.map((t) => `"${t}"`).join(", ");
    await db.execute(sql.raw(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`));
}

export async function stopTestDb(): Promise<void> {
    if (container) {
        await container.stop();
        container = undefined;
        db = undefined;
    }
}
