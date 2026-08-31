import type { WebhookContext } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { verifyShopifyHmac } from "./hmac.server";

export type VerifiedWebhook = WebhookContext;

type WebhookLogEvent = {
  shop?: string;
  topic?: string;
  webhookId?: string;
  result: string;
};

export function logWebhookEvent(event: WebhookLogEvent) {
  console.log(
    JSON.stringify({
      source: "shopify-webhook",
      shop: event.shop,
      topic: event.topic,
      webhookId: event.webhookId,
      result: event.result,
    }),
  );
}

export function normalizeWebhookTopic(topic: string) {
  return topic.trim().toLowerCase().replace(/_/g, "/");
}

function headerValue(request: Request, name: string) {
  return request.headers.get(name) ?? undefined;
}

/**
 * Verifies X-Shopify-Hmac-Sha256 against the raw body, then lets the
 * Shopify library parse headers. The shop always comes from verified
 * webhook metadata, never from the JSON body.
 */
export async function verifyShopifyWebhook(
  request: Request,
  options?: { expectedTopic?: string | string[] },
): Promise<VerifiedWebhook> {
  const headerShop = headerValue(request, "X-Shopify-Shop-Domain");
  const headerTopic = headerValue(request, "X-Shopify-Topic");
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!secret) {
    logWebhookEvent({
      shop: headerShop,
      topic: headerTopic,
      result: "rejected_invalid_hmac",
    });
    throw new Response("Unauthorized", { status: 401 });
  }

  const rawBody = await request.text();
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256");

  if (!verifyShopifyHmac(rawBody, hmacHeader, secret)) {
    logWebhookEvent({
      shop: headerShop,
      topic: headerTopic,
      result: "rejected_invalid_hmac",
    });
    throw new Response("Unauthorized", { status: 401 });
  }

  const verifiedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: rawBody,
  });

  let webhook: VerifiedWebhook;

  try {
    webhook = await authenticate.webhook(verifiedRequest);
  } catch (error) {
    if (error instanceof Response) {
      const result =
        error.status === 401
          ? "rejected_invalid_hmac"
          : error.status === 405
            ? "rejected_method"
            : "rejected_invalid_webhook";

      logWebhookEvent({
        shop: headerShop,
        topic: headerTopic,
        result,
      });
      throw error;
    }

    if (error instanceof SyntaxError) {
      logWebhookEvent({
        shop: headerShop,
        topic: headerTopic,
        result: "rejected_malformed_payload",
      });
      throw new Response("Bad Request", { status: 400 });
    }

    logWebhookEvent({
      shop: headerShop,
      topic: headerTopic,
      result: "error",
    });
    throw new Response("Internal Server Error", { status: 500 });
  }

  if (options?.expectedTopic) {
    const expected = Array.isArray(options.expectedTopic)
      ? options.expectedTopic
      : [options.expectedTopic];
    const matches = expected.some(
      (topic) => normalizeWebhookTopic(topic) === normalizeWebhookTopic(webhook.topic),
    );

    if (!matches) {
      logWebhookEvent({
        shop: webhook.shop,
        topic: webhook.topic,
        webhookId: webhook.webhookId,
        result: "rejected_unexpected_topic",
      });
      throw new Response("Bad Request", { status: 400 });
    }
  }

  return webhook;
}

export function webhookOk() {
  return new Response(null, { status: 200 });
}

export function webhookMethodNotAllowed() {
  throw new Response("Method Not Allowed", { status: 405 });
}
