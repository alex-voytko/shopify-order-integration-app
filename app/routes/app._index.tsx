import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { formatDateTime, formatMoneyAmount } from "../lib/format";
import type { OrderApiItem } from "../lib/order-api";
import {
  getLatestOrderProcessedAt,
  getShopAnalytics,
  listOrdersForShop,
} from "../models/order.server";
import { requireInstalledShop } from "../models/shop.server";
import { authenticate } from "../shopify.server";

const PAGE_SIZE = 25;
const REGISTERED_WEBHOOKS = [
  "orders/create",
  "orders/updated",
  "app/uninstalled",
] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireInstalledShop(session.shop);

  const url = new URL(request.url);
  const offsetRaw = url.searchParams.get("offset");
  const parsedOffset = offsetRaw == null ? 0 : Number.parseInt(offsetRaw, 10);
  const offset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

  const [analytics, orderPage, lastProcessedAt] = await Promise.all([
    getShopAnalytics(session.shop),
    listOrdersForShop(session.shop, { limit: PAGE_SIZE, offset }),
    getLatestOrderProcessedAt(session.shop),
  ]);

  return {
    shopDomain: shop.shopDomain,
    connection: {
      installed: shop.isInstalled,
      webhooks: REGISTERED_WEBHOOKS,
      lastProcessedAt: lastProcessedAt?.toISOString() ?? null,
    },
    analytics: {
      totalOrders: analytics.totalOrders,
      totalRevenue: analytics.totalRevenue.toFixed(2),
      topSku: analytics.topSku,
    },
    orders: orderPage.orders,
    pagination: {
      limit: PAGE_SIZE,
      offset,
      total: orderPage.total,
    },
  };
};

export default function Dashboard() {
  const { shopDomain, connection, analytics, orders, pagination } =
    useLoaderData<typeof loader>();
  const hasPrevious = pagination.offset > 0;
  const hasNext = pagination.offset + pagination.limit < pagination.total;
  const previousOffset = Math.max(pagination.offset - pagination.limit, 0);
  const nextOffset = pagination.offset + pagination.limit;

  return (
    <s-page heading="Order analytics" inlineSize="large">
      <s-section heading="Overview">
        <s-paragraph>
          Metrics for <s-text type="strong">{shopDomain}</s-text>. Data comes
          from verified Shopify webhooks for this store only.
        </s-paragraph>
        <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
          <MetricCard label="Total orders" value={String(analytics.totalOrders)} />
          <MetricCard
            label="Total revenue"
            value={formatMoneyAmount(analytics.totalRevenue)}
          />
          <MetricCard label="Top-selling SKU" value={analytics.topSku ?? "—"} />
          <MetricCard
            label="Connection"
            value={connection.installed ? "Connected" : "Disconnected"}
          />
        </s-grid>
      </s-section>

      <s-section heading="Webhook status">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base">
            <s-badge tone={connection.installed ? "success" : "critical"}>
              {connection.installed ? "App installed" : "App not installed"}
            </s-badge>
            {connection.webhooks.map((topic) => (
              <s-badge key={topic} tone="info">
                {topic}
              </s-badge>
            ))}
          </s-stack>
          <s-paragraph>
            Last webhook processed:{" "}
            {formatDateTime(connection.lastProcessedAt)}
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Recent orders" padding="none">
        {orders.length === 0 ? (
          <s-box padding="base">
            <s-paragraph>
              No orders received yet. Create an order in this store to see it
              here after the webhook is processed.
            </s-paragraph>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Order ID</s-table-header>
              <s-table-header listSlot="secondary">Customer email</s-table-header>
              <s-table-header listSlot="labeled" format="currency">
                Total price
              </s-table-header>
              <s-table-header listSlot="labeled">Currency</s-table-header>
              <s-table-header listSlot="labeled" format="numeric">
                Items
              </s-table-header>
              <s-table-header listSlot="inline">Tags</s-table-header>
              <s-table-header listSlot="labeled">Created</s-table-header>
              <s-table-header listSlot="labeled">Updated</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {orders.map((order: OrderApiItem) => (
                <s-table-row key={order.order_id}>
                  <s-table-cell>{order.order_id}</s-table-cell>
                  <s-table-cell>{order.customer_email ?? "—"}</s-table-cell>
                  <s-table-cell>
                    {formatMoneyAmount(order.total_price)}
                  </s-table-cell>
                  <s-table-cell>{order.currency}</s-table-cell>
                  <s-table-cell>{order.items_count}</s-table-cell>
                  <s-table-cell>
                    {order.tags.length === 0 ? (
                      "—"
                    ) : (
                      <s-stack direction="inline" gap="small">
                        {order.tags.map((tag: string) => (
                          <s-badge
                            key={tag}
                            tone={
                              tag === "analytics-processed" ? "success" : "neutral"
                            }
                          >
                            {tag}
                          </s-badge>
                        ))}
                      </s-stack>
                    )}
                  </s-table-cell>
                  <s-table-cell>{formatDateTime(order.created_at)}</s-table-cell>
                  <s-table-cell>{formatDateTime(order.updated_at)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {pagination.total > pagination.limit ? (
        <s-section>
          <s-stack direction="inline" gap="base">
            {hasPrevious ? (
              <s-link href={`/app?offset=${previousOffset}`}>Previous</s-link>
            ) : null}
            <s-text>
              Showing {pagination.offset + 1}–
              {Math.min(pagination.offset + orders.length, pagination.total)} of{" "}
              {pagination.total}
            </s-text>
            {hasNext ? (
              <s-link href={`/app?offset=${nextOffset}`}>Next</s-link>
            ) : null}
          </s-stack>
        </s-section>
      ) : null}
    </s-page>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <s-grid-item>
      <s-box
        padding="base"
        background="base"
        borderWidth="base"
        borderColor="base"
        borderRadius="base"
      >
        <s-heading>{label}</s-heading>
        <s-text type="strong">{value}</s-text>
      </s-box>
    </s-grid-item>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
