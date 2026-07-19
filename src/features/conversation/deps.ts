import { getDb, type Db } from "@/db/client";
import { getClock, type Clock } from "@/shared/clock";
import { getEmailSender, initEmailSenderFromEnv, type EmailSender } from "@/shared/email/sender";
import {
    getMagicLinkSigner,
    initMagicLinkSignerFromEnv,
    type MagicLinkSigner,
} from "@/shared/magic-link";
import { getNotifier, initNotifierFromEnv, type Notifier } from "@/shared/notifier";
import { getSseBroadcaster, type SseBroadcaster } from "@/shared/sse-broadcaster";
import { getTwinAgent, type TwinAgent } from "@/features/twin/agent";

export type ConversationDeps = {
    db: Db;
    twinAgent: TwinAgent;
    sse: SseBroadcaster;
    clock: Clock;
    notifier: Notifier;
    emailSender: EmailSender;
    magicLinkSigner: MagicLinkSigner;
    appBaseUrl: string;
};

export function defaultConversationDeps(): ConversationDeps {
    initNotifierFromEnv();
    initEmailSenderFromEnv();
    initMagicLinkSignerFromEnv();
    return {
        db: getDb(),
        twinAgent: getTwinAgent(),
        sse: getSseBroadcaster(),
        clock: getClock(),
        notifier: getNotifier(),
        emailSender: getEmailSender(),
        magicLinkSigner: getMagicLinkSigner(),
        appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
    };
}
