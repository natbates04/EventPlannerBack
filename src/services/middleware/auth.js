// middleware/auth.js
const crypto = require('crypto');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  const userId = req.headers['x-user-id']; // or wherever you're sending it from frontend

  const expectedToken = crypto
    .createHash('sha256')
    .update(userId + process.env.SECRET_KEY)
    .digest('hex');

  if (token !== expectedToken) {
    return res.status(403).json({ message: "Invalid token" });
  }

  next(); // token valid, proceed to route
}

module.exports = authMiddleware;
