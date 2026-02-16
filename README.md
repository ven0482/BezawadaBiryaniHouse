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

## Order Status Logic
- `PENDING`: Order created, payment initiated/awaited
- `OPEN`: Paid/confirmed order, active for fulfillment
- `CLOSED`: Completed or closed by admin

## Notes
- Inventory updates are enforced on the backend when order intent is created.
- Seed products are inserted on first run.
- Database path: `data/foodbiz.sqlite`
