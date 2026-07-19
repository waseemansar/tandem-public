import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const noRelativeImports = {
    group: ["./*", "../*"],
    message: "Use the '@/' path alias instead of relative imports.",
};

function boundaryRule(forbidden) {
    return [
        "error",
        {
            patterns: [noRelativeImports, ...forbidden],
        },
    ];
}

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    prettier,
    {
        rules: {
            "no-restricted-imports": ["error", { patterns: [noRelativeImports] }],
        },
    },
    // Module-boundary rules: keep features from importing each other's internals.
    {
        files: ["src/features/visitor/**/*.{ts,tsx}"],
        rules: {
            "no-restricted-imports": boundaryRule([
                {
                    group: ["@/features/twin", "@/features/twin/*"],
                    message:
                        "features/visitor/ cannot import from features/twin/ (sibling feature).",
                },
                {
                    group: ["@/features/console", "@/features/console/*"],
                    message:
                        "features/visitor/ cannot import from features/console/ (sibling feature).",
                },
                {
                    group: ["@/app", "@/app/*"],
                    message: "Nothing imports from app/ — it is the top of the graph.",
                },
            ]),
        },
    },
    {
        files: ["src/features/console/**/*.{ts,tsx}"],
        rules: {
            "no-restricted-imports": boundaryRule([
                {
                    group: ["@/features/twin", "@/features/twin/*"],
                    message:
                        "features/console/ cannot import from features/twin/ (sibling feature).",
                },
                {
                    group: ["@/features/visitor", "@/features/visitor/*"],
                    message:
                        "features/console/ cannot import from features/visitor/ (sibling feature).",
                },
                {
                    group: ["@/app", "@/app/*"],
                    message: "Nothing imports from app/ — it is the top of the graph.",
                },
            ]),
        },
    },
    {
        files: ["src/features/twin/**/*.{ts,tsx}"],
        rules: {
            "no-restricted-imports": boundaryRule([
                {
                    group: ["@/features/visitor", "@/features/visitor/*"],
                    message:
                        "features/twin/ cannot import from features/visitor/ (sibling feature).",
                },
                {
                    group: ["@/features/console", "@/features/console/*"],
                    message:
                        "features/twin/ cannot import from features/console/ (sibling feature).",
                },
                {
                    group: ["@/features/conversation", "@/features/conversation/*"],
                    message:
                        "features/twin/ cannot import from features/conversation/ — the Twin is a leaf the orchestrator drives, not a peer.",
                },
                {
                    group: ["@/components", "@/components/*"],
                    message: "features/twin/ has no UI — it cannot import from components/.",
                },
                {
                    group: ["@/hooks", "@/hooks/*"],
                    message: "features/twin/ has no UI — it cannot import from hooks/.",
                },
                {
                    group: ["@/app", "@/app/*"],
                    message: "Nothing imports from app/ — it is the top of the graph.",
                },
            ]),
        },
    },
    {
        files: ["src/features/conversation/**/*.{ts,tsx}"],
        rules: {
            "no-restricted-imports": boundaryRule([
                {
                    group: ["@/features/visitor", "@/features/visitor/*"],
                    message: "features/conversation/ cannot import from features/visitor/.",
                },
                {
                    group: ["@/features/console", "@/features/console/*"],
                    message: "features/conversation/ cannot import from features/console/.",
                },
                {
                    group: ["@/components", "@/components/*"],
                    message:
                        "features/conversation/ has no UI — it cannot import from components/.",
                },
                {
                    group: ["@/hooks", "@/hooks/*"],
                    message: "features/conversation/ has no UI — it cannot import from hooks/.",
                },
                {
                    group: ["@/app", "@/app/*"],
                    message: "Nothing imports from app/ — it is the top of the graph.",
                },
            ]),
        },
    },
    {
        files: ["src/shared/**/*.{ts,tsx}"],
        rules: {
            "no-restricted-imports": boundaryRule([
                {
                    group: ["@/features", "@/features/*"],
                    message:
                        "shared/ cannot import from features/ — the arrow points the other way.",
                },
                {
                    group: ["@/components", "@/components/*"],
                    message: "shared/ cannot import from components/.",
                },
                {
                    group: ["@/app", "@/app/*"],
                    message: "Nothing imports from app/ — it is the top of the graph.",
                },
            ]),
        },
    },
    {
        files: ["src/components/**/*.{ts,tsx}"],
        // shadcn owns src/components/ui/; its generated imports do not follow these rules.
        ignores: ["src/components/ui/**"],
        rules: {
            "no-restricted-imports": boundaryRule([
                {
                    group: ["@/features", "@/features/*"],
                    message: "components/ cannot import from features/.",
                },
                {
                    group: ["@/db", "@/db/*"],
                    message: "components/ has no data access — it cannot import from db/.",
                },
                {
                    group: ["@/hooks", "@/hooks/*"],
                    message: "components/ cannot import from hooks/.",
                },
                {
                    group: ["@/app", "@/app/*"],
                    message: "Nothing imports from app/ — it is the top of the graph.",
                },
            ]),
        },
    },
    // Override default ignores of eslint-config-next.
    globalIgnores([
        // Default ignores of eslint-config-next:
        ".next/**",
        "out/**",
        "build/**",
        "next-env.d.ts",
        "src/db/migrations/**",
        "design-system/**",
        // Verbatim design source-of-truth (prototype JSX/CSS) — not app code.
        "docs/design/**",
    ]),
]);

export default eslintConfig;
