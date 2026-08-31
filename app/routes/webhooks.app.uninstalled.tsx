import type { ActionFunctionArgs } from "react-router";
import { invalidateShopAccess } from "../models/shop.server";
import {
  logWebhookEvent,
  verifyShopifyWebhook,
  webhookMethodNotAllowed,
  webhookOk,
} from "../lib/webhooks.server";

export const loader = webhookMethodNotAllowed;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, webhookId, triggeredAt } = await verifyShopifyWebhook(
    request,
    { expectedTopic: "app/uninstalled" },
  );

  try {
    // Sessions and tokens are removed. Order history is kept for reinstalls.
    const result = await invalidateShopAccess(shop, { triggeredAt });
    logWebhookEvent({
      shop,
      topic,
      webhookId,
      result,
    });
    return webhookOk();
  } catch {
    logWebhookEvent({
      shop,
      topic,
      webhookId,
      result: "error",
    });
    throw new Response("Uninstall processing failed", { status: 500 });
  }
};
