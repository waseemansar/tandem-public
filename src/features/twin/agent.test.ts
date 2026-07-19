import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openai/agents", () => {
    const Agent = vi.fn();
    const run = vi.fn();
    const tool = vi.fn((cfg: unknown) => cfg);
    return { Agent, run, tool };
});

import { Agent, run } from "@openai/agents";
import { fullName, pronouns } from "@/config/site";
import {
    createOpenAITwinAgent,
    isOpenAiRateLimitError,
    isTwinDisabled,
    REQUEST_HANDOFF_TOOL_NAME,
    type TwinStreamEvent,
} from "@/features/twin/agent";

const mockedAgentCtor = vi.mocked(Agent);
const mockedRun = vi.mocked(run);

type SdkEvent =
    | { type: "raw_model_stream_event"; data: { type: string; delta?: string } }
    | { type: "run_item_stream_event"; name: string; item: { toolName: string } };

function makeStreamedResult(events: SdkEvent[]) {
    return {
        async *[Symbol.asyncIterator]() {
            for (const e of events) yield e;
        },
    };
}

async function collect(iter: AsyncIterable<TwinStreamEvent>): Promise<TwinStreamEvent[]> {
    const out: TwinStreamEvent[] = [];
    for await (const ev of iter) out.push(ev);
    return out;
}

describe("createOpenAITwinAgent", () => {
    beforeEach(() => {
        mockedAgentCtor.mockReset();
        mockedRun.mockReset();
        process.env.OPENAI_API_KEY = "test-key";
        delete process.env.OPENAI_TWIN_MODEL;
    });

    it("yields text_delta events for streamed output_text_delta chunks", async () => {
        mockedRun.mockResolvedValue(
            makeStreamedResult([
                {
                    type: "raw_model_stream_event",
                    data: { type: "output_text_delta", delta: "Hi" },
                },
                {
                    type: "raw_model_stream_event",
                    data: { type: "output_text_delta", delta: " there." },
                },
            ]) as never,
        );

        const agent = createOpenAITwinAgent();
        const events = await collect(
            agent.stream({
                transcript: "Visitor: Where is Waseem Ansar based?",
                doc: "Waseem Ansar is based in Berlin.",
            }),
        );

        expect(events).toEqual([
            { type: "text_delta", delta: "Hi" },
            { type: "text_delta", delta: " there." },
        ]);
    });

    it("yields a tool_call event when the model invokes request_human_handoff", async () => {
        mockedRun.mockResolvedValue(
            makeStreamedResult([
                {
                    type: "raw_model_stream_event",
                    data: { type: "output_text_delta", delta: "I don't have that." },
                },
                {
                    type: "run_item_stream_event",
                    name: "tool_called",
                    item: { toolName: REQUEST_HANDOFF_TOOL_NAME },
                },
            ]) as never,
        );

        const agent = createOpenAITwinAgent();
        const events = await collect(
            agent.stream({ transcript: "Visitor: What's his shoe size?", doc: "..." }),
        );

        expect(events).toEqual([
            { type: "text_delta", delta: "I don't have that." },
            { type: "tool_call", name: REQUEST_HANDOFF_TOOL_NAME },
        ]);
    });

    it("grounds the agent in the doc, registers the handoff tool, and tells the model not to prefix its reply", async () => {
        mockedRun.mockResolvedValue(makeStreamedResult([]) as never);

        const doc = "Waseem Ansar is based in Berlin.";
        const transcript = "Visitor (Priya): Where is Waseem Ansar based?";

        const agent = createOpenAITwinAgent();
        await collect(agent.stream({ transcript, doc }));

        expect(mockedAgentCtor).toHaveBeenCalledTimes(1);
        const config = mockedAgentCtor.mock.calls[0][0] as {
            instructions: string;
            tools: Array<{ name: string }>;
        };
        expect(config.instructions).toContain(doc);
        expect(config.instructions).toContain(
            "Reply with the message body only — do not prefix with 'Tandem:' or any speaker label.",
        );
        expect(config.instructions).toMatch(/greetings and small talk/i);
        expect(config.tools.some((t) => t.name === REQUEST_HANDOFF_TOOL_NAME)).toBe(true);

        expect(mockedRun).toHaveBeenCalledTimes(1);
        expect(mockedRun.mock.calls[0][1]).toBe(transcript);
        const runOpts = mockedRun.mock.calls[0][2] as { stream: boolean };
        expect(runOpts.stream).toBe(true);
    });

    it("identifies the represented human by the configured name and pronouns, not a hardcoded person", async () => {
        mockedRun.mockResolvedValue(makeStreamedResult([]) as never);

        await collect(createOpenAITwinAgent().stream({ transcript: "Visitor: hi", doc: "d" }));

        const config = mockedAgentCtor.mock.calls[0][0] as { instructions: string };
        expect(config.instructions).toContain(`the digital twin of ${fullName}`);
        expect(config.instructions).toContain(`Never invent facts about ${fullName}`);
        expect(config.instructions).toContain(`contact ${pronouns.object}`);
        expect(config.instructions).toContain(`${pronouns.possessive} email`);
        expect(config.instructions).not.toMatch(/\bWaseem\b/);
        expect(config.instructions).not.toMatch(/\bhim\b|\bhis\b/);
    });

    it("drafts FAQ pairs against the configured human, not a hardcoded person", async () => {
        mockedRun.mockResolvedValue({
            finalOutput: { question: "Where is Ada based?", answer: "Berlin." },
        } as never);

        await createOpenAITwinAgent().draftFaq({ transcript: "Visitor: where?" });

        const config = mockedAgentCtor.mock.calls[0][0] as { instructions: string };
        expect(config.instructions).toContain(fullName);
        expect(config.instructions).not.toMatch(/\bWaseem\b/);
    });

    it("forwards the abort signal to the SDK run call", async () => {
        mockedRun.mockResolvedValue(makeStreamedResult([]) as never);

        const controller = new AbortController();
        const agent = createOpenAITwinAgent();
        await collect(
            agent.stream({ transcript: "Visitor: hi", doc: "d", signal: controller.signal }),
        );

        const runOpts = mockedRun.mock.calls[0][2] as { signal?: AbortSignal };
        expect(runOpts.signal).toBe(controller.signal);
    });

    it("fails fast with a clear error when OPENAI_API_KEY is missing", () => {
        delete process.env.OPENAI_API_KEY;
        expect(() => createOpenAITwinAgent()).toThrow(/OPENAI_API_KEY/);
    });

    it("uses gpt-5-mini by default and honors OPENAI_TWIN_MODEL when set", async () => {
        mockedRun.mockResolvedValue(makeStreamedResult([]) as never);

        await collect(createOpenAITwinAgent().stream({ transcript: "Visitor: hi", doc: "d" }));
        const defaultConfig = mockedAgentCtor.mock.calls[0][0] as { model: string };
        expect(defaultConfig.model).toBe("gpt-5-mini");

        process.env.OPENAI_TWIN_MODEL = "gpt-5-nano";
        await collect(createOpenAITwinAgent().stream({ transcript: "Visitor: hi", doc: "d" }));
        const overrideConfig = mockedAgentCtor.mock.calls[1][0] as { model: string };
        expect(overrideConfig.model).toBe("gpt-5-nano");
    });
});

