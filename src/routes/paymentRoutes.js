import crypto from "crypto";

import express from "express";
import { ObjectId } from "mongodb";
import Stripe from "stripe";

import { getDB } from "../config/db.js";
import { loadUser } from "../middleware/loadUser.js";
import { verifyRole } from "../middleware/verifyRole.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const CURRENCY = (process.env.STRIPE_CURRENCY || "usd").toLowerCase();
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed", "ongoing"];

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

  const count = await db.collection("bookings").countDocuments();

  return `BK-${datePart}-${String(count + 1).padStart(3, "0")}`;
};

const buildCheckoutId = () =>
  `CHK-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;

/**
 * Returns how many units are already reserved for the same equipment
 * while the requested rental window overlaps.
 */
const reservedQuantityForWindow = async (
  db,
  equipmentId,
  startIso,
  endIso
) => {
  const overlapping = await db
    .collection("bookings")
    .find({
      equipmentId,
      bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
      rentalStartDate: { $lte: endIso },
      rentalEndDate: { $gte: startIso },
    })
    .project({ requiredQuantity: 1 })
    .toArray();

  return overlapping.reduce(
    (total, booking) => total + (Number(booking.requiredQuantity) || 0),
    0
  );
};

/**
 * Validates the checkout payload and returns a fully priced draft.
 * The price is always recalculated on the server; client totals are
 * never trusted.
 */
const buildCheckoutDraft = async (db, user, body) => {
  if (!ObjectId.isValid(body.equipmentId)) {
    return { error: "A valid equipment ID is required.", status: 400 };
  }

  const equipment = await db.collection("equipment").findOne({
    _id: new ObjectId(body.equipmentId),
  });

  if (!equipment) {
    return { error: "Equipment not found.", status: 404 };
  }

  if (equipment.status !== "approved") {
    return {
      error: "This equipment is not available for booking.",
      status: 400,
    };
  }

  const start = parseDate(body.rentalStartDate);
  const end = parseDate(body.rentalEndDate);

  if (!start || !end || end < start) {
    return {
      error: "Valid rental start and end dates are required.",
      status: 400,
    };
  }

  const duration =
    Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const requiredQuantity = Math.max(
    Math.floor(toNumber(body.requiredQuantity, 1)),
    1
  );

  const contactNumber = String(body.contactNumber || "").trim();
  const deliveryAddress = String(body.deliveryAddress || "").trim();

  if (!contactNumber) {
    return { error: "Contact number is required.", status: 400 };
  }

  if (!deliveryAddress) {
    return { error: "Delivery address is required.", status: 400 };
  }

  if (requiredQuantity > (Number(equipment.availableQuantity) || 0)) {
    return {
      error: `Only ${equipment.availableQuantity} unit(s) available.`,
      status: 400,
    };
  }

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const reserved = await reservedQuantityForWindow(
    db,
    equipment._id.toString(),
    startIso,
    endIso
  );

  if (
    reserved + requiredQuantity >
    (Number(equipment.availableQuantity) || 0)
  ) {
    const remaining = Math.max(
      0,
      (Number(equipment.availableQuantity) || 0) - reserved
    );

    return {
      error: `Only ${remaining} unit(s) are available for the selected dates.`,
      status: 409,
    };
  }

  const pricePerUnit = Number(equipment.rentalPrice) || 0;
  const totalAmount = pricePerUnit * duration * requiredQuantity;

  if (totalAmount <= 0) {
    return {
      error: "This equipment does not have a valid rental price.",
      status: 400,
    };
  }

  return {
    equipment,
    draft: {
      checkoutId: buildCheckoutId(),
      customerId: String(user._id),
      customerName: user.name || "",
      customerEmail: user.email,
      ownerId: equipment.ownerId || "",
      ownerName: equipment.ownerName || "",
      ownerEmail: equipment.ownerEmail || "",
      equipmentId: equipment._id.toString(),
      equipmentName: equipment.equipmentName || "",
      equipmentImage: equipment.imageUrl || "",
      rentalStartDate: startIso,
      rentalEndDate: endIso,
      duration,
      requiredQuantity,
      pricePerUnit,
      totalAmount,
      currency: CURRENCY,
      contactNumber,
      deliveryAddress,
      additionalNotes:
        typeof body.additionalNotes === "string"
          ? body.additionalNotes.trim()
          : "",
    },
  };
};

/**
 * Creates the booking and transaction record once the payment is
 * confirmed. Safe to call more than once: an existing booking for the
 * same checkout is returned instead of duplicated.
 */
const finalizePayment = async (db, payment, transaction = {}) => {
  const existingBooking = await db.collection("bookings").findOne({
    checkoutId: payment.checkoutId,
  });

  if (existingBooking) {
    await db.collection("payments").updateOne(
      { _id: payment._id },
      {
        $set: {
          status: "paid",
          bookingId: existingBooking._id.toString(),
          updatedAt: new Date(),
        },
        $unset: { expiresAt: "" },
      }
    );

    return { booking: existingBooking, alreadyProcessed: true };
  }

  const equipment = ObjectId.isValid(payment.equipmentId)
    ? await db.collection("equipment").findOne({
        _id: new ObjectId(payment.equipmentId),
      })
    : null;

  if (!equipment || equipment.status !== "approved") {
    await db.collection("payments").updateOne(
      { _id: payment._id },
      {
        $set: {
          status: "failed",
          failureReason: "Equipment is no longer available.",
          updatedAt: new Date(),
        },
        $unset: { expiresAt: "" },
      }
    );

    const error = new Error(
      "This equipment is no longer available. Please contact support."
    );
    error.statusCode = 409;
    throw error;
  }

  const reserved = await reservedQuantityForWindow(
    db,
    payment.equipmentId,
    payment.rentalStartDate,
    payment.rentalEndDate
  );

  if (
    reserved + payment.requiredQuantity >
    (Number(equipment.availableQuantity) || 0)
  ) {
    await db.collection("payments").updateOne(
      { _id: payment._id },
      {
        $set: {
          status: "failed",
          failureReason: "Selected dates are fully booked.",
          updatedAt: new Date(),
        },
        $unset: { expiresAt: "" },
      }
    );

    const error = new Error(
      "The selected dates are no longer available. Please choose another window."
    );
    error.statusCode = 409;
    throw error;
  }

  const now = new Date();

  const booking = {
    bookingId: await buildBookingId(db),
    checkoutId: payment.checkoutId,
    customerId: payment.customerId,
    customerName: payment.customerName,
    customerEmail: payment.customerEmail,
    customerPhone: payment.contactNumber,
    ownerId: payment.ownerId,
    ownerName: payment.ownerName,
    ownerEmail: payment.ownerEmail,
    equipmentId: payment.equipmentId,
    equipmentName: payment.equipmentName,
    equipmentImage: payment.equipmentImage,
    rentalStartDate: payment.rentalStartDate,
    rentalEndDate: payment.rentalEndDate,
    duration: payment.duration,
    requiredQuantity: payment.requiredQuantity,
    pricePerUnit: payment.pricePerUnit,
    totalAmount: payment.totalAmount,
    contactNumber: payment.contactNumber,
    deliveryAddress: payment.deliveryAddress,
    additionalNotes: payment.additionalNotes || "",
    paymentStatus: "paid",
    paymentProvider: payment.provider,
    transactionId:
      transaction.transactionId || `DEMO-${payment.checkoutId}`,
    bookingStatus: "pending",
    stripeSessionId: payment.stripeSessionId || "",
    paymentId: payment._id.toString(),
    bookingDate: now,
    createdAt: now,
    updatedAt: now,
  };

  let createdBooking;

  try {
    const result = await db.collection("bookings").insertOne(booking);
    createdBooking = { _id: result.insertedId, ...booking };
  } catch (error) {
    // A unique index on checkoutId protects against concurrent
    // verification (redirect + webhook) creating two bookings.
    if (error?.code === 11000) {
      createdBooking = await db.collection("bookings").findOne({
        checkoutId: payment.checkoutId,
      });
    } else {
      throw error;
    }
  }

  await db.collection("payments").updateOne(
    { _id: payment._id },
    {
      $set: {
        status: "paid",
        bookingId: createdBooking?._id?.toString() || "",
        transactionId:
          transaction.transactionId || `DEMO-${payment.checkoutId}`,
        stripePaymentIntentId:
          transaction.paymentIntentId ||
          payment.stripePaymentIntentId ||
          "",
        paidAmount: Number(transaction.amount) || payment.totalAmount,
        paidCurrency: transaction.currency || payment.currency,
        paidAt: now,
        updatedAt: now,
      },
      $unset: { expiresAt: "" },
    }
  );

  return { booking: createdBooking, alreadyProcessed: false };
};

// --------------------------------------------------
// POST /api/payments/webhook
// Mounted before express.json so Stripe receives the raw body.
// --------------------------------------------------

export const stripeWebhook = async (req, res) => {
  if (!stripe) {
    return res.status(200).json({ received: true, mode: "demo" });
  }

  let event;

  try {
    if (STRIPE_WEBHOOK_SECRET) {
      const signature = req.headers["stripe-signature"];

      if (!signature) {
        return res.status(400).json({
          success: false,
          message: "Missing Stripe signature.",
        });
      }

      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        STRIPE_WEBHOOK_SECRET
      );
    } else {
      event =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : JSON.parse(req.body.toString("utf8"));
    }
  } catch (error) {
    console.error("Stripe webhook signature error:", error.message);

    return res.status(400).json({
      success: false,
      message: "Invalid webhook payload.",
    });
  }

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object;
      const db = getDB();

      const payment = await db.collection("payments").findOne({
        $or: [
          { stripeSessionId: session.id },
          { checkoutId: session.metadata?.checkoutId || "__none__" },
        ],
      });

      if (payment && payment.status !== "paid") {
        await finalizePayment(db, payment, {
          transactionId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.id,
          paymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : "",
          amount: session.amount_total ? session.amount_total / 100 : undefined,
          currency: session.currency,
        });
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed.",
    });
  }
};

// --------------------------------------------------
// POST /api/payments/checkout
// Creates a Stripe Checkout session (or a demo session when no key is
// configured) and stores the priced draft in the payments collection.
// --------------------------------------------------

router.post(
  "/checkout",
  verifyToken,
  loadUser,
  verifyRole("customer", "owner", "admin"),
  async (req, res) => {
    try {
      const db = getDB();
      const body = req.body || {};

      const result = await buildCheckoutDraft(db, req.dbUser, body);

      if (result.error) {
        return res.status(result.status).json({
          success: false,
          message: result.error,
        });
      }

      const now = new Date();
      const draft = {
        ...result.draft,
        provider: stripe ? "stripe" : "demo",
        status: "pending",
        stripeSessionId: "",
        stripePaymentIntentId: "",
        bookingId: "",
        createdAt: now,
        updatedAt: now,
        // Pending checkouts are cleaned up automatically after 24 hours.
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      };

      if (!stripe) {
        const insert = await db.collection("payments").insertOne(draft);

        return res.status(201).json({
          success: true,
          mode: "demo",
          message:
            "Demo checkout ready. Stripe is not configured, so the payment will be simulated.",
          checkoutId: draft.checkoutId,
          paymentId: insert.insertedId,
          redirectUrl: `/payment/success?checkout=${encodeURIComponent(
            draft.checkoutId
          )}`,
          totalAmount: draft.totalAmount,
          currency: draft.currency,
        });
      }

      const unitAmount = Math.max(
        50,
        Math.round(draft.totalAmount * 100)
      );

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: draft.customerEmail,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: CURRENCY,
              unit_amount: unitAmount,
              product_data: {
                name: draft.equipmentName,
                description: `${draft.duration} day(s) × ${draft.requiredQuantity} unit(s)`,
              },
            },
          },
        ],
        metadata: {
          checkoutId: draft.checkoutId,
          equipmentId: draft.equipmentId,
          customerEmail: draft.customerEmail,
        },
        success_url: `${CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${CLIENT_URL}/equipment/${draft.equipmentId}?payment=cancelled`,
      });

      draft.stripeSessionId = session.id;

      const insert = await db.collection("payments").insertOne(draft);

      return res.status(201).json({
        success: true,
        mode: "stripe",
        message: "Redirecting to secure checkout.",
        checkoutId: draft.checkoutId,
        paymentId: insert.insertedId,
        sessionId: session.id,
        url: session.url,
        totalAmount: draft.totalAmount,
        currency: draft.currency,
      });
    } catch (error) {
      console.error("Create checkout error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to start checkout. Please try again.",
      });
    }
  }
);

// --------------------------------------------------
// POST /api/payments/verify
// Confirms a Stripe session (or demo checkout) and creates the
// booking + transaction records.
// --------------------------------------------------

router.post(
  "/verify",
  verifyToken,
  loadUser,
  async (req, res) => {
    try {
      const db = getDB();
      const { sessionId, checkoutId } = req.body || {};

      if (!sessionId && !checkoutId) {
        return res.status(400).json({
          success: false,
          message: "A session or checkout reference is required.",
        });
      }

      const filter = sessionId
        ? { stripeSessionId: String(sessionId) }
        : { checkoutId: String(checkoutId) };

      let payment = await db.collection("payments").findOne(filter);

      if (!payment && sessionId && stripe) {
        const session = await stripe.checkout.sessions.retrieve(
          String(sessionId)
        );

        const paymentCheckoutId = session.metadata?.checkoutId;

        if (paymentCheckoutId) {
          payment = await db.collection("payments").findOne({
            checkoutId: paymentCheckoutId,
          });
        }
      }

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Checkout session not found.",
        });
      }

      const isOwner =
        payment.customerEmail === req.dbUser.email ||
        req.userRole === "admin";

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: "You cannot verify this payment.",
        });
      }

      if (payment.status === "paid" && payment.bookingId) {
        const booking = ObjectId.isValid(payment.bookingId)
          ? await db.collection("bookings").findOne({
              _id: new ObjectId(payment.bookingId),
            })
          : null;

        return res.status(200).json({
          success: true,
          alreadyProcessed: true,
          payment,
          booking,
        });
      }

      let transaction = {};

      if (payment.provider === "stripe") {
        if (!stripe) {
          return res.status(503).json({
            success: false,
            message: "Stripe is not configured on the server.",
          });
        }

        const reference = sessionId || payment.stripeSessionId;

        if (!reference) {
          return res.status(400).json({
            success: false,
            message: "Stripe session reference is missing.",
          });
        }

        const session = await stripe.checkout.sessions.retrieve(reference);

        if (session.payment_status !== "paid") {
          return res.status(402).json({
            success: false,
            message:
              "Payment has not been completed yet. If you were charged, refresh this page in a moment.",
          });
        }

        transaction = {
          transactionId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.id,
          paymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : "",
          amount: session.amount_total ? session.amount_total / 100 : undefined,
          currency: session.currency,
        };
      }

      const finalized = await finalizePayment(db, payment, transaction);

      const updatedPayment = await db
        .collection("payments")
        .findOne({ _id: payment._id });

      return res.status(200).json({
        success: true,
        alreadyProcessed: finalized.alreadyProcessed,
        payment: updatedPayment,
        booking: finalized.booking,
      });
    } catch (error) {
      console.error("Verify payment error:", error);

      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.statusCode === 409
            ? error.message
            : "Failed to verify the payment.",
      });
    }
  }
);

// --------------------------------------------------
// GET /api/payments
// Admin transaction ledger
// --------------------------------------------------

router.get(
  "/",
  verifyToken,
  loadUser,
  verifyRole("admin"),
  async (req, res) => {
    try {
      const { status = "" } = req.query;
      const filter = {};

      if (["pending", "paid", "failed", "cancelled"].includes(status)) {
        filter.status = status;
      }

      const payments = await getDB()
        .collection("payments")
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray();

      return res.status(200).json({
        success: true,
        count: payments.length,
        payments,
      });
    } catch (error) {
      console.error("List payments error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load payments.",
      });
    }
  }
);

// --------------------------------------------------
// GET /api/payments/mine
// --------------------------------------------------

router.get(
  "/mine",
  verifyToken,
  loadUser,
  async (req, res) => {
    try {
      const payments = await getDB()
        .collection("payments")
        .find({
          customerEmail: req.dbUser.email,
          status: "paid",
        })
        .sort({ paidAt: -1 })
        .limit(200)
        .toArray();

      return res.status(200).json({
        success: true,
        count: payments.length,
        payments,
      });
    } catch (error) {
      console.error("My payments error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load payments.",
      });
    }
  }
);

export default router;
