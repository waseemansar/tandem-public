export type NotifyInput = {
    conversationId: string;
    title: string;
    message: string;
    threadUrl: string;
};

export interface Notifier {
    notify(input: NotifyInput): Promise<void>;
}

export type PushoverConfig = {
    appToken: string;
    userKey: string;
    appBaseUrl: string;
};

const PUSHOVER_ENDPOINT = "https://api.pushover.net/1/messages.json";

export function createPushoverNotifier(config: PushoverConfig): Notifier {
    return {
        async notify(input) {
            const body = new URLSearchParams({
                token: config.appToken,
                user: config.userKey,
                title: input.title,
                message: input.message,
                url: input.threadUrl,
                url_title: "Open thread",
            });
            try {
                const res = await fetch(PUSHOVER_ENDPOINT, {
                    method: "POST",
                    headers: { "content-type": "application/x-www-form-urlencoded" },
                    body: body.toString(),
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    console.error(
                        `[notifier] Pushover delivery failed (${res.status}): ${text.slice(0, 200)}`,
                    );
                }
            } catch (err) {
                console.error("[notifier] Pushover request threw", err);
            }
        },
    };
}

export function buildThreadUrl(appBaseUrl: string, conversationId: string): string {
    const trimmed = appBaseUrl.replace(/\/+$/, "");
    return `${trimmed}/admin/inbox/${conversationId}`;
}

let _notifier: Notifier = createNoopNotifier();

function createNoopNotifier(): Notifier {
    return {
        async notify() {
            // Default before init: never fire. Production wires a Pushover impl;
            // tests wire an in-memory impl.
        },
    };
}

export function setNotifier(n: Notifier): void {
    _notifier = n;
}

export function resetNotifier(): void {
    _notifier = createNoopNotifier();
}

export function getNotifier(): Notifier {
    return _notifier;
}

let _initialized = false;

export function initNotifierFromEnv(): void {
    if (_initialized) return;
    _initialized = true;
    const appToken = process.env.PUSHOVER_APP_TOKEN;
    const userKey = process.env.PUSHOVER_USER_KEY;
    const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
    if (!appToken || !userKey) {
        console.warn(
            "[notifier] PUSHOVER_APP_TOKEN or PUSHOVER_USER_KEY unset — notifications disabled",
        );
        return;
    }
    setNotifier(createPushoverNotifier({ appToken, userKey, appBaseUrl }));
}
