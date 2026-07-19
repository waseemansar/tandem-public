import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Db } from "@/db/client";

export async function runMigrations(db: Db): Promise<void> {
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
}
