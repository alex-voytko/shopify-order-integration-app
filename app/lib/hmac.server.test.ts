import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyShopifyHmac } from "./hmac.server";

const SECRET = "test-app-secret";
const BODY = JSON.stringify({ id: 1001, email: "john@example.com" });

function sign(body: string, secret = SECRET) {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

describe("verifyShopifyHmac", () => {
  it("accepts a valid X-Shopify-Hmac-Sha256 digest of the raw body", () => {
    expect(verifyShopifyHmac(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    expect(verifyShopifyHmac(BODY, sign("other-body"), SECRET)).toBe(false);
  });

  it("rejects a missing header or secret", () => {
    expect(verifyShopifyHmac(BODY, null, SECRET)).toBe(false);
    expect(verifyShopifyHmac(BODY, sign(BODY), "")).toBe(false);
  });
});
