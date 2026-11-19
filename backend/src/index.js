const jwt = require('jsonwebtoken');

/**
 * Verifies the Bearer JWT from the Authorization header.
 * Attaches decoded payload to req.user.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role, fullName }
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

/**
 * Restricts access to specific roles.
 * Usage: authorize('Admin') or authorize('Admin', 'Seller')
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
