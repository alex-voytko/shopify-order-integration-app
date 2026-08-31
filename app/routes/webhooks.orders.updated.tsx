import type { ActionFunctionArgs } from "react-router";
import { OrderFieldError } from "../lib/money.server";
import { validateOrderPayload } from "../lib/order-payload.server";
import { AdminApiError } from "../lib/shopify-order-tag.server";
import {
  logWebhookEvent,
  verifyShopifyWebhook,
  webhookError,
  webhookMethodNotAllowed,
  webhookOk,
} from "../lib/webhooks.server";
import { applyOrderUpdate } from "../models/order.server";

export const loader = webhookMethodNotAllowed;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, webhookId, payload, admin } = await verifyShopifyWebhook(
    request,
    { expectedTopic: "orders/updated" },
  );

  let orderId: string | undefined;

  try {
    const order = validateOrderPayload(payload);
    orderId = order.shopifyOrderId;

    const { result, tag } = await applyOrderUpdate(shop, order, admin);
    logWebhookEvent({
      shop,
      topic,
      webhookId,
      orderId,
      result: `${result}:${tag}`,
    });

    return webhookOk();
  } catch (error) {
    if (error instanceof OrderFieldError) {
      logWebhookEvent({
        shop,
        topic,
        webhookId,
        orderId: error.orderId ?? orderId,
        result: error.code,
      });
      webhookError(error.status, error.message, error.code);
    }

    if (error instanceof AdminApiError) {
      logWebhookEvent({
        shop,
        topic,
        webhookId,
        orderId,
        result: "admin_api_error",
      });
      webhookError(502, "Failed to tag the Shopify order", "admin_api_error");
    }

    if (error instanceof Response) {
      throw error;
    }

    logWebhookEvent({
      shop,
      topic,
      webhookId,
      orderId,
      result: "error",
    });
    webhookError(500, "Failed to store order update", "database_error");
  }
};
