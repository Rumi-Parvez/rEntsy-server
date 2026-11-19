import express from "express";

import { getDB } from "../config/db.js";
import { loadUser } from "../middleware/loadUser.js";
import { verifyRole } from "../middleware/verifyRole.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const getMonthBuckets = (count = 6) => {
  const now = new Date();

  const buckets = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(
      now.getFullYear(),
      now.getMonth() - index,
      1
    );

    buckets.push({
      year: date.getFullYear(),
      month: date.getMonth(),
      label: `${
        MONTH_LABELS[date.getMonth()]
      } ${String(date.getFullYear()).slice(-2)}`,
      value: 0,
    });
  }

  return buckets;
};

const bucketDate = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

const addToBuckets = (buckets, date, amount) => {
  const target = buckets.find(
    (bucket) =>
      bucket.year === date.getFullYear() &&
      bucket.month === date.getMonth()
  );

  if (target) {
    target.value += amount;
  }
};

const sumPaid = (bookings) =>
  bookings.reduce((total, booking) => {
    if (booking.paymentStatus !== "paid") {
      return total;
    }

    return total + (Number(booking.totalAmount) || 0);
  }, 0);

const latest = (bookings, count = 5) =>
  bookings.slice(0, count);

// --------------------------------------------------
// GET /api/analytics/admin
// --------------------------------------------------

router.get(
  "/admin",
  verifyToken,
  loadUser,
  verifyRole("admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const [
        totalUsers,
        totalEquipment,
        totalBookings,
        pendingApprovals,
        completedRentals,
        usersByRole,
        bookings,
        recentUsers,
        pendingEquipment,
      ] = await Promise.all([
        db.collection("users").countDocuments(),
        db.collection("equipment").countDocuments(),
        db.collection("bookings").countDocuments(),
        db
          .collection("equipment")
          .countDocuments({ status: "pending" }),
        db
          .collection("bookings")
          .countDocuments({ bookingStatus: "completed" }),
        db
          .collection("users")
          .aggregate([
            { $group: { _id: "$role", count: { $sum: 1 } } },
          ])
          .toArray(),
        db
          .collection("bookings")
          .find({})
          .sort({ bookingDate: -1 })
          .limit(300)
          .toArray(),
        db
          .collection("users")
          .find({})
          .sort({ createdAt: -1 })
          .limit(5)
          .toArray(),
        db
          .collection("equipment")
          .find({ status: "pending" })
          .sort({ createdAt: -1 })
          .limit(5)
          .toArray(),
      ]);

      const monthlyBookings = getMonthBuckets(6);

      const monthlyRevenue = getMonthBuckets(6);

      bookings.forEach((booking) => {
        const date = bucketDate(
          booking.bookingDate || booking.createdAt
        );

        if (!date) {
          return;
        }

        addToBuckets(monthlyBookings, date, 1);

        if (booking.paymentStatus === "paid") {
          addToBuckets(
            monthlyRevenue,
            date,
            Number(booking.totalAmount) || 0
          );
        }
      });

      const roleCounts = usersByRole.reduce(
        (accumulator, item) => {
          accumulator[item._id || "unknown"] =
            item.count;
          return accumulator;
        },
        {}
      );

      return res.status(200).json({
        success: true,
        analytics: {
          totalUsers,
          totalEquipment,
          totalBookings,
          pendingApprovals,
          completedRentals,
          totalRevenue: sumPaid(bookings),
          customers: roleCounts.customer || 0,
          owners: roleCounts.owner || 0,
          admins: roleCounts.admin || 0,
          monthlyBookings,
          monthlyRevenue,
          recentBookings: latest(bookings),
          recentUsers,
          pendingEquipment,
        },
      });
    } catch (error) {
      console.error("Admin analytics error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load analytics.",
      });
    }
  }
);

// --------------------------------------------------
// GET /api/analytics/owner
// --------------------------------------------------

