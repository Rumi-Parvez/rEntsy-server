import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import { connectDB } from "./config/db.js";
import protectedRoutes from "./routes/protectedRoutes.js";
import userRoutes from "./routes/userRoutes.js";

dotenv.config();

const app = express();

const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000",
    ],
    credentials: true,
  })
);

app.use(express.json());

// Root route
app.get("/", (req, res) => {
  res.send("Welcome to the rEntsy Server");
});

// User routes
app.use("/api/users", userRoutes);

// Protected routes
app.use("/api/protected", protectedRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Start server
const startServer = async () => {
  try {
    await connectDB();

    app.listen(port, () => {
      console.log(
        `The server is running on PORT = ${port}`
      );

      console.log(
        `URL = http://localhost:${port}`
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
};

startServer();