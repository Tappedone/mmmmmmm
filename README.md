# Maison Bennani — online store

A fast, mobile-first perfume store with an admin panel. Customers sign up with a **phone number + password**
(no email, no verification codes), pay **Cash on Delivery**, and you handle delivery with them on **WhatsApp**.

## What's in it

**Storefront**
- On arrival it asks *What are you shopping for?* — Men / Women / Gift Sets
- Category filter, instant search, price sorting, product pages, bag, quick checkout
- **Gift Sets** show exactly which perfumes are inside and what you save
- Floating WhatsApp button (appears once you set your number in Settings)
- Photos are optimized automatically; fonts are hosted on the site (no Google requests)

**Admin panel — `/admin`**
- **Products**: add / edit / delete, search, photo upload, price, discount ("compare-at" price), stock, hide/show
- **Gift Sets**: tick perfumes from Men and Women, choose how many of each. Stock is automatic — selling a set also
  reduces the stock of the perfumes inside it, so you can never oversell
- **Orders**: customer, phone, address, items (and what's inside each set), total, date, status — plus a one-tap
  **WhatsApp** button that opens a ready-written message for that order's status
- **Customers**: list, and **Reset password** (see below)
- **Settings**: your WhatsApp number, delivery fees per city, free-delivery threshold
- Cancelling an order puts its stock back

## Going live on Railway

1. Put this folder in a **private** GitHub repository and connect it to a Railway project
   (Railway → New Project → Deploy from GitHub repo).
2. **Variables** tab — add these (see `.env.example`):

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `SESSION_SECRET` | any long random text, 40+ characters |
   | `ADMIN_USERNAME` | the username you'll use at `/admin` |
   | `ADMIN_PASSWORD` | your admin password |
   | `STORAGE_DIR` | `/storage` |
   | `ENCRYPTION_KEY` | any long random text, 40+ characters — **back it up** |

3. **Storage — one volume only.** Railway allows a single volume per service. In the service, add a Volume and set
   its mount path to **`/storage`**. Products, orders, accounts, backups and photos all live there and survive redeploys.
   *Do this before adding real products.* Without it, every redeploy erases everything.
4. **Settings → Networking → Generate Domain** gives you a working `https://…up.railway.app` address immediately.
5. Open `/admin`, sign in, then **Settings**: add your WhatsApp number and check your delivery fees.
6. Add your products, make one test order as a customer, and confirm it shows up in **Orders**.

The live site starts with an **empty catalog** (sample products only appear when testing locally).

### Updating a site that already has products (keep everything)
Your products, orders and customers live in the folder where your Railway **volume** is mounted — new code never
touches that folder, so an update keeps them **as long as the new version looks in the same place**.
1. Railway → your service → **Volumes** and note the **mount path**.
2. **Mounted at `/app/data`** (what the first version of these instructions said): do **not** set `STORAGE_DIR`.
   Add one variable instead: `UPLOAD_DIR` = `/app/data/uploads`. Your products stay exactly as they are, and new photos are
   saved inside the same volume so they survive future updates too.
3. **Mounted somewhere else / you already set `STORAGE_DIR`:** `STORAGE_DIR` points at a *new, empty* place — remove it
   (or point `DATA_DIR` at your existing data folder) before deploying, or the site will look empty.
4. Old photos that were not on a volume are erased by a redeploy (the product stays; just re-upload its photo).
   Anything from old accounts and orders is kept; customers who gave a phone number can sign in with it and their old password.
5. Check after deploying: open your site — old products should all be there. If not, don't add anything new; fix the
   variables first (the data is still in the volume).

### Using your own domain (Namecheap)
1. Railway → your service → **Settings → Networking → + Custom Domain** → type your domain (e.g. `yourdomain.com`).
   Railway shows you **two** DNS records: a **CNAME** and a **TXT**. You need both — without the TXT the site shows a 404.
2. Namecheap → **Domain List → Manage → Advanced DNS**. Delete the default parking records, then add the CNAME
   (Host `@`) and the TXT exactly as Railway shows. In Namecheap's *Host* box, enter only the part before your domain
   (for example `_railway-verify`, not the full name).
3. Wait for the green check in Railway (usually minutes, up to 72 hours). HTTPS is set up automatically.
4. To also use `www.yourdomain.com`, add it as a second custom domain (the Hobby plan allows two).

## Customers forgetting their password
There's no email, so it works through WhatsApp: the customer messages you → **Admin → Customers → Reset password** →
it shows a temporary password and a button that sends it to them on WhatsApp. They can change it under *My Account*.

## Security
- Passwords are hashed (bcrypt). Login is rate-limited; new session on every sign-in.
- **`ENCRYPTION_KEY`** encrypts customer names, phone numbers and addresses on disk. Honest limit: it protects against a
  leaked data file or backup on its own, not against someone with full access to your Railway account — so use a strong
  Railway password and turn on 2FA for your **Railway login**.
- **Admin 2FA (optional)**: run `node setup-2fa.js` and scan the QR code, then set `ADMIN_TOTP_SECRET`.
  No computer? Invent a 32-character code using only letters A–Z and digits 2–7, add it as `ADMIN_TOTP_SECRET`, and in
  your authenticator app choose *Enter a setup key* and type the same code.
- Photos are re-encoded on upload (this also strips hidden data such as location); SVG uploads are refused.
- Orders require a signed-in customer and are checked on the server (prices and stock never come from the browser).
- `.env`, `.git` and similar files are never served.
- The data file is saved safely (no half-written files) and a backup is kept on every change (last 30).

## Email
Customers are not emailed. You can optionally get an email when an order arrives (`SMTP_*` + `SELLER_EMAIL`), but
**Railway's Hobby plan blocks outgoing email**, so rely on the admin panel's **New** order count and WhatsApp instead.

## Keeping it healthy
- Back up `ENCRYPTION_KEY` and your admin password somewhere safe.
- A few times a year, update packages (`npm audit`, `npm update`) and redeploy.
- No security review by a professional has been done on this app. If you grow large, consider one.
- Morocco's data-protection law (09-08, enforced by the CNDP) covers the customer data you collect — check with a local
  lawyer whether your store needs a declaration.

## Run it on your computer
```bash
npm install
cp .env.example .env     # fill in SESSION_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD (leave NODE_ENV=development)
npm start                # http://localhost:3000   (admin at /admin)
```
Local testing includes a few sample products and gift sets so you can see how everything looks.
