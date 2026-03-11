// ============================================
// La Maison du Regard — JWT Authentication Middleware
// ============================================

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { ApiError } = require('../utils/errors');

/**
 * Middleware: Require valid JWT access token
 * Attaches decoded user info to req.user
 */
function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Token d\'authentification manquant');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);

    req.user = {
      id: decoded.id,
      type: decoded.type, // 'practitioner' or 'client'
      email: decoded.email,
      name: decoded.name,
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    if (error.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Session expirée, veuillez vous reconnecter'));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(ApiError.unauthorized('Token invalide'));
    }
    next(ApiError.unauthorized());
  }
}

/**
 * Middleware: Require practitioner role (for dashboard access)
 * Must be used AFTER requireAuth
 */
function requirePractitioner(req, res, next) {
  if (!req.user || req.user.type !== 'practitioner') {
    return next(ApiError.forbidden('Accès réservé à la praticienne'));
  }
  next();
}

/**
 * Middleware: Require client role
 * Must be used AFTER requireAuth
 */
function requireClient(req, res, next) {
  if (!req.user || req.user.type !== 'client') {
    return next(ApiError.forbidden('Accès réservé aux clients'));
  }
  next();
}

/**
 * Middleware: Optional auth — attaches user if token present, continues if not
 */
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = {
      id: decoded.id,
      type: decoded.type,
      email: decoded.email,
      name: decoded.name,
    };
  } catch {
    // Invalid token — continue without user
  }
  next();
}

/**
 * Generate JWT access token
 * Practitioner: 7 days (dashboard PWA needs long sessions)
 * Clients: 15 min (public booking, short-lived)
 */
function generateAccessToken(user) {
  const expiresIn = user.type === 'practitioner'
    ? config.practitionerAccessExpiresIn
    : config.clientAccessExpiresIn;
  return jwt.sign(
    {
      id: user.id,
      type: user.type,
      email: user.email,
      name: user.name,
    },
    config.jwtSecret,
    { expiresIn }
  );
}

/**
 * Generate JWT refresh token (long-lived: 90 days)
 */
function generateRefreshToken(user) {
  return jwt.sign(
    {
      id: user.id,
      type: user.type,
    },
    config.jwtRefreshSecret,
    { expiresIn: config.refreshExpiresIn }
  );
}

module.exports = {
  requireAuth,
  requirePractitioner,
  requireClient,
  optionalAuth,
  generateAccessToken,
  generateRefreshToken,
};
