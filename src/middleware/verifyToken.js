import { createRemoteJWKSet, jwtVerify } from "jose";

const jwksUrl = process.env.BETTER_AUTH_JWKS_URL;

if (!jwksUrl) {
  throw new Error("BETTER_AUTH_JWKS_URL is not defined in .env");
}

const JWKS = createRemoteJWKSet(new URL(jwksUrl));

// Better Auth signs tokens with the app base URL as both issuer and
// audience. Allow explicit overrides for deployments that use a
// dedicated auth domain.
const expectedIssuer =
  process.env.JWT_ISSUER ||
  process.env.CLIENT_URL ||
  "http://localhost:3000";

const expectedAudience =
  process.env.JWT_AUDIENCE ||
  process.env.CLIENT_URL ||
  "http://localhost:3000";

export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authorization header is missing",
      });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token is missing",
      });
    }

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: expectedIssuer,
      audience: expectedAudience,
      algorithms: ["EdDSA", "RS256", "ES256"],
    });

    if (!payload?.sub && !payload?.email) {
      return res.status(401).json({
        success: false,
        message: "Access token is missing an identity claim",
      });
    }

    req.user = payload;
    req.auth = {
      sub: payload.sub,
      email:
        typeof payload.email === "string"
          ? payload.email.toLowerCase()
          : undefined,
    };

    next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
    });
  }
};