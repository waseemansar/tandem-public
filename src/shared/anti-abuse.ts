// Visitor message length ceiling.
// Counting unit is String.prototype.length (UTF-16 code units) — deliberate,
// so the Zod .max() check on the server and the counter on the client
// cannot disagree about how long a draft is.
export const VISITOR_MESSAGE_MAX_CHARS = 10000;

// 80% threshold drives the soft-counter visibility band on the composer.
export const VISITOR_MESSAGE_SOFT_WARN_CHARS = Math.floor(VISITOR_MESSAGE_MAX_CHARS * 0.8);

// A coarse backstop on the auth-gated admin reply path.
// The abuse calculus behind the visitor ceiling doesn't apply here, so this is
// only a safety net against a runaway clipboard paste — no composer counter UX.
export const ADMIN_MESSAGE_MAX_CHARS = 50000;
