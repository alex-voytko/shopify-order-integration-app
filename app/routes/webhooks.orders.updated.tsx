import type { ActionFunctionArgs } from "react-router";
import {
  logWebhookEvent,
  verifyShopifyWebhook,
  webhookMethodNotAllowed,
  webhookOk,
} from "../lib/webhooks.server";

export const loader = webhookMethodNotAllowed;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, webhookId } = await verifyShopifyWebhook(request, {
    expectedTopic: "orders/updated",
  });

  logWebhookEvent({
    shop,
    topic,
    webhookId,
    result: "accepted",
  });

  return webhookOk();
};
