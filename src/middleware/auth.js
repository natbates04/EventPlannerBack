const jwt = require("jsonwebtoken");
const { promisify } = require("util");

const verifyToken = promisify(jwt.verify);

const authenticateToken = async (req, res, next) => {
  try {
    // Skip authentication in test mode
    if (process.env.NODE_ENV === "test") {
      req.user = { id: "test-user-id" }; // Optionally mock a user object
      return next();
    }

    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.status(401).json({ message: "No token provided" });

    const decoded = await verifyToken(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid token" });
  }
};

module.exports = authenticateToken;
