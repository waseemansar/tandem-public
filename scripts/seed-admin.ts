import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";

async function main(): Promise<void> {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
        console.error(
            "Set ADMIN_EMAIL and ADMIN_PASSWORD (in .env or inline), then run: pnpm seed:admin",
        );
        process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const db = getDb();

    const [row] = await db
        .insert(users)
        .values({ email, passwordHash })
        .onConflictDoUpdate({
            target: users.email,
            set: { passwordHash, createdAt: sql`now()` },
        })
        .returning({ id: users.id, email: users.email });

    console.log(`Seeded admin: ${row.email} (id=${row.id})`);
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
