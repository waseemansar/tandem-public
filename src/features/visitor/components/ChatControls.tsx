"use client";

import { RotateCcw, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/shared/utils";

export type ChatControlsProps = {
    firstName: string;
    onFirstNameChange: (value: string) => void;
    keepChat: boolean;
    onKeepChatChange: (value: boolean) => void;
    onReset: () => void;
    isResetting: boolean;
};

export function ChatControls({
    firstName,
    onFirstNameChange,
    keepChat,
    onKeepChatChange,
    onReset,
    isResetting,
    className,
}: ChatControlsProps & { className?: string }) {
    return (
        <div className={cn("flex items-center gap-2 sm:gap-3", className)}>
            <div className="relative flex-1 md:flex-none">
                <User className="text-ink-3 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                    aria-label="Your name or initials"
                    value={firstName}
                    onChange={(e) => onFirstNameChange(e.target.value)}
                    placeholder="Your name / initials"
                    className="bg-panel h-8 w-full pl-9 text-sm md:h-9 md:w-48"
                    maxLength={80}
                />
            </div>

            <label className="text-ink-2 flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap">
                <Switch checked={keepChat} onCheckedChange={onKeepChatChange} />
                <span>Keep chat</span>
            </label>

            <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
                disabled={isResetting}
                aria-label="Reset chat"
            >
                <RotateCcw />
                <span>Reset</span>
            </Button>
        </div>
    );
}
