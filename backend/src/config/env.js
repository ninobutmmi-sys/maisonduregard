// ============================================
// La Maison du Regard — Environment Configuration
// ============================================

require('dotenv').config();

// Validate required environment variables at startup
const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

// Warn about critical optional vars in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.BREVO_API_KEY) {
    console.error('WARNING: BREVO_API_KEY is not set — all emails and SMS will silently fail!');
  }
  if (!process.env.SITE_URL) {
    console.error('WARNING: SITE_URL is not set — email links will point to localhost!');
  }
  if (!process.env.API_URL) {
    console.error('WARNING: API_URL is not set — SMS links will point to localhost!');
  }
}

const REFRESH_EXPIRES_MS = 90 * 24 * 60 * 60 * 1000; // 90 days in ms

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5500,http://localhost:5175')
    .split(',')
    .map((s) => s.trim()),
  brevo: {
    apiKey: process.env.BREVO_API_KEY || '',
    senderEmail: process.env.BREVO_SENDER_EMAIL || 'noreply@lamaisonduregard.fr',
    senderName: process.env.BREVO_SENDER_NAME || 'La Maison du Regard',
    smsSender: process.env.BREVO_SMS_SENDER || 'MAISONDUREG',
  },
  googleReviewUrl: process.env.GOOGLE_REVIEW_URL || '',
  siteUrl: process.env.SITE_URL || 'http://localhost:5500',
  apiUrl: process.env.API_URL || `http://localhost:${parseInt(process.env.PORT, 10) || 3000}`,

  // Salon info (single salon)
  salon: {
    name: 'La Maison du Regard',
    address: '26 Av. du Grésivaudan, 38700 Corenc',
    mapsUrl: 'https://maps.google.com/?q=26+Av+du+Gr%C3%A9sivaudan+38700+Corenc',
    bookingPath: '/pages',
  },

  // Token durations
  practitionerAccessExpiresIn: '7d',  // Dashboard PWA
  clientAccessExpiresIn: '15m',       // Short-lived for clients
  refreshExpiresIn: '90d',
  refreshExpiresMs: REFRESH_EXPIRES_MS,
};
