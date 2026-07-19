import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import { authorizeCredentials } from "@/shared/auth/authorize";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "correct-pw";

async function seedAdmin(): Promise<{ id: string }> {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const [row] = await getDb()
        .insert(users)
        .values({ email: ADMIN_EMAIL, passwordHash })
        .returning();
    return { id: row.id };
}

describe("authorizeCredentials", () => {
    beforeAll(async () => {
        await startTestDb();
    });

    afterAll(async () => {
        await stopTestDb();
    });

    beforeEach(async () => {
        await resetTestDb();
    });

    it("returns the user when email and password match", async () => {
        const { id } = await seedAdmin();

        const result = await authorizeCredentials({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
        });

        expect(result).toEqual({ id, email: ADMIN_EMAIL });
    });

    it("returns null when the email matches but the password does not", async () => {
        await seedAdmin();

        const result = await authorizeCredentials({
            email: ADMIN_EMAIL,
            password: "wrong-pw",
        });

        expect(result).toBeNull();
    });

    it("returns null when no user exists with the given email", async () => {
        await seedAdmin();

        const result = await authorizeCredentials({
            email: "stranger@example.com",
            password: ADMIN_PASSWORD,
        });

        expect(result).toBeNull();
    });
});
