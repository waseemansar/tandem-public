import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton({ className }: { className?: string }) {
    return (
        <form
            action={async () => {
                "use server";
                await signOut({ redirectTo: "/admin/signin" });
            }}
        >
            <Button type="submit" variant="outline" size="sm" className={className}>
                Sign out
            </Button>
        </form>
    );
}
