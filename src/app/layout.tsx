import type { Metadata } from "next";
import { Hanken_Grotesk, Instrument_Serif, Geist_Mono } from "next/font/google";
import { Providers } from "@/app/providers";
import "@/app/globals.css";

const hankenGrotesk = Hanken_Grotesk({
    variable: "--font-hanken",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
});

const instrumentSerif = Instrument_Serif({
    variable: "--font-instrument",
    subsets: ["latin"],
    weight: "400",
    style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

const description = "Ask anything. If the twin can't answer, a human steps in.";

export const metadata: Metadata = {
    metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:3000"),
    title: "Tandem",
    description,
    openGraph: {
        title: "Tandem",
        description,
        siteName: "Tandem",
        type: "website",
        url: "/",
    },
    twitter: {
        card: "summary_large_image",
        title: "Tandem",
        description,
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            suppressHydrationWarning
            className={`${hankenGrotesk.variable} ${instrumentSerif.variable} ${geistMono.variable} h-full antialiased`}
        >
            <body className="flex h-full flex-col">
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
