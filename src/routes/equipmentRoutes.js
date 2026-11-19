import express from "express";
import { ObjectId } from "mongodb";

import { getDB } from "../config/db.js";
import { loadUser } from "../middleware/loadUser.js";
import { verifyRole } from "../middleware/verifyRole.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

const CATEGORIES = [
  "Construction Equipment",
  "Photography Equipment",
  "Vehicles",
  "Agriculture",
  "Electronics",
  "Events",
];

const CONDITIONS = [
  "Excellent",
  "Good",
  "Fair",
  "Needs Maintenance",
];

const STATUSES = ["pending", "approved", "rejected"];

const RENTAL_TYPES = ["hourly", "daily", "weekly", "monthly"];

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isOwnerOrAdmin = (equipment, user) =>
  user.role === "admin" ||
  equipment.ownerEmail === user.email;

// --------------------------------------------------
// GET /api/equipment/meta
// --------------------------------------------------

router.get("/meta", (req, res) => {
  return res.status(200).json({
    success: true,
    categories: CATEGORIES,
    conditions: CONDITIONS,
    rentalTypes: RENTAL_TYPES,
    statuses: STATUSES,
  });
});

// --------------------------------------------------
// GET /api/equipment/manage
// Owner: own equipment. Admin: every equipment.
// --------------------------------------------------

router.get(
  "/manage",
  verifyToken,
  loadUser,
  verifyRole("owner", "admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const { status = "", q = "" } = req.query;

      const filter = {};

      if (req.userRole !== "admin") {
        filter.ownerEmail = req.dbUser.email;
      }

      if (STATUSES.includes(status)) {
        filter.status = status;
      }

      if (typeof q === "string" && q.trim()) {
        const pattern = new RegExp(
          escapeRegex(q.trim()),
          "i"
        );

        filter.$or = [
          { equipmentName: pattern },
          { category: pattern },
          { location: pattern },
          { brand: pattern },
        ];
      }

      const equipment = await db
        .collection("equipment")
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray();

      return res.status(200).json({
        success: true,
        count: equipment.length,
        equipment,
      });
    } catch (error) {
      console.error("Manage equipment error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load equipment.",
      });
    }
  }
);

// --------------------------------------------------
// GET /api/equipment
// Public approved equipment with search / filters
// --------------------------------------------------

router.get("/", async (req, res) => {
  try {
    const db = getDB();

    const {
      search = "",
      category = "",
      rentalType = "",
      minPrice,
      maxPrice,
      sort = "recent",
      limit,
    } = req.query;

    const filter = { status: "approved" };

    if (category) {
      filter.category = category;
    }

    if (RENTAL_TYPES.includes(rentalType)) {
      filter.rentalType = rentalType;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.rentalPrice = {};

      if (minPrice !== undefined && minPrice !== "") {
        filter.rentalPrice.$gte = toNumber(minPrice);
      }

      if (maxPrice !== undefined && maxPrice !== "") {
        filter.rentalPrice.$lte = toNumber(maxPrice);
      }
    }

    if (typeof search === "string" && search.trim()) {
      const pattern = new RegExp(
        escapeRegex(search.trim()),
        "i"
      );

      filter.$or = [
        { equipmentName: pattern },
        { description: pattern },
        { category: pattern },
        { location: pattern },
        { brand: pattern },
      ];
    }

    const sortMap = {
      price_asc: { rentalPrice: 1 },
      price_desc: { rentalPrice: -1 },
      recent: { createdAt: -1 },
      oldest: { createdAt: 1 },
      name: { equipmentName: 1 },
    };

    const pageSize = Math.min(
      Math.max(toNumber(limit, 60), 1),
      200
    );

    const equipment = await db
      .collection("equipment")
      .find(filter)
      .sort(sortMap[sort] || sortMap.recent)
      .limit(pageSize)
      .toArray();

    return res.status(200).json({
      success: true,
      count: equipment.length,
      equipment,
    });
  } catch (error) {
    console.error("List equipment error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load equipment.",
    });
  }
});

