import type { Notifier, NotifyInput } from "@/shared/notifier";

export interface InMemoryNotifier extends Notifier {
    getDeliveries(): NotifyInput[];
    clear(): void;
}

export function createInMemoryNotifier(): InMemoryNotifier {
    const deliveries: NotifyInput[] = [];
    return {
        async notify(input) {
            deliveries.push(input);
        },
        getDeliveries() {
            return [...deliveries];
        },
        clear() {
            deliveries.length = 0;
        },
    };
}
