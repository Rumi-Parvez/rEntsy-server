export const verifyRole = (...allowedRoles) => {
  return (req, res, next) => {
    // Prefer the role loaded from the database (loadUser middleware).
    // Fall back to a token claim only when no database role is present.
    const userRole = req.userRole || req.dbUser?.role || req.user?.role;

    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: "User role is missing",
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
