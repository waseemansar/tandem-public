export interface Clock {
    now(): Date;
}

let _clock: Clock = { now: () => new Date() };

export function getClock(): Clock {
    return _clock;
}

export function setClock(c: Clock): void {
    _clock = c;
}

export function resetClock(): void {
    _clock = { now: () => new Date() };
}
