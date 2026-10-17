# Maison Bennani — E-commerce Site

A complete, self-hosted e-commerce site: storefront + admin panel + Cash on Delivery
checkout, built with Node.js/Express and a lightweight JSON file database (no external
database server required).

## Before you launch — checklist

Run through this before sending the link to real customers:

- [ ] Fresh `SESSION_SECRET` generated (not one that was ever pasted anywhere public)
- [ ] Real admin password set — not `ChangeMe123!` or any password used during testing
- [ ] `NODE_ENV=production` set on your host (only after it has HTTPS — never on localhost)
- [ ] All real products added (Bulk Import — see below) with real photos, prices and stock
- [ ] Delivery fees and free-delivery threshold set for your real cities (Admin → Delivery & Settings)
- [ ] Email configured (`SMTP_...` + `SELLER_EMAIL` in `.env`) so you get notified of orders
- [ ] Persistent volume enabled on your host for `data/` and `public/uploads/` (see Deploy section) — without this, a redeploy wipes your products and orders
- [ ] Placed one real test order yourself, end to end, and confirmed it appears correctly in the admin panel
- [ ] Confirmed you can log into `/admin` on the **live** URL, not just localhost

## What's included
- Storefront: category browsing (Men / Women / Gift Sets), search, price sorting,
  product pages, cart, and Cash on Delivery checkout with per-city delivery fees.
- Admin panel (`/admin`): secure login, full product management (add/edit/delete,
  image upload, price, stock, discounts, active/hidden toggle), order management
  (view customer + order details, change status), and delivery fee settings.
- Mobile-first responsive design.

## 1. Run it locally (to preview before deploying)

