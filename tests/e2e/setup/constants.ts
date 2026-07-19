// Unique string we plant inside the seeded knowledge doc so test (a) can
// assert the twin's reply actually drew from the doc rather than guessing.
// Picked to be obviously non-English so the LLM has no temptation to translate
// or paraphrase it away.
export const KNOWLEDGE_NONCE = "fuchsia-orbit-seven";

export const KNOWLEDGE_NONCE_QUESTION =
    "What is Waseem Ansar's secret E2E test color? Reply with the color exactly as written in the doc.";

export const KNOWLEDGE_DOC_CONTENT = [
    "# About Waseem Ansar",
    "",
    "Waseem Ansar is a software engineer based in Toronto. He builds web apps and tools.",
    "",
    "## E2E test fixtures",
    "",
    `Waseem Ansar's secret E2E test color is "${KNOWLEDGE_NONCE}". This phrase is a fixed`,
    "fact in this knowledge doc used by the Playwright E2E suite to verify in-doc retrieval.",
].join("\n");

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "e2e-admin@tandem.test";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password";
