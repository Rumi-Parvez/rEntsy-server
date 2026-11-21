import express from "express";
import { ObjectId } from "mongodb";

import { getDB } from "../config/db.js";
import { loadUser } from "../middleware/loadUser.js";
import { verifyRole } from "../middleware/verifyRole.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "ongoing",
  "completed",
  "cancelled",
  "rejected",
];

const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "refunded",
];

const OWNER_STATUSES = [
  "confirmed",
  "ongoing",
  "completed",
  "cancelled",
  "rejected",
];

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseDate = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildBookingId = async (db) => {
  const now = new Date();

  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  const count = await db
    .collection("bookings")
    .countDocuments();

  return `BK-${datePart}-${String(count + 1).padStart(3, "0")}`;
};

const canViewBooking = (booking, user) =>
  user.role === "admin" ||
  booking.customerEmail === user.email ||
  booking.ownerEmail === user.email;

// --------------------------------------------------
// POST /api/bookings
// Create a booking request (Customer)
// --------------------------------------------------

router.post(
  "/",
  verifyToken,
  loadUser,
  verifyRole("customer", "owner", "admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const body = req.body || {};

      if (!ObjectId.isValid(body.equipmentId)) {
        return res.status(400).json({
          success: false,
          message: "A valid equipment ID is required.",
        });
      }

      const equipment = await db
        .collection("equipment")
        .findOne({
          _id: new ObjectId(body.equipmentId),
        });

      if (!equipment) {
        return res.status(404).json({
          success: false,
          message: "Equipment not found.",
        });
      }

      if (equipment.status !== "approved") {
        return res.status(400).json({
          success: false,
          message:
            "This equipment is not available for booking.",
        });
      }

      const start = parseDate(body.rentalStartDate);
      const end = parseDate(body.rentalEndDate);

      if (!start || !end || end < start) {
        return res.status(400).json({
          success: false,
          message:
            "Valid rental start and end dates are required.",
        });
      }

      const duration =
        Math.floor(
          (end.getTime() - start.getTime()) /
            (1000 * 60 * 60 * 24)
        ) + 1;

      const rentalType = String(
        equipment.rentalType || "daily"
      ).toLowerCase();

      const billingUnits =
        rentalType === "hourly"
          ? duration * 8
          : rentalType === "weekly"
            ? Math.max(1, Math.ceil(duration / 7))
            : rentalType === "monthly"
              ? Math.max(1, Math.ceil(duration / 30))
              : duration;

      const requiredQuantity = Math.max(
        toNumber(body.requiredQuantity, 1),
        1
      );

      if (
        requiredQuantity > equipment.availableQuantity
      ) {
        return res.status(400).json({
          success: false,
          message: `Only ${equipment.availableQuantity} unit(s) available.`,
        });
      }

      if (!body.contactNumber?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Contact number is required.",
        });
      }

      if (!body.deliveryAddress?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Delivery address is required.",
        });
      }

      const now = new Date();

      const totalAmount =
        billingUnits *
        requiredQuantity *
        equipment.rentalPrice;

      const booking = {
        bookingId: await buildBookingId(db),
        customerId: req.dbUser._id.toString(),
        customerName: req.dbUser.name,
        customerEmail: req.dbUser.email,
        customerPhone: req.dbUser.phone || "",
        ownerId: equipment.ownerId,
        ownerName: equipment.ownerName,
        ownerEmail: equipment.ownerEmail,
        equipmentId: equipment._id.toString(),
        equipmentName: equipment.equipmentName,
        equipmentImage: equipment.imageUrl || "",
        rentalStartDate: start.toISOString(),
        rentalEndDate: end.toISOString(),
        duration,
        billingUnits,
        rentalType,
        requiredQuantity,
        pricePerUnit: equipment.rentalPrice,
        totalAmount,
        contactNumber: body.contactNumber.trim(),
        deliveryAddress: body.deliveryAddress.trim(),
        additionalNotes:
          typeof body.additionalNotes === "string"
            ? body.additionalNotes.trim()
            : "",
        paymentStatus: "pending",
        bookingStatus: "pending",
        stripeSessionId: "",
        paymentId: "",
        bookingDate: now,
        createdAt: now,
        updatedAt: now,
      };

      const result = await db
        .collection("bookings")
        .insertOne(booking);

      return res.status(201).json({
        success: true,
        message: "Booking request created successfully.",
        booking: {
          _id: result.insertedId,
          ...booking,
        },
      });
    } catch (error) {
      console.error("Create booking error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create booking.",
      });
    }
  }
);

// --------------------------------------------------
// GET /api/bookings/my
// --------------------------------------------------

router.get(
  "/my",
  verifyToken,
  loadUser,
  async (req, res) => {
    try {
      const bookings = await getDB()
        .collection("bookings")
        .find({
          customerEmail: req.dbUser.email,
        })
        .sort({ bookingDate: -1 })
        .toArray();

      return res.status(200).json({
        success: true,
        count: bookings.length,
        bookings,
      });
    } catch (error) {
      console.error("My bookings error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load bookings.",
      });
    }
  }
);

// --------------------------------------------------
// GET /api/bookings/owner
// --------------------------------------------------

