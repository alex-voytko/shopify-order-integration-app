# Shopify Order Integration App

Embedded Shopify app that receives order webhooks, stores them per store, and shows basic analytics in the Shopify Admin.

Stack: Node.js, React Router, Prisma, SQLite, Shopify App Bridge, Polaris web components.

Admin and webhook API version: **2026-07**.

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

`npm run setup` generates the Prisma client and applies migrations to SQLite.

`DATABASE_URL=file:dev.sqlite` is relative to the `prisma/` directory. The SQLite file is gitignored.

Shopify credentials do **not** need to be pasted by hand for local development. `npm run dev` creates or links an app and writes them into `.env`.

Never commit `.env`, access tokens, or real customer data.

---

## Shopify application configuration

The app is configured in `shopify.app.toml`.

| Setting | Value |
| --- | --- |
| Scopes | `read_orders,write_orders` |
| Webhook API | `2026-07` |
| Topics | `orders/create`, `orders/updated`, `app/uninstalled` |

`read_orders` is required to receive order webhooks. `write_orders` is required to add the `analytics-processed` tag.

Webhooks are **app-specific** subscriptions. Shopify CLI syncs them when you run `shopify app dev` or `shopify app deploy`. You do not register them in the Admin UI.

### Protected customer data (required before deploy)

Order webhooks include customer email, so Shopify blocks `shopify app deploy` until Protected customer data access is selected.