You need [Node.js](https://nodejs.org) 18 or newer installed.

```bash
cd maison-bennani
npm install
cp .env.example .env
```

Open `.env` and fill in:
- `SESSION_SECRET` — generate one with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `ADMIN_USERNAME` — whatever you want your admin login to be
- `ADMIN_PASSWORD_HASH` — generate with:
  `node hash-password.js "YourStrongPassword"`
  and paste the printed hash in

Then start it:

```bash
npm start
```

Visit `http://localhost:3000` for the store and `http://localhost:3000/admin` for
the admin panel.

## 2. Add your real products

Log into `/admin` → Products → "+ Add Product" for each of your 66 products:
name, category, price, stock, description, and upload the product photo. You can
also edit/delete/discount any product at any time — no developer needed.

**About the product photos:** this build doesn't include AI image generation
inside the app. Two practical options for premium-looking photos:
1. Use Claude (this chat) to generate/retouch individual images — studio background,
   consistent lighting — using your real reference photos, then upload the results here.
2. Use a product photo studio/editing service, or a tool like Photoroom/Canva, to batch
   process your 66 images with a consistent white or dark studio background before
   uploading them.
Either way, uploaded images should ideally be square (1:1), at least 800×800px, and
under 5MB (jpg/png/webp).

## 3. Deploy to Railway (recommended)

This project includes `railway.json`, so Railway already knows how to build, run,
and health-check it — no extra configuration needed beyond the steps below.

1. Push this folder to a GitHub repository (create one at github.com if you don't have one)
2. Go to [railway.app](https://railway.app), sign in with GitHub
3. **New Project** → **Deploy from GitHub repo** → select your repo
4. Railway will detect it's a Node app and deploy automatically — but it will fail
   to start until you add the environment variables in the next step
5. In your project → **Variables** tab, add:
   - `SESSION_SECRET` — a long random string (generate with the command in `.env.example`)
   - `ADMIN_USERNAME` — your chosen admin username
   - `ADMIN_PASSWORD_HASH` — from `node hash-password.js "YourPassword"`
   - `NODE_ENV` = `production`
   - `PUBLIC_URL` — once you know your Railway URL or custom domain (e.g. `https://maisonbennani.com`)
   - (optional but recommended) the `SMTP_...` and `SELLER_EMAIL` variables — see Email setup below
6. **Critical step — persistent storage:** in **Settings → Volumes**, add a volume
   mounted at `/app/data` and another at `/app/public/uploads`. Without this, every
   new deploy wipes your products, orders, and photos back to the starting seed data.
7. Railway gives you a live URL immediately (e.g. `maison-bennani-production.up.railway.app`)
   — this works right away, no domain required
8. To use your own domain later: **Settings → Domains → Custom Domain**, then update
   your domain's DNS as instructed — no redeploy needed

### Alternative: a VPS (full control, ~$4-6/month)
1. Upload this folder to the server.
2. `npm install --production`
3. Use [PM2](https://pm2.keymetrics.io) to keep it running: `npm i -g pm2 && pm2 start server.js && pm2 save && pm2 startup`
4. Put Nginx in front as a reverse proxy to port 3000, and use Certbot for free HTTPS.

## 4. Domain & hosting costs (typical)

- Domain (.com or .ma): ~$10-15/year
- Hosting (Railway/Render/small VPS): ~$5-7/month
- No transaction fees or commissions — Cash on Delivery has none, and this app
  charges nothing per order.

## Customer accounts & email notifications

**Customer accounts** (required to order): shoppers must create an account
(name/email/password) before checking out — if they try to check out without
signing in, they're taken straight to sign-in/create-account, and back to checkout
automatically once logged in. They get a welcome email immediately on signup, and
can view their order history any time under "My Orders."

**Customer password reset:** if a customer forgets their password, "Forgot password?"
on the sign-in panel emails them a secure, one-hour link to set a new one. If email
isn't configured, the reset link is printed to your server console instead (useful
for testing before you set up SMTP).

**Emails sent automatically** (once configured — see below):
- Order confirmation → sent to the customer, if they gave an email at checkout
- Order status change (e.g. "Shipped") → sent to the customer
- New order alert → sent to **you** (the seller) every time someone orders

If email isn't configured, none of this breaks anything — orders and accounts
keep working exactly the same, emails are just silently skipped (you'll see a
warning in the server logs, that's all).

### Email setup (5 minutes)

Add these to your `.env` file. Two easy options:

**Option A — Gmail (good for getting started, free)**
1. Turn on 2-Step Verification on the Gmail account you want to send from:
   [myaccount.google.com/security](https://myaccount.google.com/security)
2. Create an "App Password": [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. In `.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-gmail-address@gmail.com
   SMTP_PASS=the-16-character-app-password
   MAIL_FROM=Maison Bennani <your-gmail-address@gmail.com>
   SELLER_EMAIL=your-gmail-address@gmail.com
   ```
   Gmail caps free sending around 500/day — plenty for a store this size.

**Option B — Brevo (formerly Sendinblue) — better for a real business**
Free tier gives 300 emails/day from your own domain (e.g. `orders@maisonbennani.com`
instead of a gmail.com address), which looks more professional to customers.
1. Sign up at [brevo.com](https://www.brevo.com), verify your sender email/domain
2. Get your SMTP credentials from Settings → SMTP & API
3. Fill in the same `.env` fields as above with Brevo's SMTP host/user/pass

`SELLER_EMAIL` can be different from `SMTP_USER` — e.g. send *from* a no-reply
address but get new-order alerts on your personal Gmail.

## Security features built in
- **Rate-limited login**: max 8 password attempts per IP every 15 minutes, blocking brute-force guessing.
- **Security headers** (via Helmet): blocks clickjacking, MIME-sniffing attacks, and enforces a strict content policy.
- **Automatic backups**: every time products/orders/settings change, a timestamped snapshot is saved to `data/backups/` (last 30 kept automatically). If something ever goes wrong, restore by copying the newest backup file over `data/store.json`.
- **Hashed password**: your admin password is never stored in plain text, only as a one-way bcrypt hash.
- **Session-protected admin routes**: every product/order-editing endpoint requires a valid login — verified by automated tests before shipping this build.

## Security notes before going live
- Always deploy with `NODE_ENV=production` and a real HTTPS domain (required for
  secure login cookies).
- Never commit your real `.env` file — `.gitignore` already excludes it.
- Change the admin password from the default before giving anyone access.
- Back up the `data/store.json` file periodically (or rely on your host's volume
  backups) — it holds all your products and order history.

## Project structure
```
server.js              → app entry point
db.js                  → JSON file data storage
routes/                → API endpoints (products, orders, settings, auth)
middleware/auth.js     → admin session protection
public/                → storefront (index.html, css/, js/)
public/admin/          → admin panel
public/uploads/        → uploaded product images
data/store.json        → your products, orders and settings (created on first run)
```

## Extending later
- Swap the JSON file for Postgres/MySQL if the catalog grows large — the route
  files are the only place that would need updating.
- Add SMS/WhatsApp order notifications via a provider like Twilio.
- Add a card payment option alongside COD if you expand beyond cash payments.
