import { ImageResponse } from "next/og";
import { fullName } from "@/config/site";

// Dynamically generated social share card. Brand-forward and driven by the same
// site config as the app, so every template fork gets a correct card without
// editing a static image.

export const alt = "Tandem — chat with a digital twin";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Dark-first palette, mirroring the app's dark theme tokens in globals.css.
const BG = "#0b130f";
const BG_GRADIENT = "radial-gradient(120% 90% at 50% -10%, #142a1f 0%, #0b130f 55%, #070d0a 100%)";
const INK = "#eaf3ed";
const INK_2 = "#a8c0b3";
const INK_3 = "#6f877a";
const TWIN = "#4fd0a4";
const HUMAN = "#e6b455";

// Satori (the engine behind ImageResponse) can't reuse the next/font objects, so
// fetch the raw TTF binaries. The legacy User-Agent makes Google Fonts serve TTF
// (truetype) rather than woff2, which Satori parses reliably.
async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer> {
    const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}`;
    const css = await (
        await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; MSIE 9.0)" } })
    ).text();
    const resource = css.match(/src: url\((.+?)\) format\(/);
    if (!resource) throw new Error(`Could not extract font URL for ${family}`);
    const res = await fetch(resource[1]);
    if (!res.ok) throw new Error(`Failed to download font ${family}`);
    return res.arrayBuffer();
}

export default async function Image() {
    // Fonts are best-effort: if the fetch fails, the card still renders with
    // Satori's default font rather than throwing and breaking the unfurl.
    let fonts: { name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" }[] = [];
    try {
        const [instrument, hanken400, hanken600] = await Promise.all([
            loadGoogleFont("Instrument Serif", 400),
            loadGoogleFont("Hanken Grotesk", 400),
            loadGoogleFont("Hanken Grotesk", 600),
        ]);
        fonts = [
            { name: "Instrument Serif", data: instrument, weight: 400, style: "normal" },
            { name: "Hanken Grotesk", data: hanken400, weight: 400, style: "normal" },
            { name: "Hanken Grotesk", data: hanken600, weight: 600, style: "normal" },
        ];
    } catch {
        fonts = [];
    }

    return new ImageResponse(
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: "96px",
                backgroundColor: BG,
                backgroundImage: BG_GRADIENT,
                fontFamily: "Hanken Grotesk",
            }}
        >
            {/* Brand mark: gradient badge with the linked-rings glyph */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "104px",
                    height: "104px",
                    borderRadius: "28px",
                    backgroundImage: `linear-gradient(150deg, ${TWIN}, ${HUMAN})`,
                }}
            >
                <div style={{ display: "flex", alignItems: "center" }}>
                    <div
                        style={{
                            width: "30px",
                            height: "30px",
                            borderRadius: "999px",
                            border: "4px solid rgba(255,255,255,0.94)",
                        }}
                    />
                    <div
                        style={{
                            width: "30px",
                            height: "30px",
                            borderRadius: "999px",
                            border: "4px solid rgba(255,255,255,0.94)",
                            marginLeft: "-12px",
                        }}
                    />
                </div>
            </div>

            {/* Wordmark */}
            <div
                style={{
                    display: "flex",
                    marginTop: "40px",
                    fontFamily: "Instrument Serif",
                    fontSize: "132px",
                    lineHeight: 1,
                    color: INK,
                }}
            >
                Tandem
            </div>

            {/* Subline — mirrors the in-app Brand lockup */}
            <div
                style={{
                    display: "flex",
                    marginTop: "28px",
                    fontFamily: "Hanken Grotesk",
                    fontWeight: 600,
                    fontSize: "26px",
                    letterSpacing: "6px",
                    textTransform: "uppercase",
                    color: INK_3,
                }}
            >
                {`${fullName} · Digital Twin`}
            </div>

            {/* Tagline — PRD trust frame, template-safe */}
            <div
                style={{
                    display: "flex",
                    marginTop: "44px",
                    fontFamily: "Hanken Grotesk",
                    fontWeight: 400,
                    fontSize: "38px",
                    lineHeight: 1.3,
                    color: INK_2,
                    maxWidth: "860px",
                }}
            >
                Ask anything. If the twin can&rsquo;t answer, a human steps in.
            </div>
        </div>,
        { ...size, fonts: fonts.length ? fonts : undefined },
    );
}
