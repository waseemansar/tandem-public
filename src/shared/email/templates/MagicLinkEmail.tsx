import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Link,
    Preview,
    Section,
    Text,
} from "@react-email/components";
import { firstName, fullName, pronouns } from "@/config/site";

export type MagicLinkEmailProps = {
    url: string;
    visitorFirstName?: string;
};

// Tandem light-theme tokens (see src/app/globals.css :root). Solid colors only —
// no gradients, no webfonts — for cross-client reliability (Gmail, Outlook,
// Apple Mail, etc.).
const BG = "#f4f8f4"; // panel-2 — subtle forest tint
const CARD = "#ffffff";
const INK = "#14201a";
const INK_2 = "#47584f";
const INK_3 = "#72857a";
const LINE = "#e3ebe4";
const TWIN = "#0e9b71"; // emerald — for the eyebrow accent
const HUMAN = "#ad7a14"; // gold — CTA, "reach the human"

const SERIF = 'Georgia, "Times New Roman", Times, serif';
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const body: React.CSSProperties = {
    backgroundColor: BG,
    color: INK,
    fontFamily: SANS,
    margin: 0,
    padding: "32px 0",
};

const container: React.CSSProperties = {
    maxWidth: 560,
    margin: "0 auto",
    padding: "0 20px",
};

const brandHeader: React.CSSProperties = {
    padding: "0 4px 20px",
};

const wordmark: React.CSSProperties = {
    fontFamily: SERIF,
    fontSize: 24,
    fontWeight: 400,
    letterSpacing: "-0.01em",
    color: INK,
    margin: 0,
    lineHeight: 1.2,
};

const wordmarkSub: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: "0.2em",
    color: INK_3,
    textTransform: "uppercase",
    margin: "4px 0 0",
    fontFamily: SANS,
};

const card: React.CSSProperties = {
    backgroundColor: CARD,
    borderRadius: 12,
    border: `1px solid ${LINE}`,
    padding: "32px 28px",
};

const eyebrow: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: "0.22em",
    color: TWIN,
    textTransform: "uppercase",
    margin: "0 0 10px",
    fontWeight: 700,
    fontFamily: SANS,
};

const heading: React.CSSProperties = {
    fontFamily: SERIF,
    fontSize: 26,
    fontWeight: 400,
    lineHeight: 1.25,
    color: INK,
    margin: "0 0 18px",
};

const paragraph: React.CSSProperties = {
    fontSize: 15,
    lineHeight: 1.6,
    color: INK,
    margin: "0 0 14px",
};

const paragraphMuted: React.CSSProperties = {
    fontSize: 15,
    lineHeight: 1.6,
    color: INK_2,
    margin: "0 0 14px",
};

const buttonWrap: React.CSSProperties = {
    margin: "26px 0 6px",
};

const button: React.CSSProperties = {
    backgroundColor: HUMAN,
    color: "#ffffff",
    padding: "13px 26px",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    textDecoration: "none",
    display: "inline-block",
};

const fallback: React.CSSProperties = {
    fontSize: 13,
    color: INK_3,
    margin: "22px 0 0",
    wordBreak: "break-all",
    lineHeight: 1.5,
};

const fallbackLink: React.CSSProperties = {
    color: INK_2,
    textDecoration: "underline",
};

const hr: React.CSSProperties = {
    borderColor: LINE,
    margin: "28px 0 18px",
};

const footer: React.CSSProperties = {
    fontSize: 12,
    color: INK_3,
    lineHeight: 1.55,
    margin: 0,
    padding: "0 4px",
};

export function MagicLinkEmail({ url, visitorFirstName }: MagicLinkEmailProps) {
    const greeting = visitorFirstName ? `Hi ${visitorFirstName},` : "Hi there,";

    return (
        <Html>
            <Head>
                <meta name="color-scheme" content="light only" />
                <meta name="supported-color-schemes" content="light" />
            </Head>
            <Preview>{fullName} replied — open your conversation on Tandem</Preview>
            <Body style={body}>
                <Container style={container}>
                    <Section style={brandHeader}>
                        <Heading as="h1" style={wordmark}>
                            Tandem
                        </Heading>
                        <Text style={wordmarkSub}>Digital twin of {fullName}</Text>
                    </Section>

                    <Section style={card}>
                        <Text style={eyebrow}>New reply</Text>
                        <Heading as="h2" style={heading}>
                            {fullName} replied
                        </Heading>

                        <Text style={paragraph}>{greeting}</Text>
                        <Text style={paragraphMuted}>
                            {firstName} just replied in your conversation on Tandem. Open the thread
                            to read {pronouns.possessive} message and continue the chat — on any
                            device.
                        </Text>

                        <Section style={buttonWrap}>
                            <Button href={url} style={button}>
                                Open conversation
                            </Button>
                        </Section>

                        <Text style={fallback}>
                            Or paste this link into your browser:
                            <br />
                            <Link href={url} style={fallbackLink}>
                                {url}
                            </Link>
                        </Text>

                        <Hr style={hr} />
                        <Text
                            style={{
                                ...paragraphMuted,
                                fontSize: 13,
                                margin: 0,
                                color: INK_3,
                            }}
                        >
                            This link is unique to your conversation and expires in 30 days. It
                            rebinds your browser to the same thread — clicking it on a new device
                            picks up right where you left off.
                        </Text>
                    </Section>

                    <Text style={{ ...footer, margin: "20px 0 0" }}>Tandem · Digital twin</Text>
                </Container>
            </Body>
        </Html>
    );
}

MagicLinkEmail.PreviewProps = {
    url: "http://localhost:3000/r/preview.token.here",
    visitorFirstName: "Priya",
} satisfies MagicLinkEmailProps;

export default MagicLinkEmail;