// --------------------------------------------------
// POST /api/equipment
// Owner + Admin
// --------------------------------------------------

router.post(
  "/",
  verifyToken,
  loadUser,
  verifyRole("owner", "admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const body = req.body || {};

      const equipmentName =
        typeof body.equipmentName === "string"
          ? body.equipmentName.trim()
          : "";

      const category =
        typeof body.category === "string"
          ? body.category.trim()
          : "";

      if (!equipmentName || !category) {
        return res.status(400).json({
          success: false,
          message:
            "Equipment name and category are required.",
        });
      }

      const rentalPrice = toNumber(
        body.rentalPrice,
        NaN
      );

      if (!Number.isFinite(rentalPrice) || rentalPrice < 0) {
        return res.status(400).json({
          success: false,
          message: "A valid rental price is required.",
        });
      }

      const now = new Date();

      const equipment = {
        equipmentName,
        description:
          typeof body.description === "string"
            ? body.description.trim()
            : "",
        category,
        location:
          typeof body.location === "string"
            ? body.location.trim()
            : "",
        rentalPrice,
        rentalType: RENTAL_TYPES.includes(body.rentalType)
          ? body.rentalType
          : "daily",
        availableQuantity: Math.max(
          toNumber(body.availableQuantity, 1),
          0
        ),
        condition: CONDITIONS.includes(body.condition)
          ? body.condition
          : "Excellent",
        brand:
          typeof body.brand === "string"
            ? body.brand.trim()
            : "",
        model:
          typeof body.model === "string"
            ? body.model.trim()
            : "",
        imageUrl:
          typeof body.imageUrl === "string"
            ? body.imageUrl.trim()
            : "",
        rentalTerms:
          typeof body.rentalTerms === "string"
            ? body.rentalTerms.trim()
            : "",
        status:
          req.userRole === "admin"
            ? "approved"
            : "pending",
        ownerId: req.dbUser._id.toString(),
        ownerName: req.dbUser.name,
        ownerEmail: req.dbUser.email,
        ownerPhone: req.dbUser.phone || "",
        createdAt: now,
        updatedAt: now,
      };

      const result = await db
        .collection("equipment")
        .insertOne(equipment);

      return res.status(201).json({
        success: true,
        message:
          equipment.status === "approved"
            ? "Equipment created successfully."
            : "Equipment submitted for approval.",
        equipment: {
          _id: result.insertedId,
          ...equipment,
        },
      });
    } catch (error) {
      console.error("Create equipment error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create equipment.",
      });
    }
  }
);

// --------------------------------------------------
// GET /api/equipment/:id
// --------------------------------------------------

router.get("/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid equipment ID.",
      });
    }

    const equipment = await getDB()
      .collection("equipment")
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: "Equipment not found.",
      });
    }

    return res.status(200).json({
      success: true,
      equipment,
    });
  } catch (error) {
    console.error("Get equipment error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load equipment.",
    });
  }
});

// --------------------------------------------------
// PATCH /api/equipment/:id
// Owner (own) + Admin
// --------------------------------------------------

