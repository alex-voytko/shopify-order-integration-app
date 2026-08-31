import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import {
  logWebhookEvent,
  verifyShopifyWebhook,
  webhookMethodNotAllowed,
  webhookOk,
} from "../lib/webhooks.server";

export const loader = webhookMethodNotAllowed;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop, webhookId } =
    await verifyShopifyWebhook(request, {
      expectedTopic: "app/scopes_update",
    });

  const current = payload.current as string[] | undefined;

  if (session && current) {
    await db.session.update({
      where: { id: session.id },
      data: { scope: current.toString() },
    });
  }

  logWebhookEvent({
    shop,
    topic,
    webhookId,
    result: "scopes_updated",
  });

  return webhookOk();
};
