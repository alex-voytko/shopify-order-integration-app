import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { ANALYTICS_TAG } from "./order-tags.server";

export class AdminApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminApiError";
  }
}

export async function addAnalyticsProcessedTag(
  admin: AdminApiContext,
  shopifyOrderId: string,
) {
  const response = await admin.graphql(
    `#graphql
      mutation addAnalyticsProcessedTag($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          node {
            ... on Order {
              id
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        id: `gid://shopify/Order/${shopifyOrderId}`,
        tags: [ANALYTICS_TAG],
      },
    },
  );

  if (!response.ok) {
    throw new AdminApiError("Shopify Admin API request failed");
  }

  const json = (await response.json()) as {
    data?: {
      tagsAdd?: {
        userErrors?: { message?: string }[];
      };
    };
    errors?: { message?: string }[];
  };

  if (json.errors?.length) {
    throw new AdminApiError("Shopify Admin API request failed");
  }

  const userErrors = json.data?.tagsAdd?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new AdminApiError("Shopify Admin API rejected the tag update");
  }
}
