const path = require('path');
const crypto = require('crypto');

function getSessionSecret() {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be configured in production');
  }

  return crypto.randomBytes(32).toString('hex');
}

const config = {
  port: parseInt(process.env.E2E_PORT || process.env.PORT, 10) || 3000,
  sessionSecret: getSessionSecret(),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    }
  },
  smtpFrom: process.env.SMTP_FROM || 'no-reply@selimsystem.com',
  onesignal: {
    appId: process.env.ONESIGNAL_APP_ID || '',
    apiKey: process.env.ONESIGNAL_API_KEY || ''
  },
  isTest: process.env.NODE_ENV === 'test'
};

module.exports = config;
