import express from "express";
import { ObjectId } from "mongodb";

import { getDB } from "../config/db.js";
import { loadUser } from "../middleware/loadUser.js";
import { verifyRole } from "../middleware/verifyRole.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

const ALLOWED_ROLES = ["customer", "owner", "admin"];
const SIGNUP_ROLES = ["customer", "owner"];

const cleanText = (value) =>
  typeof value === "string" ? value.trim() : "";

const isValidObjectId = (value) =>
  ObjectId.isValid(value);

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// --------------------------------------------------
// GET /api/users
// List users (Admin only)
// --------------------------------------------------

router.get(
  "/",
  verifyToken,
  loadUser,
  verifyRole("admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const { q = "", role = "" } = req.query;

      const filter = {};

      if (cleanText(q)) {
        const pattern = new RegExp(
          escapeRegex(cleanText(q)),
          "i"
        );

        filter.$or = [
          { name: pattern },
          { email: pattern },
          { phone: pattern },
        ];
      }

      if (ALLOWED_ROLES.includes(role)) {
        filter.role = role;
      }

      const users = await db
        .collection("users")
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray();

      return res.status(200).json({
        success: true,
        count: users.length,
        users,
      });
    } catch (error) {
      console.error("List users error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load users.",
      });
    }
  }
);

// --------------------------------------------------
// GET /api/users/me
// --------------------------------------------------

router.get(
  "/me",
  verifyToken,
  loadUser,
  async (req, res) => {
    return res.status(200).json({
      success: true,
      user: req.dbUser,
    });
  }
);

// --------------------------------------------------
// PATCH /api/users/me
// Update own profile
// --------------------------------------------------

router.patch(
  "/me",
  verifyToken,
  loadUser,
  async (req, res) => {
    try {
      const db = getDB();

      const { name, phone, address, image } =
        req.body || {};

      if (
        name !== undefined &&
        !cleanText(name)
      ) {
        return res.status(400).json({
          success: false,
          message: "Name cannot be empty.",
        });
      }

      const update = {
        name:
          name !== undefined
            ? cleanText(name)
            : req.dbUser.name,
        phone:
          phone !== undefined
            ? cleanText(phone)
            : req.dbUser.phone || "",
        address:
          address !== undefined
            ? cleanText(address)
            : req.dbUser.address || "",
        image:
          image !== undefined
            ? cleanText(image)
            : req.dbUser.image || "",
        updatedAt: new Date(),
      };

      await db.collection("users").updateOne(
        { _id: req.dbUser._id },
        { $set: update }
      );

      const updatedUser = await db
        .collection("users")
        .findOne({ _id: req.dbUser._id });

      return res.status(200).json({
        success: true,
        message: "Profile updated successfully.",
        user: updatedUser,
      });
    } catch (error) {
      console.error("Update own profile error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update profile.",
      });
    }
  }
);

// --------------------------------------------------
// POST /api/users
// Create or sync the signed-in user's profile.
//
// NOTE: The role can only be chosen at creation time.
// An existing user can never escalate their own role
// through this endpoint.
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
    } = req.body || {};

    const tokenEmail = req.user?.email?.toLowerCase();

    if (!tokenEmail) {
      return res.status(401).json({
        success: false,
        message: "User email is missing from token.",
      });
    }

    if (!SIGNUP_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user role.",
      });
    }

    if (!cleanText(name) || !cleanText(email)) {
      return res.status(400).json({
        success: false,
        message: "Name and email are required.",
      });
    }

    if (
      tokenEmail !== cleanText(email).toLowerCase()
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You cannot create or update another user's account.",
      });
    }

    const users = db.collection("users");
    const cleanEmail = cleanText(email).toLowerCase();

    const existingUser = await users.findOne({
      email: cleanEmail,
    });

    const now = new Date();

    if (!existingUser) {
      const newUser = {
        name: cleanText(name),
        email: cleanEmail,
        image: cleanText(image),
        phone: cleanText(phone),
        address: cleanText(address),
        role,
        createdAt: now,
        updatedAt: now,
      };

      const result = await users.insertOne(newUser);

      return res.status(201).json({
        success: true,
        message: "User created successfully.",
        user: {
          _id: result.insertedId,
          ...newUser,
        },
      });
    }

    const updatedUser = await users.findOneAndUpdate(
      { _id: existingUser._id },
      {
        $set: {
          name: cleanText(name),
          image:
            cleanText(image) ||
            existingUser.image ||
            "",
          phone:
            cleanText(phone) ||
            existingUser.phone ||
            "",
          address:
            cleanText(address) ||
            existingUser.address ||
            "",
          updatedAt: now,
        },
      },
      { returnDocument: "after" }
    );

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
// PATCH /api/users/role/:id
// Change a user's role (Admin only)
// --------------------------------------------------

router.patch(
  "/role/:id",
  verifyToken,
  loadUser,
  verifyRole("admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const { role } = req.body || {};

      if (!ALLOWED_ROLES.includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role.",
        });
      }

      if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID.",
        });
      }

      const targetId = new ObjectId(req.params.id);

      if (req.dbUser._id.equals(targetId)) {
        return res.status(400).json({
          success: false,
          message:
            "You cannot change your own admin role.",
        });
      }

      const target = await db
        .collection("users")
        .findOne({ _id: targetId });

      if (!target) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      if (
        target.role === "admin" &&
        role !== "admin"
      ) {
        const adminCount = await db
          .collection("users")
          .countDocuments({ role: "admin" });

        if (adminCount <= 1) {
          return res.status(400).json({
            success: false,
            message:
              "At least one admin account is required.",
          });
        }
      }

      await db.collection("users").updateOne(
        { _id: targetId },
        {
          $set: {
            role,
            updatedAt: new Date(),
          },
        }
      );

      const updatedUser = await db
        .collection("users")
        .findOne({ _id: targetId });

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
  }
);

// --------------------------------------------------
// DELETE /api/users/:id
// Delete a user and their Better Auth account
// (Admin only)
// --------------------------------------------------

router.delete(
  "/:id",
  verifyToken,
  loadUser,
  verifyRole("admin"),
  async (req, res) => {
    try {
      const db = getDB();

      if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID.",
        });
      }

      const targetId = new ObjectId(req.params.id);

      if (req.dbUser._id.equals(targetId)) {
        return res.status(400).json({
          success: false,
          message: "You cannot delete your own account.",
        });
      }

      const target = await db
        .collection("users")
        .findOne({ _id: targetId });

      if (!target) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      if (target.role === "admin") {
        const adminCount = await db
          .collection("users")
          .countDocuments({ role: "admin" });

        if (adminCount <= 1) {
          return res.status(400).json({
            success: false,
            message:
              "At least one admin account is required.",
          });
        }
      }

      await db.collection("users").deleteOne({
        _id: targetId,
      });

      // Remove the Better Auth identity as well so the
      // email can never sign in to a deleted profile.
      const authUser = await db.collection("user").findOne({
        email: target.email,
      });

      if (authUser?.id) {
        await Promise.allSettled([
          db.collection("session").deleteMany({
            userId: authUser.id,
          }),
          db.collection("account").deleteMany({
            userId: authUser.id,
          }),
          db.collection("user").deleteOne({
            id: authUser.id,
          }),
        ]);
      }

      return res.status(200).json({
        success: true,
        message: "User deleted successfully.",
      });
    } catch (error) {
      console.error("Delete user error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete user.",
      });
    }
  }
);

export default router;
