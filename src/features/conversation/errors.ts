export class ConversationNotFoundError extends Error {
    constructor() {
        super("conversation_not_found");
        this.name = "ConversationNotFoundError";
    }
}

export class ConversationInvalidStateError extends Error {
    constructor(public readonly state: string) {
        super(`conversation_invalid_state:${state}`);
        this.name = "ConversationInvalidStateError";
    }
}

export class SuggestionNotFoundError extends Error {
    constructor() {
        super("suggestion_not_found");
        this.name = "SuggestionNotFoundError";
    }
}

export class SuggestionInvalidStateError extends Error {
    constructor(public readonly status: string) {
        super(`suggestion_invalid_state:${status}`);
        this.name = "SuggestionInvalidStateError";
    }
}
