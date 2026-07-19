import type { EmailMessage, EmailSender } from "@/shared/email/sender";

export interface InMemoryEmailSender extends EmailSender {
    getSends(): EmailMessage[];
    clear(): void;
}

export function createInMemoryEmailSender(): InMemoryEmailSender {
    const sends: EmailMessage[] = [];
    return {
        async send(msg) {
            sends.push(msg);
        },
        getSends() {
            return [...sends];
        },
        clear() {
            sends.length = 0;
        },
    };
}
