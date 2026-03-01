# Food Business Website (Landing + Ecommerce + Admin)

## Features
- Landing page for your food business
- Ecommerce storefront with category filtering and cart
- Checkout flow with India UPI
  - Razorpay UPI integration when keys are configured
  - Fallback UPI intent link mode when keys are not configured
- Admin product management
  - Add/edit/delete products
  - Manage SKU, inventory stock, category, active status
- Admin order management
  - View all orders sorted by latest first
  - Filter by `Open`, `Pending`, `Closed`
  - Update order status from admin

## Tech Stack
- Frontend: HTML/CSS/Vanilla JS
- Backend: Node.js + Express
- Database: SQLite (`better-sqlite3`)
- Payment Gateway: Razorpay (UPI)

## Run Locally
1. Install dependencies:
```bash
npm install
```
2. Create env file:
```bash
cp .env.example .env
```
3. Add your Razorpay keys in `.env` (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`) for live UPI gateway checkout.
4. Start server:
```bash
npm run dev
```
5. Open:
- Home: [http://localhost:3000](http://localhost:3000)
- Shop: [http://localhost:3000/shop.html](http://localhost:3000/shop.html)
- Admin: [http://localhost:3000/admin.html](http://localhost:3000/admin.html)

## Deploy To A Website (Render)
1. Push this project to GitHub.
2. In Render, create a **Blueprint** service and select your repo.
3. Render will detect `render.yaml` and configure:
   - `npm ci` build
   - `npm start` run command
   - Persistent disk at `/var/data` for SQLite
4. In Render Environment Variables, set production secrets:
   - `SUPER_ADMIN_SETUP_KEY` (used one time to create first Super Admin)
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `BUSINESS_UPI_ID`
   - `BUSINESS_NAME`
   - `DELIVERY_FEE`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (optional, for password reset emails)
5. Deploy and open the generated `https://<your-service>.onrender.com` URL.

### Free Tier Note
- The included `render.yaml` is configured for Render free tier.
- On free tier, local SQLite storage is ephemeral (`/tmp/foodbiz.sqlite`) and can reset after restarts/redeploys.
- For persistent production data, use Render Starter + persistent disk or move to a managed database.

## Connect Your Custom Domain
1. Open your Render service -> **Settings** -> **Custom Domains**.
2. Add your domain (example: `www.bezawadabiryani.com`).
3. In your DNS provider, create the CNAME/A records shown by Render.
4. Wait for DNS + SSL to finish provisioning, then open your domain URL.

## Order Status Logic
- `PENDING`: Order created, payment initiated/awaited
- `OPEN`: Paid/confirmed order, active for fulfillment
- `CLOSED`: Completed or closed by admin

## Notes
- Inventory updates are enforced on the backend when order intent is created.
- Seed products are inserted on first run.
- Database path defaults to `data/foodbiz.sqlite` and can be overridden with `SQLITE_PATH`.