router.get(
  "/owner",
  verifyToken,
  loadUser,
  verifyRole("owner", "admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const isAdmin = req.userRole === "admin";

      const equipmentFilter = isAdmin
        ? {}
        : { ownerEmail: req.dbUser.email };

      const bookingFilter = isAdmin
        ? {}
        : { ownerEmail: req.dbUser.email };

      const [
        totalEquipment,
        pendingApprovals,
        completedRentals,
        activeRentals,
        bookings,
        equipmentList,
      ] = await Promise.all([
        db
          .collection("equipment")
          .countDocuments(equipmentFilter),
        db.collection("equipment").countDocuments({
          ...equipmentFilter,
          status: "pending",
        }),
        db.collection("bookings").countDocuments({
          ...bookingFilter,
          bookingStatus: "completed",
        }),
        db.collection("bookings").countDocuments({
          ...bookingFilter,
          bookingStatus: {
            $in: ["pending", "confirmed", "ongoing"],
          },
        }),
        db
          .collection("bookings")
          .find(bookingFilter)
          .sort({ bookingDate: -1 })
          .limit(300)
          .toArray(),
        db
          .collection("equipment")
          .find(equipmentFilter)
          .sort({ createdAt: -1 })
          .limit(200)
          .toArray(),
      ]);

      const monthlyEarnings = getMonthBuckets(6);

      bookings.forEach((booking) => {
        if (booking.paymentStatus !== "paid") {
          return;
        }

        const date = bucketDate(
          booking.bookingDate || booking.createdAt
        );

        if (date) {
          addToBuckets(
            monthlyEarnings,
            date,
            Number(booking.totalAmount) || 0
          );
        }
      });

      const earningsByEquipment = new Map();

      bookings.forEach((booking) => {
        const key = booking.equipmentName;

        if (!key) {
          return;
        }

        const current = earningsByEquipment.get(key) || {
          name: key,
          bookings: 0,
          revenue: 0,
        };

        current.bookings += 1;

        if (booking.paymentStatus === "paid") {
          current.revenue +=
            Number(booking.totalAmount) || 0;
        }

        earningsByEquipment.set(key, current);
      });

      const topEquipment = Array.from(
        earningsByEquipment.values()
      )
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      return res.status(200).json({
        success: true,
        analytics: {
          totalEquipment,
          pendingApprovals,
          completedRentals,
          activeRentals,
          totalEarnings: sumPaid(bookings),
          monthlyEarnings,
          recentBookings: latest(bookings),
          topEquipment,
          equipmentList: equipmentList.slice(0, 5),
        },
      });
    } catch (error) {
      console.error("Owner analytics error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load analytics.",
      });
    }
  }
);

// --------------------------------------------------
// GET /api/analytics/customer
// --------------------------------------------------

router.get(
  "/customer",
  verifyToken,
  loadUser,
  async (req, res) => {
    try {
      const db = getDB();

      const bookingFilter = {
        customerEmail: req.dbUser.email,
      };

      const [
        totalRentals,
        activeRentals,
        completedRentals,
        favorites,
        bookings,
        recommendedEquipment,
      ] = await Promise.all([
        db.collection("bookings").countDocuments(bookingFilter),
        db.collection("bookings").countDocuments({
          ...bookingFilter,
          bookingStatus: {
            $in: ["confirmed", "ongoing"],
          },
        }),
        db.collection("bookings").countDocuments({
          ...bookingFilter,
          bookingStatus: "completed",
        }),
        db.collection("favorites").countDocuments({
          userId: req.dbUser._id.toString(),
        }),
        db
          .collection("bookings")
          .find(bookingFilter)
          .sort({ bookingDate: -1 })
          .limit(300)
          .toArray(),
        db
          .collection("equipment")
          .find({ status: "approved" })
          .sort({ createdAt: -1 })
          .limit(3)
          .toArray(),
      ]);

      const monthlyBookings = getMonthBuckets(6);

      bookings.forEach((booking) => {
        const date = bucketDate(
          booking.bookingDate || booking.createdAt
        );

        if (date) {
          addToBuckets(monthlyBookings, date, 1);
        }
      });

      return res.status(200).json({
        success: true,
        analytics: {
          totalRentals,
          activeRentals,
          completedRentals,
          favorites,
          totalSpent: sumPaid(bookings),
          monthlyBookings,
          recentBookings: latest(bookings),
          recommendedEquipment,
        },
      });
    } catch (error) {
      console.error("Customer analytics error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load analytics.",
      });
    }
  }
);

export default router;
