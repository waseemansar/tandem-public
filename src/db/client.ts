import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(url: string): Db {
    return drizzle(postgres(url), { schema });
}

let _db: Db | undefined;

export function setDb(db: Db): void {
    _db = db;
}

export function getDb(): Db {
    if (!_db) {
        const url = process.env.DATABASE_URL;
        if (!url) {
            throw new Error("DATABASE_URL is not set");
        }
        _db = createDb(url);
    }
    return _db;
}
