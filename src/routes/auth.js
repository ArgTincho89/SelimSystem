const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../services/email');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, nombre } = req.body;

    if (!email || !password || !nombre) {
      return res.status(400).json({ error: 'Email, contraseña y nombre son obligatorios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    const db = req.app.locals.db;

    if (db.findUserByName(nombre)) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese nombre de usuario' });
    }

    if (db.findUserByEmail(email.toLowerCase())) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = db.createUser({
      email: email.toLowerCase(),
      password: hashedPassword,
      nombre
    });

    req.session.userId = user.id;

    res.status(201).json({
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      photo: user.photo || null
    });
  } catch (err) {
    console.error('[REGISTER]', err);
    res.status(500).json({ error: 'Error al crear la cuenta' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { nombre, password } = req.body;

    if (!nombre || !password) {
      return res.status(400).json({ error: 'Nombre y contraseña son obligatorios' });
    }

    const db = req.app.locals.db;
    const user = db.findUserByName(nombre);
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    req.session.userId = user.id;

    res.json({
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      photo: user.photo || null
    });
  } catch (err) {
    console.error('[LOGIN]', err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Error al cerrar sesión' });
    }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const db = req.app.locals.db;
  const user = db.findUserById(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'Usuario no encontrado' });
  }

  res.json({
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    photo: user.photo || null
  });
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email obligatorio' });
    }

    const db = req.app.locals.db;
    const user = db.findUserByEmail(email.toLowerCase());

    if (!user) {
      return res.json({ ok: true, message: 'Si el email existe, recibirás un enlace de recuperación' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 60 * 60 * 1000;

    db.updateUser(user.id, {
      resetToken: token,
      resetTokenExpires: expires
    });

    await sendPasswordResetEmail(user.email, token);

    res.json({ ok: true, message: 'Si el email existe, recibirás un enlace de recuperación' });
  } catch (err) {
    console.error('[FORGOT-PASSWORD]', err);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token y nueva contraseña son obligatorios' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const db = req.app.locals.db;
    const users = db.findAll('users');
    const user = users.find(u => u.resetToken === token && u.resetTokenExpires > Date.now());

    if (!user) {
      return res.status(400).json({ error: 'Token inválido o expirado' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    db.updateUser(user.id, {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpires: null
    });

    res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('[RESET-PASSWORD]', err);
    res.status(500).json({ error: 'Error al restablecer contraseña' });
  }
});

router.post('/change-password', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Contraseña actual y nueva contraseña son obligatorias' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    const db = req.app.locals.db;
    const user = db.findUserById(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    db.updateUser(user.id, { password: hashedPassword });

    res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('[CHANGE-PASSWORD]', err);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

router.post('/change-email', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    const db = req.app.locals.db;
    const user = db.findUserById(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'La contraseña es incorrecta' });
    }

    const existing = db.findUserByEmail(email.toLowerCase());
    if (existing && existing.id !== user.id) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
    }

    db.updateUser(user.id, { email: email.toLowerCase() });

    res.json({ ok: true, email: email.toLowerCase(), message: 'Email actualizado correctamente' });
  } catch (err) {
    console.error('[CHANGE-EMAIL]', err);
    res.status(500).json({ error: 'Error al cambiar email' });
  }
});

router.put('/photo', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const { photo } = req.body;
  if (!photo || typeof photo !== 'string') {
    return res.status(400).json({ error: 'Foto requerida (base64 data URL)' });
  }

  if (!photo.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Formato de imagen inválido' });
  }

  if (photo.length > 500000) {
    return res.status(400).json({ error: 'La imagen no puede superar 500KB' });
  }

  const db = req.app.locals.db;
  const user = db.findUserById(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'Usuario no encontrado' });
  }

  db.updateUser(user.id, { photo });

  res.json({ ok: true, photo });
});

router.delete('/photo', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const db = req.app.locals.db;
  const user = db.findUserById(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'Usuario no encontrado' });
  }

  db.updateUser(user.id, { photo: null });

  res.json({ ok: true });
});

router.delete('/account', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const db = req.app.locals.db;
  const userId = req.session.userId;
  const user = db.findUserById(userId);
  if (!user) {
    return res.status(401).json({ error: 'Usuario no encontrado' });
  }

  db.deleteUserById(userId);

  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Error al cerrar sesión' });
    }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

module.exports = router;
