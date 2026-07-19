import { NextResponse } from "next/server";
import * as VisitorSession from "@/features/visitor/session";

export async function POST() {
    const res = new NextResponse(null, { status: 204 });
    VisitorSession.clear(res);
    return res;
}
