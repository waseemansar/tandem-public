import { notFound } from "next/navigation";
import { LiveThreadView } from "@/features/console/components/LiveThreadView";
import { getThreadDetail } from "@/features/console/inbox";

export default async function ConversationDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const thread = await getThreadDetail(id, { includeTwinOnly: true });
    if (!thread) notFound();

    return (
        <LiveThreadView
            initial={{
                id: thread.id,
                displayName: thread.displayName,
                email: thread.email,
                state: thread.state,
                escalatedAt: thread.escalatedAt?.toISOString() ?? null,
                messages: thread.messages.map((m) => ({
                    id: m.id,
                    sender: m.sender,
                    content: m.content,
                    createdAt: m.createdAt.toISOString(),
                })),
            }}
            backHref="/admin/conversations"
            backLabel="Back to Conversations"
        />
    );
}
