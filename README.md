# rEntsy Server

Backend API for **rEntsy — Equipment Rental & Booking Marketplace**.

The rEntsy server is built with Node.js, Express.js, MongoDB, JWT authentication, role-based authorization, and Stripe payment integration.

---

## 🚀 Live Server

**Production Server**

https://rentsy-server.vercel.app/

### Server Response

```json
{
  "success": true,
  "message": "Welcome to the rEntsy Server"
}
```

---

## 📦 Repository

**GitHub:**  
https://github.com/Rumi-Parvez/rEntsy-server

---

## ✨ Features

- RESTful API with Express.js
- MongoDB database integration
- JWT token verification
- Role-based authorization
- User management
- Customer, Owner, and Admin roles
- Equipment management
- Booking management
- Favorite equipment
- Analytics APIs
- Contact APIs
- Stripe payment integration
- Payment webhook handling
- Protected API routes
- CORS configuration
- Environment variable support
- Vercel deployment

---

## 🛠️ Technology Stack

### Backend

- Node.js
- Express.js `5.3.0`
- MongoDB `7.9.0`
- JavaScript ES Modules

### Authentication & Authorization

- JWT
- `jose` `6.2.18`
- Role-based authorization

### Payment

- Stripe `23.2.0`

### Development

- Nodemon `3.1.10`
- dotenv `18.0.10`
- CORS `2.8.6`

---

# 📁 Project Structure

```text
rEntsy-server/
│
├── src/
│   │
│   ├── config/
│   │   └── db.js
│   │
│   ├── middleware/
│   │   ├── loadUser.js
│   │   ├── verifyRole.js
│   │   └── verifyToken.js
│   │
│   ├── routes/
│   │   ├── analyticsRoutes.js
│   │   ├── bookingRoutes.js
│   │   ├── contactRoutes.js
│   │   ├── equipmentRoutes.js
│   │   ├── favoriteRoutes.js
│   │   ├── paymentRoutes.js
│   │   ├── protectedRoutes.js
│   │   └── userRoutes.js
│   │
│   └── index.js
│
├── .env
├── .gitignore
├── package-lock.json
├── package.json
└── README.md
```

---

# 🔐 Authentication

The backend uses JWT-based authentication to protect private API endpoints.

The frontend sends the JWT through the `Authorization` header.

```http
Authorization: Bearer <JWT_TOKEN>
```

The backend then verifies the token using the `jose` package.

### Authentication Flow

```text
User
 │
 ▼
Frontend Authentication
 │
 ▼
JWT Token
 │
 ▼
Authorization Header
 │
 ▼
Express Server
 │
 ▼
verifyToken Middleware
 │
 ▼
verifyRole / loadUser
 │
 ▼
Protected Route
 │
 ▼
Database Operation
```

---

# 👥 User Roles

rEntsy supports three primary roles:

```text
customer
owner
admin
```

### Customer

Customers can access customer-specific functionality such as:

- Equipment browsing
- Equipment details
- Bookings
- Favorites
- Protected customer APIs

### Owner

Owners can manage their rental equipment and access owner-specific protected APIs.

### Admin

Admins can manage platform-level resources and access administrative APIs such as analytics and role-related operations.

---

# 🧩 Middleware

The server contains three middleware modules.

## `verifyToken.js`

Responsible for validating the JWT token sent with protected requests.

```text
Authorization Header
        ↓
    verifyToken
        ↓
   Token Valid?
      ↙   ↘
    Yes     No
     ↓       ↓
  Next()    401
```

---

## `loadUser.js`

Loads the authenticated user's information for routes that require user details.

This middleware works together with the authentication flow to make authenticated user information available to route handlers.

---

## `verifyRole.js`

Handles role-based authorization.

It ensures that users have the required role before accessing specific protected resources.

For example:

```text
customer
owner
admin
```

Different routes can require different permissions.

---

# 🌐 API Base URL

### Production

```text
https://rentsy-server.vercel.app/api
```

### Local Development

```text
http://localhost:5000/api
```

---

# 📡 API Routes

## 👤 User Routes

```text
/api/users
```

Handles user-related backend operations.

---

## 🧰 Equipment Routes

```text
/api/equipment
```

Handles equipment-related operations.

Responsibilities include:

- Get equipment
- Get equipment details
- Create equipment
- Update equipment
- Delete equipment
- Equipment-related management

---

## 📅 Booking Routes

```text
/api/bookings
```

Handles rental booking operations.

The booking system is protected with authentication and authorization where required.

---

## ❤️ Favorite Routes

```text
/api/favorites
```

Handles user favorite equipment.

Users can manage equipment they have saved as favorites.

---

## 📊 Analytics Routes

```text
/api/analytics
```

Provides analytics-related API functionality for protected dashboard/admin use.

---

## 📩 Contact Routes

```text
/api/contacts
```

Handles contact-related API requests.

---

## 💳 Payment Routes

