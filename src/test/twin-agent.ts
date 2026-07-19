import type { DraftFaqResult, TwinAgent, TwinStreamEvent } from "@/features/twin/agent";

const DEFAULT_DRAFT: DraftFaqResult = {
    question: "What did the visitor want?",
    answer: "Default drafted answer.",
};

async function defaultDraftFaq(): Promise<DraftFaqResult> {
    return DEFAULT_DRAFT;
}

export function createEchoTwinAgent(): TwinAgent {
    return {
        async *stream({ transcript }): AsyncIterable<TwinStreamEvent> {
            yield { type: "text_delta", delta: `Echo: ${lastSpeakerContent(transcript)}` };
        },
        draftFaq: defaultDraftFaq,
    };
}

export function createDeclineTwinAgent(leadIn: string): TwinAgent {
    return {
        async *stream(): AsyncIterable<TwinStreamEvent> {
            yield { type: "text_delta", delta: leadIn };
            yield { type: "tool_call", name: "request_human_handoff" };
        },
        draftFaq: defaultDraftFaq,
    };
}

export function createPausedTwinAgent(firstDelta: string): TwinAgent {
    return {
        async *stream({ signal }): AsyncIterable<TwinStreamEvent> {
            yield { type: "text_delta", delta: firstDelta };
            await new Promise<void>((_resolve, reject) => {
                if (signal?.aborted) {
                    reject(new DOMException("aborted", "AbortError"));
                    return;
                }
                signal?.addEventListener(
                    "abort",
                    () => reject(new DOMException("aborted", "AbortError")),
                    { once: true },
                );
            });
            yield { type: "text_delta", delta: "(unreachable)" };
        },
        draftFaq: defaultDraftFaq,
    };
}

export function createPausingThenEchoingTwinAgent(firstDelta: string): TwinAgent {
    let firstCall = true;
    return {
        async *stream({ transcript, signal }): AsyncIterable<TwinStreamEvent> {
            if (firstCall) {
                firstCall = false;
                yield { type: "text_delta", delta: firstDelta };
                await new Promise<void>((_resolve, reject) => {
                    if (signal?.aborted) {
                        reject(new DOMException("aborted", "AbortError"));
                        return;
                    }
                    signal?.addEventListener(
                        "abort",
                        () => reject(new DOMException("aborted", "AbortError")),
                        { once: true },
                    );
                });
                yield { type: "text_delta", delta: "(unreachable)" };
                return;
            }
            yield { type: "text_delta", delta: `Echo: ${lastSpeakerContent(transcript)}` };
        },
        draftFaq: defaultDraftFaq,
    };
}

export function createErroringTwinAgent(deltasBeforeError: string[], message: string): TwinAgent {
    return {
        async *stream(): AsyncIterable<TwinStreamEvent> {
            for (const delta of deltasBeforeError) {
                yield { type: "text_delta", delta };
            }
            throw new Error(message);
        },
        draftFaq: defaultDraftFaq,
    };
}

export function createStubDraftFaqAgent(
    draft: DraftFaqResult,
    options: { captureTranscripts?: string[] } = {},
): TwinAgent {
    return {
        async *stream(): AsyncIterable<TwinStreamEvent> {
            yield { type: "text_delta", delta: "ok" };
        },
        async draftFaq({ transcript }) {
            options.captureTranscripts?.push(transcript);
            return draft;
        },
    };
}

function lastSpeakerContent(transcript: string): string {
    const lastRow = transcript.split("\n\n").at(-1) ?? "";
    const colon = lastRow.indexOf(": ");
    return colon === -1 ? lastRow : lastRow.slice(colon + 2);
}
