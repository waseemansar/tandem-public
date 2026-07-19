import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { healthChecks } from "@/db/schema";

export async function POST() {
    const db = getDb();
    const [row] = await db.insert(healthChecks).values({}).returning();
    return NextResponse.json({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
    });
}