```text
/api/payments
```

Handles payment-related backend functionality for Stripe integration.

The server communicates with Stripe securely using server-side Stripe credentials.

---

## 🛡️ Protected Routes

```text
/api/protected
```

Contains protected endpoints used to verify authenticated access and role-based authorization.

---

# 💳 Stripe Payment Integration

rEntsy uses Stripe for payment processing.

The backend keeps Stripe secret credentials server-side and handles payment-related operations through the payment routes.

### Payment Flow

```text
Frontend
   │
   ▼
Payment Request
   │
   ▼
Express Backend
   │
   ▼
Stripe
   │
   ▼
Payment Result
   │
   ▼
Backend
   │
   ▼
Database
```

---

# 🔔 Stripe Webhook

Stripe webhook events are handled by the backend so that payment status can be processed securely from Stripe.

For local development, Stripe CLI can forward webhook events to the local server.

Example:

```bash
stripe listen \
  --events checkout.session.completed,payment_intent.succeeded,payment_intent.payment_failed \
  --forward-to localhost:5000/api/payments/webhook
```

---

# 🗄️ MongoDB

The server uses MongoDB as its database.

Database configuration is located in:

```text
src/config/db.js
```

The MongoDB connection is configured through environment variables.

---

# 🔑 Environment Variables

Create a `.env` file in the server root.

Example:

```env
PORT=5000

MONGODB_CONNECTION=your_mongodb_connection_string

BETTER_AUTH_URL=https://rentsy-xi.vercel.app

CLIENT_URL=https://rentsy-xi.vercel.app

STRIPE_SECRET_KEY=your_stripe_secret_key

STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
```

> Use the exact variable names required by your current server code.

Never commit `.env` to GitHub.

---

# ⚙️ Installation

Clone the repository:

```bash
git clone https://github.com/Rumi-Parvez/rEntsy-server.git
```

Go to the project directory:

```bash
cd rEntsy-server
```

Install dependencies:

```bash
npm install
```

Create:

```text
.env
```

Add the required environment variables.

---

# ▶️ Run Locally

### Development

```bash
npm run dev
```

This runs the server using Nodemon.

### Production

```bash
npm start
```

This runs:

```bash
node src/index.js
```

---

# 📜 Available Scripts

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

---

# 🔄 CORS

The server is configured to allow communication with the rEntsy frontend.

### Local frontend

```text
http://localhost:3000
```

### Production frontend

```text
https://rentsy-xi.vercel.app
```

---

# 🚀 Deployment

The backend is deployed on Vercel.

### Production

```text
https://rentsy-server.vercel.app/
```

The frontend uses the production API:

```env
NEXT_PUBLIC_API_URL=https://rentsy-server.vercel.app/api
```

All production secrets must be configured through the Vercel environment variable settings.

---

# 🔒 Security

The server follows several security practices:

- JWT token verification
- Role-based authorization
- Protected API routes
- Server-side MongoDB access
- Server-side Stripe credentials
- Environment variables for sensitive values
- CORS configuration
- Protected payment operations

Sensitive values should never be exposed in frontend code or committed to GitHub.

---

# 🔄 Backend Request Flow

```text
Client Request
      │
      ▼
Express Server
      │
      ▼
Route
      │
      ├── Public Request
      │       │
      │       ▼
      │   Controller Logic
      │
      └── Protected Request
              │
              ▼
         verifyToken
              │
              ▼
          loadUser
              │
              ▼
         verifyRole
              │
              ▼
        Route Handler
              │
              ▼
          MongoDB
              │
              ▼
          JSON Response
```

---

# 🌍 Frontend & Backend

### Frontend

https://rentsy-xi.vercel.app/

### Backend

https://rentsy-server.vercel.app/

### Frontend Repository

https://github.com/Rumi-Parvez/rentsy-client

### Backend Repository

https://github.com/Rumi-Parvez/rEntsy-server

---

# 📚 Backend Responsibilities

The rEntsy server handles:

- Authentication verification
- Authorization
- User operations
- Equipment operations
- Booking operations
- Favorite operations
- Analytics
- Contact requests
- Stripe payments
- Stripe webhooks
- MongoDB operations
- Protected API access

---

# 🔮 Future Improvements

Possible future improvements:

- Swagger/OpenAPI documentation
- Automated API testing
- Improved request validation
- Centralized error handling
- API rate limiting
- More detailed logging
- Advanced analytics
- Expanded payment features

---

# 👨‍💻 Developer

**Rumi Parvez**

Full-Stack Web Developer

### GitHub

https://github.com/Rumi-Parvez

### rEntsy Frontend

https://rentsy-xi.vercel.app/

### rEntsy Backend

https://rentsy-server.vercel.app/

---

## ⭐ rEntsy Server

Backend API for the rEntsy equipment rental and booking marketplace, built with **Node.js, Express.js, MongoDB, JWT authentication, role-based authorization, and Stripe**.