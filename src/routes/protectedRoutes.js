import express from "express";

import { loadUser } from "../middleware/loadUser.js";
import { verifyRole } from "../middleware/verifyRole.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

/*
  Any logged-in user
*/
router.get("/profile", verifyToken, loadUser, (req, res) => {
  res.json({
    success: true,
    message: "You are authenticated",
    user: req.dbUser,
  });
});

/*
  Customer only
*/
router.get(
  "/customer",
  verifyToken,
  loadUser,
  verifyRole("customer"),
  (req, res) => {
    res.json({
      success: true,
      message: "Welcome Customer",
      user: req.dbUser,
    });
  }
);

/*
  Owner only
*/
router.get(
  "/owner",
  verifyToken,
  loadUser,
  verifyRole("owner"),
  (req, res) => {
    res.json({
      success: true,
      message: "Welcome Owner",
      user: req.dbUser,
    });
  }
);

/*
  Admin only
*/
router.get(
  "/admin",
  verifyToken,
  loadUser,
  verifyRole("admin"),
  (req, res) => {
    res.json({
      success: true,
      message: "Welcome Admin",
      user: req.dbUser,
    });
  }
);

/*
  Owner + Admin
*/
router.get(
  "/owner-admin",
  verifyToken,
  loadUser,
  verifyRole("owner", "admin"),
  (req, res) => {
    res.json({
      success: true,
      message: "Owner/Admin access granted",
      user: req.dbUser,
    });
  }
);

export default router;
