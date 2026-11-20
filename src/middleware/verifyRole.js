/**
 * Role guard.
 *
 * Roles are never trusted from the client or from JWT claims.
 * `loadUser` must run before this middleware so the role comes from
 * the MongoDB user record only.
 */
export const verifyRole = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.dbUser?.role;

    if (!userRole) {
      return res.status(403).json({
        success: false,
        message:
          "Your account role could not be verified. Please sign in again.",
      });
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission",
      });
    }

    next();
  };
};
