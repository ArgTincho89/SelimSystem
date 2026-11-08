const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.auth.user,
        pass: config.smtp.auth.pass
      }
    });
  }
  return transporter;
}

async function sendPasswordResetEmail(email, token) {
  const resetUrl = `${config.appUrl}/#/reset-password?token=${token}`;

  const mailOptions = {
    from: config.smtpFrom,
    to: email,
    subject: 'SelimSystem - Restablecer contraseña',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Restablecer contraseña</h2>
        <p>Hemos recibido una solicitud para restablecer tu contraseña.</p>
        <p>Haz clic en el siguiente enlace (válido por 1 hora):</p>
        <a href="${resetUrl}" 
           style="display: inline-block; padding: 12px 24px; background-color: #4ECDC4; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Restablecer contraseña
        </a>
        <p style="color: #666; font-size: 14px;">Si no solicitaste este cambio, ignora este email.</p>
      </div>
    `
  };

  try {
    await getTransporter().sendMail(mailOptions);
    console.log(`[EMAIL] Password reset enviado a ${email}`);
  } catch (err) {
    console.error('[EMAIL] Error enviando email:', err.message);
  }
}

async function sendDailyReminder(email) {
  const mailOptions = {
    from: config.smtpFrom,
    to: email,
    subject: 'SelimSystem - ¿Cargaste tus gastos de hoy?',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Recordatorio diario</h2>
        <p>No olvides registrar tus gastos e ingresos de hoy en SelimSystem.</p>
        <a href="${config.appUrl}" 
           style="display: inline-block; padding: 12px 24px; background-color: #4ECDC4; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Abrir SelimSystem
        </a>
      </div>
    `
  };

  try {
    await getTransporter().sendMail(mailOptions);
    console.log(`[EMAIL] Daily reminder enviado a ${email}`);
  } catch (err) {
    console.error('[EMAIL] Error enviando reminder:', err.message);
  }
}

module.exports = { sendPasswordResetEmail, sendDailyReminder };
