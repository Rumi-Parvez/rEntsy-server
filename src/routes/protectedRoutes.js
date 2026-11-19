import express from "express";

import { verifyRole } from "../middleware/verifyRole.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

/*
  Any logged-in user
*/
router.get("/profile", verifyToken, (req, res) => {
  res.json({
    success: true,
    message: "You are authenticated",
    user: req.user,
  });
});

/*
  Customer only
*/
router.get(
  "/customer",
  verifyToken,
  verifyRole("customer"),
  (req, res) => {
    res.json({
      success: true,
      message: "Welcome Customer",
      user: req.user,
    });
  }
);

/*
  Owner only
*/
router.get(
  "/owner",
  verifyToken,
  verifyRole("owner"),
  (req, res) => {
    res.json({
      success: true,
      message: "Welcome Owner",
      user: req.user,
    });
  }
);

/*
  Admin only
*/
router.get(
  "/admin",
  verifyToken,
  verifyRole("admin"),
  (req, res) => {
    res.json({
      success: true,
      message: "Welcome Admin",
      user: req.user,
    });
  }
);

/*
  Owner + Admin
*/
router.get(
  "/owner-admin",
  verifyToken,
  verifyRole("owner", "admin"),
  (req, res) => {
    res.json({
      success: true,
      message: "Owner/Admin access granted",
      user: req.user,
    });
  }
);

export default router;