import express from "express";
import { ObjectId } from "mongodb";

import { getDB } from "../config/db.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

const usersCollection = () => {
  return getDB().collection("users");
};

/*
  Create / sync user
*/
router.post("/", verifyToken, async (req, res) => {
  try {
    const { name, email, image, phone, address } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const existingUser = await usersCollection().findOne({
      email,
    });

    if (existingUser) {
      return res.status(200).json({
        success: true,
        message: "User already exists",
        user: existingUser,
      });
    }

    const newUser = {
      name: name || "",
      email,
      image: image || "",
      phone: phone || "",
      address: address || "",

      // Default role
      role: "customer",

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await usersCollection().insertOne(newUser);

    const createdUser = await usersCollection().findOne({
      _id: result.insertedId,
    });

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      user: createdUser,
    });
  } catch (error) {
    console.error("Create user error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create user",
    });
  }
});

/*
  Get current user's profile
*/
router.get("/me", verifyToken, async (req, res) => {
  try {
    const email = req.user?.email;

    if (!email) {
      return res.status(401).json({
        success: false,
        message: "User email not found in token",
      });
    }

    const user = await usersCollection().findOne({
      email,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get user error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get user",
    });
  }
});

/*
  Admin changes user role
*/
router.patch(
  "/role/:id",
  verifyToken,
  async (req, res, next) => {
    try {
      const email = req.user?.email;

      const admin = await usersCollection().findOne({
        email,
      });

      if (!admin || admin.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Only admin can change user roles",
        });
      }

      next();
    } catch (error) {
      console.error("Admin verification error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to verify admin",
      });
    }
  },
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      const allowedRoles = ["customer", "owner", "admin"];

      if (!allowedRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role",
        });
      }

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      const result = await usersCollection().updateOne(
        {
          _id: new ObjectId(id),
        },
        {
          $set: {
            role,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      return res.json({
        success: true,
        message: `User role changed to ${role}`,
      });
    } catch (error) {
      console.error("Change role error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to change user role",
      });
    }
  }
);

export default router;