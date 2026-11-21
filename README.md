# rEntsy Server

Express + MongoDB API for the rEntsy equipment rental platform.

## Scripts

```bash
npm install
npm run dev     # nodemon, http://localhost:5000
npm start       # production start
```

## Environment

Copy the values into `rEntsy-server/.env` (never commit this file):

```env
PORT=5000
MONGODB_CLIENT_URI=...
DB_NAME=rEntsy_server_DB
BETTER_AUTH_JWKS_URL=http://localhost:3000/api/auth/jwks
CLIENT_URL=http://localhost:3000
ADMIN_EMAILS=

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CURRENCY=usd
```

`STRIPE_SECRET_KEY` is optional for local review: without it the payment API
uses a simulated checkout. Add the key for real Stripe Checkout payments.

## API Areas

| Prefix | Purpose |
| --- | --- |
| `/api/equipment` | Public catalog, details, owner equipment, approvals |
| `/api/users` | Profiles, admin user list, role changes |
| `/api/favorites` | Customer saved equipment |
| `/api/bookings` | Customer, owner and admin booking records |
| `/api/payments` | Stripe checkout, verification, cancel, ledger |
| `/api/analytics` | Customer, owner and admin dashboard analytics |
| `/api/contacts` | Public contact and support messages |
| `/api/protected` | JWT role checks |

## Security

- Better Auth JWTs are verified with the remote JWKS (`jose`).
- Issuer, audience and allowed algorithms are validated.
- Roles are loaded from MongoDB on every protected request.
- `verifyRole` never trusts a role supplied by the client.
- Stripe amounts are recalculated on the server from the equipment price,
  rental type, dates and quantity.

## Stripe

- `POST /api/payments/checkout` creates the session and stores a pending
  transaction.
- `POST /api/payments/verify` confirms the session and creates the booking +
  paid transaction record.
- `POST /api/payments/cancel` marks a pending checkout as cancelled.
- `POST /api/payments/webhook` handles `checkout.session.completed` and
  `checkout.session.async_payment_succeeded`.

Set the webhook URL to `https://<server-domain>/api/payments/webhook` and protect
it with `STRIPE_WEBHOOK_SECRET`.
