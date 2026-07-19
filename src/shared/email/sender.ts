export type EmailMessage = {
    to: string;
    subject: string;
    text: string;
    html?: string;
};

export interface EmailSender {
    send(msg: EmailMessage): Promise<void>;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type ResendConfig = {
    apiKey: string;
    fromEmail: string;
};

export function createResendEmailSender(config: ResendConfig): EmailSender {
    return {
        async send(msg) {
            try {
                const res = await fetch(RESEND_ENDPOINT, {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        authorization: `Bearer ${config.apiKey}`,
                    },
                    body: JSON.stringify({
                        from: config.fromEmail,
                        to: msg.to,
                        subject: msg.subject,
                        text: msg.text,
                        ...(msg.html ? { html: msg.html } : {}),
                    }),
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    console.error(
                        `[email-sender] Resend delivery failed (${res.status}): ${text.slice(0, 200)}`,
                    );
                }
            } catch (err) {
                console.error("[email-sender] Resend request threw", err);
            }
        },
    };
}

let _sender: EmailSender = createNoopEmailSender();

function createNoopEmailSender(): EmailSender {
    return {
        async send() {
            // Default before init: never fire. Production wires Resend;
            // tests wire an in-memory impl.
        },
    };
}

export function setEmailSender(s: EmailSender): void {
    _sender = s;
}

export function resetEmailSender(): void {
    _sender = createNoopEmailSender();
}

export function getEmailSender(): EmailSender {
    return _sender;
}

let _initialized = false;

export function initEmailSenderFromEnv(): void {
    if (_initialized) return;
    _initialized = true;
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !fromEmail) {
        console.warn(
            "[email-sender] RESEND_API_KEY or RESEND_FROM_EMAIL unset — magic-link emails disabled",
        );
        return;
    }
    setEmailSender(createResendEmailSender({ apiKey, fromEmail }));
}
