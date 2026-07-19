import { render } from "@react-email/render";
import { fullName } from "@/config/site";
import { MagicLinkEmail, type MagicLinkEmailProps } from "@/shared/email/templates/MagicLinkEmail";

export type BuiltMagicLinkEmail = {
    subject: string;
    text: string;
    html: string;
};

export async function buildMagicLinkEmail(
    props: MagicLinkEmailProps,
): Promise<BuiltMagicLinkEmail> {
    const node = MagicLinkEmail(props);
    const [html, text] = await Promise.all([render(node), render(node, { plainText: true })]);
    return {
        subject: `${fullName} replied on Tandem`,
        text,
        html,
    };
}
