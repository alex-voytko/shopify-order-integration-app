import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Shopify signs the raw webhook body with the app secret and sends
 * the digest in X-Shopify-Hmac-Sha256 (base64).
 */
export function verifyShopifyHmac(
  rawBody: string,
  hmacHeader: string | null,
  secret: string,
): boolean {
  if (!hmacHeader || !secret) {
    return false;
  }

  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  const digestBuffer = Buffer.from(digest);
  const headerBuffer = Buffer.from(hmacHeader);

  if (digestBuffer.length !== headerBuffer.length) {
    return false;
  }

  return timingSafeEqual(digestBuffer, headerBuffer);
}
