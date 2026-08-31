import { authenticate } from "../shopify.server";
import { verifyShopifyHmac } from "./hmac.server";
import {
  headerValue,
  webhookContextFromSignedHeaders,
  type VerifiedWebhook,
} from "./webhook-context.server";

export type { VerifiedWebhook };
export { webhookContextFromSignedHeaders };

type WebhookLogEvent = {
  shop?: string;
  topic?: string;
  webhookId?: string;
  orderId?: string;
  result: string;
};

export function logWebhookEvent(event: WebhookLogEvent) {
  console.log(
    JSON.stringify({
      source: "shopify-webhook",
      shop: event.shop,
      topic: event.topic,
      webhookId: event.webhookId,
      orderId: event.orderId,
      result: event.result,
    }),
  );
}

export function normalizeWebhookTopic(topic: string) {
  return topic.trim().toLowerCase().replace(/_/g, "/");
}

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

  if (!headerShop || !headerTopic) {
    logWebhookEvent({
      shop: headerShop,
      topic: headerTopic,
      result: "rejected_invalid_webhook",
    });
    throw new Response("Bad Request", { status: 400 });
  }

  const verifiedRequest = new Request(request.url, {
    method: "POST",
    headers: new Headers(request.headers),
    body: rawBody,
  });

  let webhook: VerifiedWebhook;

  try {
    webhook = await authenticate.webhook(verifiedRequest);
  } catch (error) {
    if (error instanceof Response && error.status === 405) {
      logWebhookEvent({
        shop: headerShop,
        topic: headerTopic,
        result: "rejected_method",
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

    try {
      webhook = webhookContextFromSignedHeaders(request, rawBody);
    } catch (fallbackError) {
      if (fallbackError instanceof SyntaxError) {
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
        result: "rejected_invalid_webhook",
      });
      throw new Response("Bad Request", { status: 400 });
    }
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

export function webhookError(status: number, message: string, code: string): never {
  throw new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function webhookMethodNotAllowed() {
  throw new Response("Method Not Allowed", { status: 405 });
}
