import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ConsoleSidebar } from "@/features/console/components/ConsoleSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { loadSidebarCounts } from "@/features/console/sidebar-counts";

export default async function KnowledgeLayout({ children }: { children: ReactNode }) {
    const session = await auth();
    if (!session?.user?.email) redirect("/admin/signin");

    const cookieStore = await cookies();
    const sidebarState = cookieStore.get("sidebar_state")?.value;
    const defaultOpen = sidebarState !== "false";

    const counts = await loadSidebarCounts();

    return (
        <SidebarProvider defaultOpen={defaultOpen}>
            <ConsoleSidebar activeItem="knowledge" counts={counts} userEmail={session.user.email} />
            <SidebarInset className="min-w-0 bg-(--bg)">{children}</SidebarInset>
        </SidebarProvider>
    );
}
