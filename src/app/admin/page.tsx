import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function AdminHome() {
    const session = await auth();
    if (!session?.user) redirect("/admin/signin");
    redirect("/admin/inbox");
}