describe("isOpenAiRateLimitError", () => {
    it("detects a top-level 429 status", () => {
        expect(
            isOpenAiRateLimitError(Object.assign(new Error("rate limited"), { status: 429 })),
        ).toBe(true);
    });

    it("detects a 429 wrapped one or more levels deep in the cause chain", () => {
        const wrapped = Object.assign(new Error("agent run failed"), {
            cause: Object.assign(new Error("upstream"), {
                cause: Object.assign(new Error("rate limited"), { status: 429 }),
            }),
        });
        expect(isOpenAiRateLimitError(wrapped)).toBe(true);
    });

    it("returns false for non-429 statuses and plain errors", () => {
        expect(isOpenAiRateLimitError(Object.assign(new Error("boom"), { status: 500 }))).toBe(
            false,
        );
        expect(isOpenAiRateLimitError(new Error("boom"))).toBe(false);
        expect(isOpenAiRateLimitError(null)).toBe(false);
        expect(isOpenAiRateLimitError("429")).toBe(false);
    });
});

describe("isTwinDisabled", () => {
    afterEach(() => {
        delete process.env.DISABLE_TWIN;
    });

    it("is true only when DISABLE_TWIN is exactly 'true'", () => {
        expect(isTwinDisabled()).toBe(false);
        process.env.DISABLE_TWIN = "false";
        expect(isTwinDisabled()).toBe(false);
        process.env.DISABLE_TWIN = "1";
        expect(isTwinDisabled()).toBe(false);
        process.env.DISABLE_TWIN = "true";
        expect(isTwinDisabled()).toBe(true);
    });
});
