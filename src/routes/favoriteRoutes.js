import express from "express";
import { ObjectId } from "mongodb";

import { getDB } from "../config/db.js";
import { loadUser } from "../middleware/loadUser.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

// --------------------------------------------------
// GET /api/favorites
// --------------------------------------------------

router.get(
  "/",
  verifyToken,
  loadUser,
  async (req, res) => {
    try {
      const db = getDB();

      const favorites = await db
        .collection("favorites")
        .find({
          userId: req.dbUser._id.toString(),
        })
        .sort({ createdAt: -1 })
        .toArray();

      if (favorites.length === 0) {
        return res.status(200).json({
          success: true,
          count: 0,
          favorites: [],
        });
      }

      const equipmentIds = favorites
        .map((favorite) => favorite.equipmentId)
        .filter((id) => ObjectId.isValid(id))
        .map((id) => new ObjectId(id));

      const equipment = await db
        .collection("equipment")
        .find({
          _id: { $in: equipmentIds },
        })
        .toArray();

      const equipmentMap = new Map(
        equipment.map((item) => [
          item._id.toString(),
          item,
        ])
      );

      const populated = favorites
        .map((favorite) => ({
          ...favorite,
          equipment:
            equipmentMap.get(favorite.equipmentId) ||
            null,
        }))
        .filter((favorite) => favorite.equipment);

      return res.status(200).json({
        success: true,
        count: populated.length,
        favorites: populated,
      });
    } catch (error) {
      console.error("List favorites error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load favorites.",
      });
    }
  }
);

// --------------------------------------------------
// POST /api/favorites
// --------------------------------------------------

router.post(
  "/",
  verifyToken,
  loadUser,
  async (req, res) => {
    try {
      const db = getDB();

      const { equipmentId } = req.body || {};

      if (!ObjectId.isValid(equipmentId)) {
        return res.status(400).json({
          success: false,
          message: "A valid equipment ID is required.",
        });
      }

      const equipment = await db
        .collection("equipment")
        .findOne({
          _id: new ObjectId(equipmentId),
        });

      if (!equipment) {
        return res.status(404).json({
          success: false,
          message: "Equipment not found.",
        });
      }

      await db.collection("favorites").updateOne(
        {
          userId: req.dbUser._id.toString(),
          equipmentId,
        },
        {
          $setOnInsert: {
            userId: req.dbUser._id.toString(),
            equipmentId,
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      return res.status(201).json({
        success: true,
        message: "Equipment added to favorites.",
      });
    } catch (error) {
      console.error("Add favorite error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to add favorite.",
      });
    }
  }
);

// --------------------------------------------------
// DELETE /api/favorites/:equipmentId
// --------------------------------------------------

router.delete(
  "/:equipmentId",
  verifyToken,
  loadUser,
  async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.equipmentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid equipment ID.",
        });
      }

      const result = await getDB()
        .collection("favorites")
        .deleteOne({
          userId: req.dbUser._id.toString(),
          equipmentId: req.params.equipmentId,
        });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Favorite not found.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Favorite removed.",
      });
    } catch (error) {
      console.error("Remove favorite error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to remove favorite.",
      });
    }
  }
);

export default router;
