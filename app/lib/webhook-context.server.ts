import type { WebhookContext } from "@shopify/shopify-app-react-router/server";

export type VerifiedWebhook = WebhookContext;

export function headerValue(request: Request, name: string) {
  return request.headers.get(name) ?? undefined;
}

/**
 * Shop and topic come from HMAC-verified headers, never the JSON body.
 * Used when authenticate.webhook rejects a signed uninstall that is
 * missing optional library headers.
 */
export function webhookContextFromSignedHeaders(
  request: Request,
  rawBody: string,
): VerifiedWebhook {
  const shop = headerValue(request, "X-Shopify-Shop-Domain");
  const topic = headerValue(request, "X-Shopify-Topic");

  if (!shop || !topic) {
    throw new Response("Bad Request", { status: 400 });
  }

  let payload: Record<string, unknown> = {};
  if (rawBody.trim()) {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  }

  return {
    apiVersion: headerValue(request, "X-Shopify-API-Version") ?? "",
    shop,
    topic,
    webhookId: headerValue(request, "X-Shopify-Webhook-Id") ?? "",
    payload,
    webhookType: "webhooks",
    session: undefined,
    admin: undefined,
    subTopic: headerValue(request, "X-Shopify-Sub-Topic"),
    triggeredAt: headerValue(request, "X-Shopify-Triggered-At"),
  };
}
