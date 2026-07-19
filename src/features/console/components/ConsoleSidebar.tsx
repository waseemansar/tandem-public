import { BookOpen, Inbox, Layers, Lightbulb, Settings } from "lucide-react";
import Link from "next/link";
import { ConsoleBrand } from "@/features/console/components/ConsoleBrand";
import { SignOutButton } from "@/features/console/components/SignOutButton";
import { PhotoAvatar } from "@/components/Avatars";
import { fullName } from "@/config/site";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/shared/utils";
import type { SidebarCounts } from "@/features/console/types";

const NAV_BUTTON_CLASS =
    "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[14.5px] transition-colors group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:px-2 [&>svg]:size-4.5 [&>svg]:shrink-0";

type NavItemId = "inbox" | "conversations" | "faq_drafts" | "knowledge" | "settings";

interface NavItem {
    id: NavItemId;
    label: string;
    href: string | null;
    icon: typeof Inbox;
    count?: number;
}

export function ConsoleSidebar({
    activeItem,
    counts,
    userEmail,
}: {
    activeItem: NavItemId;
    counts: SidebarCounts;
    userEmail: string;
}) {
    const items: NavItem[] = [
        { id: "inbox", label: "Inbox", href: "/admin/inbox", icon: Inbox, count: counts.inbox },
        {
            id: "conversations",
            label: "Conversations",
            href: "/admin/conversations",
            icon: Layers,
        },
        {
            id: "faq_drafts",
            label: "FAQ drafts",
            href: "/admin/faq-drafts",
            icon: Lightbulb,
            count: counts.faqDrafts,
        },
        { id: "knowledge", label: "Knowledge", href: "/admin/knowledge", icon: BookOpen },
        { id: "settings", label: "Settings", href: null, icon: Settings },
    ];

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader className="px-4 py-5">
                <ConsoleBrand />
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {items.map((item) => (
                                <NavMenuItem
                                    key={item.id}
                                    item={item}
                                    active={item.id === activeItem}
                                />
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="border-line gap-3 border-t px-3 py-4">
                <div className="flex items-start gap-3">
                    <PhotoAvatar ring="human" sizePx={40} className="size-10" />
                    <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                        <p className="text-ink truncate text-sm font-semibold">{fullName}</p>
                        <p className="text-ink-3 font-mono text-[10.5px] font-medium tracking-[0.18em] uppercase">
                            The human
                        </p>
                        <p className="text-ink-3 mt-0.5 truncate text-[11px]" title={userEmail}>
                            {userEmail}
                        </p>
                    </div>
                </div>
                <div className="group-data-[collapsible=icon]:hidden">
                    <SignOutButton className="w-full" />
                </div>
            </SidebarFooter>
        </Sidebar>
    );
}

function NavMenuItem({ item, active }: { item: NavItem; active: boolean }) {
    const Icon = item.icon;
    const isLive = item.href !== null;
    const showBadge = typeof item.count === "number" && item.count > 0;

    return (
        <SidebarMenuItem>
            {isLive && item.href ? (
                <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    data-active={active}
                    className={cn(
                        NAV_BUTTON_CLASS,
                        active
                            ? "bg-twin-soft text-twin ring-twin-line ring-1 ring-inset"
                            : "text-ink-2 hover:bg-human-soft hover:text-human-2",
                    )}
                >
                    <Icon aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                    {showBadge && (
                        <span className="bg-human inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 font-mono text-[10.5px] font-semibold text-(--primary-foreground) tabular-nums">
                            {item.count}
                        </span>
                    )}
                </Link>
            ) : (
                <div
                    aria-disabled
                    className={cn(NAV_BUTTON_CLASS, "text-ink-4 cursor-not-allowed")}
                >
                    <Icon aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                    {showBadge && (
                        <span className="bg-ink-4/30 text-ink-3 inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 font-mono text-[10.5px] font-semibold tabular-nums">
                            {item.count}
                        </span>
                    )}
                </div>
            )}
        </SidebarMenuItem>
    );
}
