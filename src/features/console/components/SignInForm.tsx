"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from "@/components/ui/input-group";
import { resolveSignInRedirect } from "@/features/console/signin-redirect";

export function SignInForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setPending(true);
        const data = new FormData(e.currentTarget);
        const result = await signIn("credentials", {
            email: String(data.get("email") ?? ""),
            password: String(data.get("password") ?? ""),
            redirect: false,
        });
        setPending(false);
        if (!result || result.error) {
            setError("Invalid email or password.");
            return;
        }
        router.push(resolveSignInRedirect(searchParams.get("callbackUrl")));
        router.refresh();
    }

    return (
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
                <label
                    htmlFor="signin-email"
                    className="text-ink-3 font-mono text-[11px] font-medium tracking-[0.18em] uppercase"
                >
                    Email
                </label>
                <InputGroup className="h-12 rounded-xl">
                    <InputGroupAddon align="inline-start">
                        <Mail />
                    </InputGroupAddon>
                    <InputGroupInput
                        id="signin-email"
                        type="email"
                        name="email"
                        autoComplete="email"
                        required
                        placeholder="your.email@example.com"
                    />
                </InputGroup>
            </div>

            <div className="flex flex-col gap-2">
                <label
                    htmlFor="signin-password"
                    className="text-ink-3 font-mono text-[11px] font-medium tracking-[0.18em] uppercase"
                >
                    Password
                </label>
                <InputGroup className="h-12 rounded-xl">
                    <InputGroupAddon align="inline-start">
                        <Lock />
                    </InputGroupAddon>
                    <InputGroupInput
                        id="signin-password"
                        type={showPassword ? "text" : "password"}
                        name="password"
                        autoComplete="current-password"
                        required
                        placeholder="********"
                    />
                    <InputGroupAddon align="inline-end">
                        <InputGroupButton
                            type="button"
                            size="icon-xs"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            aria-pressed={showPassword}
                            onClick={() => setShowPassword((v) => !v)}
                        >
                            {showPassword ? <EyeOff /> : <Eye />}
                        </InputGroupButton>
                    </InputGroupAddon>
                </InputGroup>
            </div>

            {error && (
                <p role="alert" className="text-destructive text-sm">
                    {error}
                </p>
            )}

            <Button
                type="submit"
                disabled={pending}
                className="cta-human mt-2 h-12 rounded-xl text-sm font-semibold"
            >
                {pending ? "Signing in…" : "Sign in"}
                <ArrowRight />
            </Button>
        </form>
    );
}
