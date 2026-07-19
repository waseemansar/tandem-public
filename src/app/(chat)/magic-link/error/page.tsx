import Link from "next/link";
import { fullName } from "@/config/site";

type SearchParams = Promise<{ reason?: string }>;

const COPY = {
    expired: {
        title: "This link has expired",
        body: `Magic links expire after 30 days. Reply to ${fullName}'s most recent email, or start a new conversation.`,
    },
    invalid: {
        title: "This link is invalid",
        body: `The link couldn't be verified. It may have been tampered with, or its signing secret has been rotated. Reply to ${fullName}'s most recent email, or start a new conversation.`,
    },
};

export default async function MagicLinkErrorPage(props: { searchParams: SearchParams }) {
    const { reason } = await props.searchParams;
    const copy = reason === "expired" ? COPY.expired : COPY.invalid;

    return (
        <main className="mx-auto flex max-w-md flex-col gap-4 px-6 py-24 text-center">
            <h1 className="text-2xl font-semibold">{copy.title}</h1>
            <p className="text-muted-foreground">{copy.body}</p>
            <Link className="text-primary underline" href="/">
                Start a new conversation
            </Link>
        </main>
    );
}
