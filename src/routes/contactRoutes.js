import express from "express";
import { ObjectId } from "mongodb";

import { getDB } from "../config/db.js";
import { verifyRole } from "../middleware/verifyRole.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

const contactsCollection = () => getDB().collection("contacts");

/*
  POST /api/contacts
  Public: Submit a contact inquiry
*/
router.post("/", async (req, res) => {
  try {
    const { name, email, category = "General Support", message } = req.body;

    const cleanName = String(name || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanCategory = String(category || "General Support").trim();
    const cleanMessage = String(message || "").trim();

    if (!cleanName || !cleanEmail || !cleanMessage) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and message are required.",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    const newContact = {
      name: cleanName,
      email: cleanEmail,
      category: cleanCategory,
      message: cleanMessage,
      supportEmail: "help@rentsy.com",
      status: "unread",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await contactsCollection().insertOne(newContact);
    const savedContact = await contactsCollection().findOne({
      _id: result.insertedId,
    });

    return res.status(201).json({
      success: true,
      message: "Your message has been sent to help@rentsy.com!",
      contact: savedContact,
    });
  } catch (error) {
    console.error("POST /api/contacts error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit contact message.",
    });
  }
});

/*
  GET /api/contacts
  Admin only: View all contact messages
*/
router.get("/", verifyToken, verifyRole("admin"), async (req, res) => {
  try {
    const contacts = await contactsCollection()
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({
      success: true,
      count: contacts.length,
      contacts,
    });
  } catch (error) {
    console.error("GET /api/contacts error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch contact messages.",
    });
  }
});

/*
  PATCH /api/contacts/:id
  Admin only: Mark message as read/resolved
*/
router.patch("/:id", verifyToken, verifyRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid contact ID.",
      });
    }

    if (!["unread", "read", "resolved"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be unread, read, or resolved.",
      });
    }

    const result = await contactsCollection().updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Contact message not found.",
      });
    }

    return res.json({
      success: true,
      message: `Contact status updated to ${status}.`,
    });
  } catch (error) {
    console.error("PATCH /api/contacts/:id error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update contact status.",
    });
  }
});

export default router;