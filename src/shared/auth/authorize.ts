import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";

export type AuthorizedUser = {
    id: string;
    email: string;
};

export type CredentialsInput = {
    email: string;
    password: string;
};

export async function authorizeCredentials(
    input: CredentialsInput,
): Promise<AuthorizedUser | null> {
    const [row] = await getDb().select().from(users).where(eq(users.email, input.email));
    if (!row) return null;
    const ok = await bcrypt.compare(input.password, row.passwordHash);
    if (!ok) return null;
    return { id: row.id, email: row.email };
}
