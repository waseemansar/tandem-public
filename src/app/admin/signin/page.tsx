import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fullName } from "@/config/site";
import { ConsoleBrand } from "@/features/console/components/ConsoleBrand";
import { SignInForm } from "@/features/console/components/SignInForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { resolveSignInRedirect } from "@/features/console/signin-redirect";

export default async function AdminSignIn({
    searchParams,
}: {
    searchParams: Promise<{ callbackUrl?: string }>;
}) {
    const session = await auth();
    const params = await searchParams;
    if (session?.user) redirect(resolveSignInRedirect(params.callbackUrl));

    return (
        <div className="grid min-h-screen place-items-center px-6 py-12">
            <div className="fixed top-6 right-6 z-10">
                <ThemeToggle />
            </div>
            <main className="bg-panel border-line w-full max-w-md rounded-3xl border p-10 shadow-(--shadow)">
                <div className="flex flex-col gap-8">
                    <ConsoleBrand />
                    <div className="flex flex-col gap-3">
                        <h1 className="font-display text-3xl leading-tight">
                            Welcome back, {fullName}.
                        </h1>
                        <p className="text-ink-2 text-sm leading-relaxed">
                            Sign in to triage your twin&apos;s escalations and teach it new answers.
                        </p>
                    </div>
                    <SignInForm />
                </div>
            </main>
        </div>
    );
}