1. In [Dev Dashboard](https://dev.shopify.com) (or Partner Dashboard), open the app.
2. Set a **distribution** method first (Custom / development is enough). You do not need App Store review.
3. Go to **API access** → **Protected customer data access** → **Request access**.
4. Enable **Protected customer data**.
5. Enable the **Email** field (this app stores `customer_email` when Shopify sends it).
6. Write a short reason, for example: *Store order email for a per-store analytics dashboard in the merchant Admin.*
7. Click **Save**. For development stores, stop here — do not submit for App Store review.
8. Run `shopify app deploy` again, then reinstall the app on the development store.

### Local preview: do not deploy a personal ngrok URL

`Invalid path /?embedded=1&hmac=...` means Admin hit the **Shopify CLI reverse proxy** on port 3000, which only knows `/extensions`. That happens when you:

1. Point `application_url` at your ngrok host
2. Run `shopify app deploy` (Admin now loads that ngrok URL)
3. Run `npm run dev` **without** `--tunnel-url`

`npm run dev` starts a CLI proxy on `:3000`. Ngrok forwards `/` to that proxy. The React app is on another internal port and never receives the request.

Do **not** put a changing ngrok URL in `shopify.app.toml` and deploy it. Use `shopify app dev --tunnel-url=...` so the CLI owns the tunnel and maps `/` to the frontend.

### Ukraine / custom ngrok

Cloudflare tunnels from Shopify CLI often fail in Ukraine. Use your own ngrok, but tell the CLI about it.

1. Stop every previous process: `shopify app dev`, Vite, and ngrok.

2. Start ngrok **first**, pointed at port 3000:

   ```bash
   ngrok http 3000
   ```

3. Copy the HTTPS host (example: `https://afdd-95-158-49-222.ngrok-free.app`). Free ngrok changes this URL on every restart.

4. Open that HTTPS URL once in a normal browser tab and click through the ngrok interstitial. The Admin iframe cannot do that for you.

5. From the project root, pass the tunnel to Shopify CLI. The `:443` is the **public** HTTPS port, not your local port:

   ```bash
   npm run dev -- --tunnel-url=https://YOUR-NGROK-HOST.ngrok-free.app:443 --store=your-store.myshopify.com
   ```

6. Press `p` in the CLI, then **Install app**. Open the app from Admin → Apps, not by pasting the raw ngrok URL.

If you restart ngrok, you get a new host. Stop `shopify app dev` and start it again with the new `--tunnel-url`. Do not deploy.

Optional ngrok flag so Shopify webhook requests skip the interstitial:

```bash
ngrok http 3000 --request-header-add "ngrok-skip-browser-warning:true"
```

---

## Install on a development store

1. Log in to Shopify CLI:

   ```bash
   shopify auth login
   ```

2. Start the app from the project root (`npm run dev`, or the ngrok command above if Cloudflare does not work).

3. When prompted, create a new app or link an existing one, then pick your development store.

4. CLI fills `.env` (`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES`) and syncs webhooks.

5. Press `p` to open the preview URL, then click **Install app**.

After install:

- a `Shop` row is created for `your-store.myshopify.com`
- an offline `Session` (including the access token) is stored in Prisma
- the embedded dashboard opens on `/app`

To install on a second store, run `npm run dev` again and choose another development store. Each shop gets its own rows.

---

## Access the embedded dashboard

With `npm run dev` running:

1. Open the preview URL (`p`) or go to the store Admin → **Apps** → this app.
2. The home page is **Dashboard**.
3. You should see:
   - total orders, total revenue, top-selling SKU
   - connection / webhook status
   - a table of recent orders

The dashboard loader authenticates with `authenticate.admin` and loads only that store’s data. It does not read `shop` from the query string or body.

Protected JSON APIs (same auth):

- `GET /api/orders?limit=50&offset=0`
- `GET /api/analytics`

Unauthenticated requests receive `401`. A store marked uninstalled receives `403`. Access tokens are never sent to the browser.

---

## Test `orders/create`

1. Keep `npm run dev` running so the tunnel can receive webhooks.
2. In the development store Admin, create an order (Orders → Create order), or place a test checkout.
3. In the app terminal, look for a sanitized log such as:

   ```json
   {"source":"shopify-webhook","shop":"your-store.myshopify.com","topic":"ORDERS_CREATE","orderId":"1001","result":"created"}
   ```

4. Refresh the dashboard. The order should appear once.
5. Optional: trigger the same webhook again (`shopify app webhook trigger` or replay). The log result should be `duplicate`. Revenue and SKU counts must not increase.

Invalid HMAC is rejected with `401`. Malformed or invalid prices/quantities return `400`.

---

## Test `orders/updated`

1. Edit the same order in Admin (note, tags, line items, or email).
2. The app should log something like `updated:added` or `updated:already_present`.
3. In Admin, the order should have the tag `analytics-processed`.
4. The dashboard row should show the new totals, tags, and updated date. There is still one row for that order.

### Update arrived before create

If `orders/updated` is delivered first, the app **creates** the missing order from the update payload (`created_from_update`), then adds the tag. There is still one row per `shop + order_id`.

---

## Verify the tag does not loop

Adding `analytics-processed` changes the Shopify order, so Shopify sends another `orders/updated`.

Expected:

1. First update without the tag → Admin API `tagsAdd` runs once. Log: `updated:added`.
2. Echo webhook already contains `analytics-processed` → **no** second Admin API call. Log: `updated:already_present`.
3. Repeating the same update does not create a second database row and does not add the tag again.

The decision is stored in the database (`tags` and `analyticsTagAppliedAt`), not in a process memory variable.

---

## Test uninstall

1. In the store Admin, remove the app.
2. The `app/uninstalled` webhook should:
   - verify HMAC
   - delete all `Session` rows for that shop (access tokens gone)
   - set `Shop.isInstalled = false`
3. Order rows are **kept**.
4. Opening the dashboard for that store is blocked (`403`) until the app is installed again.

---

## Shopify authentication and webhook verification

**Admin / dashboard.** The app is embedded. App Bridge sends a session token. The backend calls `authenticate.admin(request)`, which verifies the token and loads the offline session. The current shop is always `session.shop`. Query parameters and request bodies are ignored.

**Webhooks.** Handlers read the raw body and check `X-Shopify-Hmac-Sha256` with `SHOPIFY_API_SECRET` (HMAC-SHA256, base64, timing-safe compare). Invalid signatures get `401`. After that, the shop is taken from verified webhook headers (`X-Shopify-Shop-Domain`), never from the JSON body.

Logs include shop, topic, order id, and result only. They do not include tokens, secrets, or full customer payloads.

---

## Duplicate-order handling

Duplicates are identified by **`shopDomain + shopifyOrderId`** (unique index).

A repeated `orders/create`:

- returns `200`
- does not insert another row
- does not change totals or line-item quantities

A delayed create that arrives after `orders/updated` does not overwrite the newer stored state.

---

## Webhook loop-prevention strategy

Goal: add `analytics-processed` once, survive restarts and multiple instances.

1. If the incoming payload already has the tag, skip the Admin API. This is the echo from our own tag write.
2. If `analyticsTagAppliedAt` is set, or stored tags already include the tag, skip the Admin API.
3. Otherwise call `tagsAdd` once, then persist the tag and timestamp.

Out-of-order updates: if incoming `updated_at` is older than the stored value, totals and line items are not overwritten.

Trade-off: two concurrent first-time updates could theoretically call `tagsAdd` twice. The mutation is idempotent and does not start a loop. We do not pre-claim the timestamp before the API call, so a crash before `tagsAdd` can still retry on the next webhook.

---

## Assumptions and trade-offs

- **Uninstall keeps orders.** Sessions and tokens are removed; historical orders stay so a reinstall can show them.
- **Missing email** is stored as `null`. The order is still accepted.
- **Empty SKU** is stored as `""` and ignored for `top_sku`.
- **Prices** are `Decimal` in the database. JSON APIs expose numbers only at the response boundary, as in the assignment examples.
- **SQLite** is used for local/demo. One process is enough. For production, switch Prisma to PostgreSQL and set `DATABASE_URL`.
- **CLI webhook triggers** use a fake shop, so `admin` may be missing. The order is stored; tagging is skipped (`skipped_no_admin`). Test tagging with a real Admin order edit.
- **Dashboard** reads the database in the route loader (same isolation rules as `/api/*`). It does not expose Admin API tokens.

---

## Environment variables

See `.env.example`. For local work, `shopify app dev` writes the Shopify values.

| Variable | Purpose |
| --- | --- |
| `SHOPIFY_API_KEY` | App client ID |
| `SHOPIFY_API_SECRET` | App secret; used for OAuth and webhook HMAC |
| `SHOPIFY_APP_URL` | Public HTTPS URL (CLI tunnel in dev) |
| `SCOPES` | Must match `shopify.app.toml` |
| `DATABASE_URL` | Prisma database URL |
| `SHOP_CUSTOM_DOMAIN` | Optional; Plus custom domains only |

---

## Scripts

```bash
npm run setup      # prisma generate + migrate deploy
npm run dev        # shopify app dev
npm test           # unit tests (HMAC, validation, tags)
npm run typecheck
```

---

## Project layout

```
app/
  lib/           HMAC, money, payload validation, webhook helpers
  models/        Shop and order persistence
  routes/        Embedded UI, /api/*, webhook handlers
  shopify.server.ts
prisma/          Schema and migrations
shopify.app.toml
```
