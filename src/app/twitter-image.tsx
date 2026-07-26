// Twitter/X uses the same card as Open Graph. Re-export so Next emits
// twitter:image alongside og:image.
export { alt, size, contentType, default } from "@/app/opengraph-image";
