# GavelPro — Online Auction Platform

Rebuilt from ASP.NET Core → **Node.js + PostgreSQL (backend)** + **React + Tailwind CSS (frontend)**.

---

## Stack

| Layer    | Technology                                      |
|----------|-------------------------------------------------|
| Backend  | Node.js, Express, PostgreSQL (pg), JWT auth     |
| Frontend | React 18, React Router 6, Tailwind CSS 3, Vite  |
| Auth     | JWT Bearer tokens (no sessions/cookies)         |
| Uploads  | Multer (local disk, `/uploads/`)                |
| Email    | Nodemailer + Mailtrap (dev)                     |

---

## Project Structure

```
gavelpro-new/
├── backend/
│   ├── src/
│   │   ├── db/         # pool.js, migrate.js, seed.js
│   │   ├── middleware/ # auth.js (JWT authenticate + authorize)
│   │   ├── routes/     # auth, auctions, users, categories, disputes, admin
│   │   ├── services/   # emailService.js
│   │   └── index.js    # Express app entry point
│   ├── uploads/        # auto-created on first upload
│   ├── .env            # copy from .env.example and fill in
│   └── package.json
└── frontend/
    ├── src/
    │   ├── api/        # axios.js (base client)
    │   ├── components/ # AuctionCard, Countdown
    │   ├── context/    # AuthContext (JWT + user state)
    │   ├── layouts/    # PublicLayout, AdminLayout, SellerLayout
    │   └── pages/      # auth/, public/, seller/, admin/
    ├── index.html
    └── package.json
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ running locally
- The database `GavelProDb` already exists (or update `.env`)

### 1. Backend

```bash
cd gavelpro-new/backend
npm install

# Copy and configure environment
copy .env.example .env
# Edit .env: DB_PASSWORD, JWT_SECRET, SMTP credentials

# Create tables
npm run migrate

# Seed admin user + default categories
npm run seed

# Start dev server
npm run dev
# → http://localhost:5000
```

### 2. Frontend

```bash
cd gavelpro-new/frontend
npm install

npm run dev
# → http://localhost:5173
```

The Vite dev server proxies `/api` and `/uploads` to `localhost:5000` automatically.

---

## Default Credentials

| Role  | Email                  | Password   |
|-------|------------------------|------------|
| Admin | admin@gavelpro.com     | admin@123  |

Register as Buyer or Seller through the UI.

---

## API Endpoints

### Auth
- `POST /api/auth/register` — register (Buyer/Seller)
- `POST /api/auth/login` — login → JWT token
- `GET  /api/auth/me` — current user (requires token)

### Auctions (public)
- `GET  /api/auctions` — list live auctions (filter: category, search, featured, page)
- `GET  /api/auctions/:id` — auction detail
- `GET  /api/auctions/:id/bids` — bid history (requires auth)

### Auctions (Seller/Admin)
- `GET  /api/auctions/seller/my` — own auctions
- `POST /api/auctions` — create auction (multipart/form-data)
- `PUT  /api/auctions/:id` — edit auction
- `DELETE /api/auctions/:id` — delete auction
- `POST /api/auctions/:id/bid` — place bid (Buyer only)

### Users
- `GET  /api/users/profile` — own profile
- `PUT  /api/users/profile` — update profile (multipart/form-data)
- `GET  /api/users` — all users (Admin)
- `POST /api/users/:id/suspend` — suspend (Admin)
- `POST /api/users/:id/unsuspend` — unsuspend (Admin)
- `DELETE /api/users/:id` — delete (Admin)

### Categories
- `GET  /api/categories` — active categories
- `POST /api/categories` — create (Admin)
- `POST /api/categories/:id/toggle` — toggle active (Admin)
- `DELETE /api/categories/:id` — delete (Admin)

### Disputes
- `GET  /api/disputes` — list (Admin: all, Buyer: own)
- `POST /api/disputes` — raise dispute (Buyer)
- `POST /api/disputes/:id/resolve` — resolve (Admin)

### Admin
- `GET  /api/admin/dashboard` — dashboard stats
- `GET  /api/admin/reports` — full analytics
- `GET  /api/admin/auctions` — all auctions
- `POST /api/admin/auctions/:id/toggle-live` — toggle live
- `POST /api/admin/auctions/:id/approve` — approve listing
- `DELETE /api/admin/auctions/:id` — delete
- `GET  /api/admin/settings` — platform settings
- `PUT  /api/admin/settings/:key` — update setting