router.patch(
  "/:id",
  verifyToken,
  loadUser,
  verifyRole("owner", "admin"),
  async (req, res) => {
    try {
      const db = getDB();

      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid equipment ID.",
        });
      }

      const equipment = await db
        .collection("equipment")
        .findOne({
          _id: new ObjectId(req.params.id),
        });

      if (!equipment) {
        return res.status(404).json({
          success: false,
          message: "Equipment not found.",
        });
      }

      if (!isOwnerOrAdmin(equipment, req.dbUser)) {
        return res.status(403).json({
          success: false,
          message:
            "You can only update your own equipment.",
        });
      }

      const body = req.body || {};

      const update = {
        updatedAt: new Date(),
      };

      const textFields = [
        "equipmentName",
        "description",
        "category",
        "location",
        "brand",
        "model",
        "imageUrl",
        "rentalTerms",
      ];

      textFields.forEach((field) => {
        if (typeof body[field] === "string") {
          update[field] = body[field].trim();
        }
      });

      if (body.rentalPrice !== undefined) {
        const price = toNumber(body.rentalPrice, NaN);

        if (!Number.isFinite(price) || price < 0) {
          return res.status(400).json({
            success: false,
            message: "A valid rental price is required.",
          });
        }

        update.rentalPrice = price;
      }

      if (body.availableQuantity !== undefined) {
        update.availableQuantity = Math.max(
          toNumber(body.availableQuantity, 0),
          0
        );
      }

      if (RENTAL_TYPES.includes(body.rentalType)) {
        update.rentalType = body.rentalType;
      }

      if (CONDITIONS.includes(body.condition)) {
        update.condition = body.condition;
      }

      if (
        req.userRole === "admin" &&
        STATUSES.includes(body.status)
      ) {
        update.status = body.status;
      }

      if (
        update.equipmentName !== undefined &&
        !update.equipmentName
      ) {
        return res.status(400).json({
          success: false,
          message: "Equipment name cannot be empty.",
        });
      }

      await db.collection("equipment").updateOne(
        { _id: equipment._id },
        { $set: update }
      );

      const updatedEquipment = await db
        .collection("equipment")
        .findOne({ _id: equipment._id });

      return res.status(200).json({
        success: true,
        message: "Equipment updated successfully.",
        equipment: updatedEquipment,
      });
    } catch (error) {
      console.error("Update equipment error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update equipment.",
      });
    }
  }
);

// --------------------------------------------------
// PATCH /api/equipment/:id/status
// Admin approval
// --------------------------------------------------

router.patch(
  "/:id/status",
  verifyToken,
  loadUser,
  verifyRole("admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const { status } = req.body || {};

      if (!STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid equipment status.",
        });
      }

      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid equipment ID.",
        });
      }

      const result = await db
        .collection("equipment")
        .updateOne(
          { _id: new ObjectId(req.params.id) },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          }
        );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Equipment not found.",
        });
      }

      return res.status(200).json({
        success: true,
        message: `Equipment ${status}.`,
      });
    } catch (error) {
      console.error("Equipment status error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update equipment status.",
      });
    }
  }
);

// --------------------------------------------------
// DELETE /api/equipment/:id
// Owner (own) + Admin
// --------------------------------------------------

router.delete(
  "/:id",
  verifyToken,
  loadUser,
  verifyRole("owner", "admin"),
  async (req, res) => {
    try {
      const db = getDB();

      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid equipment ID.",
        });
      }

      const equipment = await db
        .collection("equipment")
        .findOne({
          _id: new ObjectId(req.params.id),
        });

      if (!equipment) {
        return res.status(404).json({
          success: false,
          message: "Equipment not found.",
        });
      }

      if (!isOwnerOrAdmin(equipment, req.dbUser)) {
        return res.status(403).json({
          success: false,
          message:
            "You can only delete your own equipment.",
        });
      }

      const activeBookings = await db
        .collection("bookings")
        .countDocuments({
          equipmentId: equipment._id.toString(),
          bookingStatus: {
            $in: ["pending", "confirmed", "ongoing"],
          },
        });

      if (activeBookings > 0) {
        return res.status(400).json({
          success: false,
          message:
            "This equipment has active bookings and cannot be deleted.",
        });
      }

      await db.collection("equipment").deleteOne({
        _id: equipment._id,
      });

      await db.collection("favorites").deleteMany({
        equipmentId: equipment._id.toString(),
      });

      return res.status(200).json({
        success: true,
        message: "Equipment deleted successfully.",
      });
    } catch (error) {
      console.error("Delete equipment error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete equipment.",
      });
    }
  }
);

export default router;
