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
import categoryRoutes from "./routes/categoryRoutes.js";



const app = express();

const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: [
      process.env.CLIENT_URL || "http://localhost:3000",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ],
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

// Root route
app.get("/", (req, res) => {
  res.send("Welcome to the rEntsy Server");
});

// API routes
app.use("/api/users", userRoutes);
app.use("/api/equipment", equipmentRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/protected", protectedRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/categories", categoryRoutes);
// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error("Unhandled API error:", error);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

// Start server
const startServer = async () => {
  try {
    await connectDB();

    app.listen(port, () => {
      console.log(`The server is running on PORT = ${port}`);
      console.log(`URL = http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
};

startServer();
