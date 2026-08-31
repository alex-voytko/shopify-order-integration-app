# Shopify Order Integration App

Embedded Shopify app that receives order webhooks, stores them per store, and shows basic analytics in the Shopify Admin.

**Stack:** Node.js, Shopify CLI (React Router template), Prisma, SQLite, App Bridge, Polaris web components.

---

## What it does

- Installs on one or more development stores with Shopify OAuth
- Stores sessions and access tokens in the database (never on the frontend)
- Handles `orders/create`, `orders/updated`, and `app/uninstalled`
- Isolates every query by the verified shop domain
- Shows totals, top SKU, webhook status, and recent orders in an embedded dashboard

---



## Prerequisites

- Node.js 20.19+ or 22.12+
- npm
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started)
- A Shopify Partner / Dev Dashboard account
- A [development store](https://shopify.dev/docs/apps/tools/development-stores)

---



## Setup

```bash
npm install
cp .env.example .env
npm run setup
```

`npm run setup` generates the Prisma client and applies SQLite migrations.

`DATABASE_URL=file:dev.sqlite` is relative to `prisma/`. The SQLite file is gitignored.

`npm run dev` (`shopify app dev`) creates or links the app and writes `SHOPIFY_*` into `.env`. Do not commit `.env`, tokens, or real customer data.

```bash
npm run dev          # shopify app dev
npm test             # HMAC, validation, tag helpers
npm run typecheck
```

---



## Shopify application configuration

Configured in `shopify.app.toml`. CLI syncs webhooks on `shopify app dev` / `shopify app deploy`. Do not register them in the Admin UI.


| Setting | Value                                                |
| ------- | ---------------------------------------------------- |
| Scopes  | `read_orders,write_orders`                           |
| Topics  | `orders/create`, `orders/updated`, `app/uninstalled` |


`read_orders` is required for order webhooks. `write_orders` is required to add `analytics-processed`.

**Protected customer data** is required before `shopify app deploy` (order webhooks include email). In Dev Dashboard: set a Custom/development distribution → API access → Protected customer data → enable data + **Email** → Save. App Store review is not needed for a development store.

---

## Run locally and install

```bash
npm run dev
```

If you are not logged in, the CLI prompts for Shopify auth. The first time, create or link an app and pick a development store. Press `p`, then **Install app**. After that, open the app from Admin → **Apps**.

After install a `Shop` row and an offline `Session` (access token) are stored. The dashboard is `/app`. Each store’s rows are isolated by shop domain; install on another development store the same way.

Shopify needs a public **HTTPS** URL for OAuth, the embedded Admin, and webhooks. `shopify app dev` usually opens a Cloudflare tunnel for that. If that tunnel fails (it often does from some networks), install a separate HTTPS tunnel tool and point it at local port `3000` — for example [ngrok](https://ngrok.com/) (`ngrok http 3000`) or another provider. Then tell the CLI about that URL. `:443` is the public HTTPS port of the tunnel, not your local port:

```bash
npm run dev -- --tunnel-url=https://YOUR-TUNNEL-HOST.example:443
```

Do not put a temporary tunnel URL into `application_url` and `shopify app deploy`. The CLI should own the tunnel via `--tunnel-url` so it stays in sync when the host changes.

---

## Embedded dashboard

Admin → **Apps** → this app (keep `npm run dev` running).

- Overview: order count, revenue, top SKU, connection status
- Webhook status
- Recent orders table (id, email, total, currency, items, tags, dates)

Auth is `authenticate.admin`. The shop comes from the session only.

Protected JSON APIs (same auth): `GET /api/orders?limit=50&offset=0`, `GET /api/analytics`. Unauthenticated → `401`. Uninstalled shop → `403`. Tokens are never sent to the browser.

---



## How to verify (after install)

Keep the tunnel running. Refresh the dashboard after each step.

**`orders/create`.** Create an order in Admin. Terminal log `result` is `created` (or `created_from_update` if `updated` arrived first). Refresh: one row, totals +1. A repeated delivery of the same `shop + order_id` logs `duplicate` and does not change revenue.

**`orders/updated`.** Edit the order. Log `updated:added` or `updated:already_present`. The Shopify order gets tag `analytics-processed`. Still one database row.

**Tag loop.** Adding the tag fires another `orders/updated`. The echo already contains the tag → no second Admin `tagsAdd` (`updated:already_present`). Decision is in the database (`tags`, `analyticsTagAppliedAt`), not memory.

**Uninstall.** Remove the app in Admin. HMAC is verified, sessions are deleted, `isInstalled=false`. **Orders are kept.** Reinstall shows the same history. Dashboard access is blocked (`403`) until install.

Invalid HMAC → `401`. Bad prices/quantities → `400`.

---



## Authentication and webhook verification

**Admin / dashboard.** Embedded App Bridge session token. Backend `authenticate.admin(request)` verifies it and loads the offline session. Shop is always `session.shop`. Query params and bodies are ignored.

**Webhooks.** Raw body + `X-Shopify-Hmac-Sha256` (`SHOPIFY_API_SECRET`, HMAC-SHA256, base64, timing-safe). Invalid signature → `401`. Shop comes from `X-Shopify-Shop-Domain`, never from the JSON body.

Logs: shop, topic, order id, result. No tokens, secrets, or full customer payloads.

---



## Duplicate-order handling

Unique index: **`shopDomain + shopifyOrderId`**.

A repeated `orders/create` returns `200`, does not insert another row, and does not change totals or SKU quantities. A delayed create after `orders/updated` does not overwrite the newer stored state.

---

## Webhook loop-prevention strategy

Add `analytics-processed` once; survive restarts and multiple instances.

1. Incoming tags already include the tag → skip Admin API (echo of our own write).
2. Stored tags or `analyticsTagAppliedAt` already set → skip Admin API.
3. Otherwise `tagsAdd` once, then persist the tag and timestamp.

Stale incoming `updated_at` does not overwrite newer totals or line items.

If `orders/updated` arrives before `orders/create`, the app **creates** the order from the update (`created_from_update`) and then tags it. Still one row per `shop + order_id`.

Trade-off: two concurrent first updates could call `tagsAdd` twice. The mutation is idempotent and does not loop. A crash before `tagsAdd` can retry on the next webhook.

---

## Assumptions and trade-offs

- **Uninstall keeps orders.** Sessions and tokens go; history stays for reinstall.
- **Missing email** → `null`. Empty **SKU** → `""` and ignored for `top_sku`.
- **Prices** are `Decimal` in the database. JSON APIs expose numbers at the response boundary.
- **SQLite** for local/demo. One process is enough. Production: Postgres + `DATABASE_URL`.
- **`shopify app webhook trigger`** uses a fake shop; tagging may be `skipped_no_admin`. Prefer a real Admin order.
- **Dashboard** reads the DB in the route loader (same isolation as `/api/*`).
- A delayed `app/uninstalled` retry after reinstall is ignored if `installedAt` is newer than the webhook trigger time.

---

## Environment variables

See `.env.example`. `shopify app dev` fills the Shopify values.

| Variable | Purpose |
| --- | --- |
| `SHOPIFY_API_KEY` | App client ID |
| `SHOPIFY_API_SECRET` | OAuth and webhook HMAC |
| `SHOPIFY_APP_URL` | Public HTTPS URL |
| `SCOPES` | Must match `shopify.app.toml` |
| `DATABASE_URL` | Prisma URL |
| `SHOP_CUSTOM_DOMAIN` | Optional; Plus custom domains |

---

## Project layout

```
app/
  lib/           HMAC, money, payload validation, webhook helpers
  models/        Shop and order persistence
  routes/        Embedded UI, /api/*, webhook handlers
  shopify.server.ts
prisma/
shopify.app.toml
```


