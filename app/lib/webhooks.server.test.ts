import { describe, expect, it } from "vitest";
import { webhookContextFromSignedHeaders } from "./webhook-context.server";

describe("webhookContextFromSignedHeaders", () => {
  it("builds context from signed Shopify headers, not the JSON body shop", () => {
    const request = new Request("https://example.test/webhooks/app/uninstalled", {
      method: "POST",
      headers: {
        "X-Shopify-Shop-Domain": "my-awesome-all-in-app.myshopify.com",
        "X-Shopify-Topic": "app/uninstalled",
        "X-Shopify-Webhook-Id": "hook-1",
        "X-Shopify-API-Version": "2026-10",
        "X-Shopify-Triggered-At": "2026-08-31T20:22:20Z",
      },
      body: JSON.stringify({ myshopify_domain: "other-store.myshopify.com" }),
    });

    const webhook = webhookContextFromSignedHeaders(
      request,
      JSON.stringify({ myshopify_domain: "other-store.myshopify.com" }),
    );

    expect(webhook.shop).toBe("my-awesome-all-in-app.myshopify.com");
    expect(webhook.topic).toBe("app/uninstalled");
    expect(webhook.webhookId).toBe("hook-1");
    expect(webhook.triggeredAt).toBe("2026-08-31T20:22:20Z");
    expect(webhook.admin).toBeUndefined();
  });

  it("rejects when shop or topic headers are missing", () => {
    const request = new Request("https://example.test/webhooks/app/uninstalled", {
      method: "POST",
      body: "{}",
    });

    expect(() => webhookContextFromSignedHeaders(request, "{}")).toThrow(Response);
  });
});
