import express from "express";
import { ObjectId } from "mongodb";

import { getDB } from "../config/db.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

// --------------------------------------------------
// POST /api/users
// Create or Sync User
// --------------------------------------------------

router.post("/", verifyToken, async (req, res) => {
  try {
    const db = getDB();

    const {
      name,
      email,
      image,
      phone,
      address,
      role,
    } = req.body;

    const tokenEmail = req.user?.email;

    if (!tokenEmail) {
      return res.status(401).json({
        success: false,
        message: "User email is missing from token.",
      });
    }

    // Only these roles are allowed from registration.
    const allowedRoles = ["customer", "owner"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user role.",
      });
    }

    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name and email are required.",
      });
    }

    // Token email must match submitted email.
    if (tokenEmail.toLowerCase() !== email.trim().toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: "You cannot create/update another user's account.",
      });
    }

    const usersCollection = db.collection("users");

    const cleanEmail = email.trim().toLowerCase();

    const existingUser = await usersCollection.findOne({
      email: cleanEmail,
    });

    const now = new Date();

    if (!existingUser) {
      const newUser = {
        name: name.trim(),
        email: cleanEmail,
        image: image?.trim() || "",
        phone: phone?.trim() || "",
        address: address?.trim() || "",
        role: role,
        createdAt: now,
        updatedAt: now,
      };

      const result = await usersCollection.insertOne(newUser);

      return res.status(201).json({
        success: true,
        message: "User created successfully.",
        user: {
          _id: result.insertedId,
          ...newUser,
        },
      });
    }

    // IMPORTANT:
    // Existing user's selected role is updated here.
    const updateData = {
      name: name.trim(),
      image: image?.trim() || existingUser.image || "",
      phone: phone?.trim() || existingUser.phone || "",
      address: address?.trim() || existingUser.address || "",
      role: role,
      updatedAt: now,
    };

    await usersCollection.updateOne(
      {
        _id: existingUser._id,
      },
      {
        $set: updateData,
      }
    );

    const updatedUser = await usersCollection.findOne({
      _id: existingUser._id,
    });

    return res.status(200).json({
      success: true,
      message: "User synchronized successfully.",
      user: updatedUser,
    });
  } catch (error) {
    console.error("User sync error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create or sync user.",
    });
  }
});

// --------------------------------------------------
// GET /api/users/me
// --------------------------------------------------

router.get("/me", verifyToken, async (req, res) => {
  try {
    const db = getDB();

    const email = req.user?.email;

    if (!email) {
      return res.status(401).json({
        success: false,
        message: "User email is missing.",
      });
    }

    const user = await db.collection("users").findOne({
      email: email.toLowerCase(),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get current user error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get current user.",
    });
  }
});

// --------------------------------------------------
// PATCH /api/users/role/:id
// Admin only
// --------------------------------------------------

router.patch("/role/:id", verifyToken, async (req, res) => {
  try {
    const db = getDB();

    const currentUserEmail = req.user?.email;

    if (!currentUserEmail) {
      return res.status(401).json({
        success: false,
        message: "User email is missing.",
      });
    }

    const currentAdmin = await db.collection("users").findOne({
      email: currentUserEmail.toLowerCase(),
    });

    if (!currentAdmin || currentAdmin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admin can change user roles.",
      });
    }

    const { role } = req.body;

    const allowedRoles = [
      "customer",
      "owner",
      "admin",
    ];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role.",
      });
    }

    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    const result = await db.collection("users").updateOne(
      {
        _id: new ObjectId(req.params.id),
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
        message: "User not found.",
      });
    }

    const updatedUser = await db.collection("users").findOne({
      _id: new ObjectId(req.params.id),
    });

    return res.status(200).json({
      success: true,
      message: `User role changed to ${role}.`,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Change user role error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to change user role.",
    });
  }
});

export default router;