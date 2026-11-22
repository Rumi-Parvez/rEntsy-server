import { getDB } from "../config/db.js";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

/**
 * Attaches the MongoDB user record to the request.
 *
 * The Better Auth JWT only carries identity data (id, email, name).
 * Roles live in the "users" collection, so every protected request
 * loads the role from the database instead of trusting the client.
 */
export const loadUser = async (req, res, next) => {
  try {
    const email = req.user?.email?.toLowerCase();

    if (!email) {
      return res.status(401).json({
        success: false,
        message: "User email is missing from token.",
      });
    }

    const users = getDB().collection("users");

    let user = await users.findOne({ email });

    if (!user) {
      const now = new Date();

      const role = ADMIN_EMAILS.includes(email)
        ? "admin"
        : "customer";

      const newUser = {
        name:
          req.user?.name?.trim() ||
          email.split("@")[0],
        email,
        image: req.user?.image || "",
        phone: "",
        address: "",
        role,
        createdAt: now,
        updatedAt: now,
      };

      try {
        const result = await users.insertOne(newUser);

        user = {
          _id: result.insertedId,
          ...newUser,
        };
      } catch (error) {
        if (error?.code !== 11000) {
          throw error;
        }

        user = await users.findOne({ email });
        if (!user) {
          throw error;
        }
      }
    }

    req.dbUser = user;
    req.userRole = user.role;

    next();
  } catch (error) {
    console.error("Load user error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load user profile.",
    });
  }
};