router.get(
  "/owner",
  verifyToken,
  loadUser,
  verifyRole("owner", "admin"),
  async (req, res) => {
    try {
      const filter =
        req.userRole === "admin"
          ? {}
          : { ownerEmail: req.dbUser.email };

      const bookings = await getDB()
        .collection("bookings")
        .find(filter)
        .sort({ bookingDate: -1 })
        .toArray();

      return res.status(200).json({
        success: true,
        count: bookings.length,
        bookings,
      });
    } catch (error) {
      console.error("Owner bookings error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load bookings.",
      });
    }
  }
);

// --------------------------------------------------
// GET /api/bookings
// Admin only
// --------------------------------------------------

router.get(
  "/",
  verifyToken,
  loadUser,
  verifyRole("admin"),
  async (req, res) => {
    try {
      const { q = "", status = "" } = req.query;

      const filter = {};

      if (BOOKING_STATUSES.includes(status)) {
        filter.bookingStatus = status;
      }

      if (typeof q === "string" && q.trim()) {
        const pattern = new RegExp(
          escapeRegex(q.trim()),
          "i"
        );

        filter.$or = [
          { bookingId: pattern },
          { customerName: pattern },
          { customerEmail: pattern },
          { ownerName: pattern },
          { equipmentName: pattern },
        ];
      }

      const bookings = await getDB()
        .collection("bookings")
        .find(filter)
        .sort({ bookingDate: -1 })
        .limit(500)
        .toArray();

      return res.status(200).json({
        success: true,
        count: bookings.length,
        bookings,
      });
    } catch (error) {
      console.error("List bookings error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load bookings.",
      });
    }
  }
);

// --------------------------------------------------
// GET /api/bookings/:id
// --------------------------------------------------

router.get(
  "/:id",
  verifyToken,
  loadUser,
  async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking ID.",
        });
      }

      const booking = await getDB()
        .collection("bookings")
        .findOne({
          _id: new ObjectId(req.params.id),
        });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found.",
        });
      }

      if (!canViewBooking(booking, req.dbUser)) {
        return res.status(403).json({
          success: false,
          message: "You cannot view this booking.",
        });
      }

      return res.status(200).json({
        success: true,
        booking,
      });
    } catch (error) {
      console.error("Get booking error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load booking.",
      });
    }
  }
);

// --------------------------------------------------
// PATCH /api/bookings/:id/status
// --------------------------------------------------

router.patch(
  "/:id/status",
  verifyToken,
  loadUser,
  async (req, res) => {
    try {
      const db = getDB();

      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking ID.",
        });
      }

      const booking = await db
        .collection("bookings")
        .findOne({
          _id: new ObjectId(req.params.id),
        });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found.",
        });
      }

      const isCustomer =
        booking.customerEmail === req.dbUser.email;

      const isOwner =
        booking.ownerEmail === req.dbUser.email;

      const isAdmin = req.userRole === "admin";

      if (!isCustomer && !isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message:
            "You cannot update this booking.",
        });
      }

      const body = req.body || {};
      const update = { updatedAt: new Date() };

      if (body.bookingStatus !== undefined) {
        const nextStatus = body.bookingStatus;

        if (!BOOKING_STATUSES.includes(nextStatus)) {
          return res.status(400).json({
            success: false,
            message: "Invalid booking status.",
          });
        }

        if (isCustomer && !isAdmin && !isOwner) {
          if (
            nextStatus !== "cancelled" ||
            !["pending", "confirmed"].includes(
              booking.bookingStatus
            )
          ) {
            return res.status(403).json({
              success: false,
              message:
                "You can only cancel a pending or confirmed booking.",
            });
          }
        }

        if (isOwner && !isAdmin && !isCustomer) {
          if (!OWNER_STATUSES.includes(nextStatus)) {
            return res.status(403).json({
              success: false,
              message:
                "Owners cannot set this booking status.",
            });
          }
        }

        update.bookingStatus = nextStatus;
      }

      if (body.paymentStatus !== undefined) {
        if (!isAdmin) {
          return res.status(403).json({
            success: false,
            message:
              "Only an admin can change payment status.",
          });
        }

        if (
          !PAYMENT_STATUSES.includes(body.paymentStatus)
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid payment status.",
          });
        }

        update.paymentStatus = body.paymentStatus;
      }

      if (
        update.bookingStatus === undefined &&
        update.paymentStatus === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: "Nothing to update.",
        });
      }

      await db.collection("bookings").updateOne(
        { _id: booking._id },
        { $set: update }
      );

      const updatedBooking = await db
        .collection("bookings")
        .findOne({ _id: booking._id });

      return res.status(200).json({
        success: true,
        message: "Booking updated successfully.",
        booking: updatedBooking,
      });
    } catch (error) {
      console.error("Update booking status error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update booking.",
      });
    }
  }
);

// --------------------------------------------------
// DELETE /api/bookings/:id
// Admin only
// --------------------------------------------------

router.delete(
  "/:id",
  verifyToken,
  loadUser,
  verifyRole("admin"),
  async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking ID.",
        });
      }

      const result = await getDB()
        .collection("bookings")
        .deleteOne({
          _id: new ObjectId(req.params.id),
        });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Booking not found.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Booking deleted successfully.",
      });
    } catch (error) {
      console.error("Delete booking error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete booking.",
      });
    }
  }
);

export default router;
