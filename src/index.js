import "dotenv/config";

import cors from "cors";
import express from "express";

import { connectDB } from "./config/db.js";

import analyticsRoutes from "./routes/analyticsRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import equipmentRoutes from "./routes/equipmentRoutes.js";
import favoriteRoutes from "./routes/favoriteRoutes.js";
import protectedRoutes from "./routes/protectedRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import paymentRoutes, { stripeWebhook } from "./routes/paymentRoutes.js";

const app = express();

const port = process.env.PORT || 5000;

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

const allowedOrigins = [
  process.env.CLIENT_URL || "http://localhost:3000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

/*
|--------------------------------------------------------------------------
| STRIPE WEBHOOK
|--------------------------------------------------------------------------
|
| Stripe requires the raw request body to verify the signature, so this
| route is mounted before the JSON body parser.
|
*/

app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

/*
|--------------------------------------------------------------------------
| BODY PARSER
|--------------------------------------------------------------------------
*/

app.use(
  express.json({
    limit: "2mb",
  })
);

/*
|--------------------------------------------------------------------------
| ROOT ROUTE
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to the rEntsy Server",
  });
});

/*
|--------------------------------------------------------------------------
| PUBLIC API ROUTES
|--------------------------------------------------------------------------
|
| These routes can be accessed without JWT.
|
*/

app.use("/api/equipment", equipmentRoutes);

app.use("/api/contacts", contactRoutes);

/*
|--------------------------------------------------------------------------
| USER ROUTES
|--------------------------------------------------------------------------
|
| userRoutes internally handles authentication
| where required.
|
*/

app.use("/api/users", userRoutes);

/*
|--------------------------------------------------------------------------
| PROTECTED / AUTHENTICATED ROUTES
|--------------------------------------------------------------------------
|
| JWT verification is handled inside these route files
| using verifyToken middleware.
|
*/

app.use("/api/bookings", bookingRoutes);

app.use("/api/favorites", favoriteRoutes);

app.use("/api/analytics", analyticsRoutes);

app.use("/api/payments", paymentRoutes);

app.use("/api/protected", protectedRoutes);

/*
|--------------------------------------------------------------------------
| 404 HANDLER
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
  });
});

/*
|--------------------------------------------------------------------------
| GLOBAL ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use((error, req, res, next) => {
  console.error("Unhandled API error:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

const startServer = async () => {
  try {
    await connectDB();

    app.listen(port, () => {
      console.log("");
      console.log("======================================");
      console.log("       rEntsy Server Started");
      console.log("======================================");
      console.log(`PORT: ${port}`);
      console.log(`URL: http://localhost:${port}`);
      console.log(
        `CLIENT: ${
          process.env.CLIENT_URL ||
          "http://localhost:3000"
        }`
      );
      console.log("JWT: Better Auth JWKS enabled");
      console.log("======================================");
      console.log("");
    });
  } catch (error) {
    console.error(
      "Failed to start server:",
      error
    );

    process.exit(1);
  }
};

startServer();