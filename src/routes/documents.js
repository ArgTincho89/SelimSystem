const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { TextDecoder } = require('util');
const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const CONTENT_TYPES = {
  pdf: { contentType: 'application/pdf', extensions: ['.pdf'] },
  png: { contentType: 'image/png', extensions: ['.png'] },
  jpeg: { contentType: 'image/jpeg', extensions: ['.jpg', '.jpeg'] },
  webp: { contentType: 'image/webp', extensions: ['.webp'] },
  text: { contentType: 'text/plain; charset=utf-8', extensions: ['.txt'] }
};

const storage = multer.diskStorage({
  destination(req, file, callback) {
    try {
      callback(null, req.app.locals.documentStorage.ensureUserDirectory(req.session.userId));
    } catch (error) {
      callback(error);
    }
  },
  filename(req, file, callback) {
    crypto.randomBytes(24, (error, bytes) => callback(error, error ? undefined : `${bytes.toString('hex')}.bin`));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 2, parts: 3, fieldNameSize: 50, fieldSize: 512 }
});

function cleanDisplayName(originalName) {
  const basename = path.posix.basename(String(originalName || '').replace(/\\/g, '/'));
  return basename.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180) || 'document';
}

function detectFileType(buffer) {
  if (buffer.subarray(0, 2).toString('ascii') === 'MZ'
    || buffer.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
    || buffer.subarray(0, 4).toString('ascii') === 'PK\x03\x04'
    || buffer.subarray(0, 4).toString('ascii') === 'Rar!'
    || buffer.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))
    || buffer.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]))
    || [[0xfe, 0xed, 0xfa, 0xce], [0xfe, 0xed, 0xfa, 0xcf], [0xce, 0xfa, 0xed, 0xfe], [0xcf, 0xfa, 0xed, 0xfe], [0xca, 0xfe, 0xba, 0xbe], [0x00, 0x61, 0x73, 0x6d]]
      .some(signature => buffer.subarray(0, signature.length).equals(Buffer.from(signature)))) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  const pdfHeader = buffer.subarray(0, 1024).toString('latin1').match(/^\s*%PDF-/);
  const pdfTail = buffer.subarray(Math.max(0, buffer.length - 2048)).toString('latin1');
  if (pdfHeader && pdfTail.includes('%%EOF')) return 'pdf';
  return null;
}

async function inspectFile(file) {
  const bytes = await fs.promises.readFile(file.path);
  const detectedType = detectFileType(bytes);
  let type = detectedType;
  if (!type) {
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return null;
    }
    if (text.includes('\u0000') || /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return null;
    if (/<\s*(?:!doctype\b|html|head|body|script|style|svg|iframe|object|embed|img|video|audio|link|meta|form|input)\b|(?:^|[<\s])on[a-z]+\s*=|javascript\s*:/i.test(text)) return null;
    type = 'text';
  }

  const displayName = cleanDisplayName(file.originalname);
  const extension = path.posix.extname(displayName).toLowerCase();
  const definition = CONTENT_TYPES[type];
  if (!definition.extensions.includes(extension)) return null;
  return { bytes: bytes.length, contentType: definition.contentType, displayName, type };
}

function targetFor(db, userId, body) {
  const assetId = typeof body.assetId === 'string' && body.assetId ? body.assetId : null;
  const entityId = typeof body.entityId === 'string' && body.entityId ? body.entityId : null;
  const obligationId = typeof body.obligationId === 'string' && body.obligationId ? body.obligationId : null;
  const contractId = typeof body.contractId === 'string' && body.contractId ? body.contractId : null;
  if ([assetId, entityId, obligationId, contractId].filter(Boolean).length !== 1) return null;
  if (assetId) {
    return db.findById('assets', assetId, userId) ? { assetId, entityId: null, obligationId: null, contractId: null } : null;
  }
  if (entityId) return db.findById('legalOwners', entityId, userId) ? { assetId: null, entityId, obligationId: null, contractId: null } : null;
  if (obligationId) return db.findById('obligations', obligationId, userId) ? { assetId: null, entityId: null, obligationId, contractId: null } : null;
  return db.findById('rentalContracts', contractId, userId) ? { assetId: null, entityId: null, obligationId: null, contractId } : null;
}

function publicMetadata(document) {
  const { storageKey, ...metadata } = document;
  return metadata;
}

function uploadMiddleware(req, res, next) {
  upload.single('file')(req, res, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'El archivo supera el límite de 20 MiB' });
    }
    if (error instanceof multer.MulterError) return res.status(400).json({ error: 'La carga del archivo no es válida' });
    return res.status(500).json({ error: 'No se pudo guardar el archivo' });
  });
}

router.get('/', (req, res) => {
  const target = targetFor(req.app.locals.db, req.session.userId, req.query);
  if (!target) return res.status(400).json({ error: 'Indica un bien, una persona u organización, una obligación o un contrato válido' });
  const documents = req.app.locals.db.findAll('documents', req.session.userId)
    .filter(item => item.assetId === target.assetId && item.entityId === target.entityId && (item.obligationId || null) === target.obligationId && (item.contractId || null) === target.contractId)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  res.json(documents.map(publicMetadata));
});

router.post('/', uploadMiddleware, async (req, res) => {
  const userId = req.session.userId;
  const db = req.app.locals.db;
  const file = req.file;
  const discardUpload = () => {
    if (!file) return;
    try {
      const metadata = db.findAll('documents', userId).find(item => item.storageKey === file.filename);
      if (metadata) db.remove('documents', metadata.id, userId);
    } catch {}
    try { req.app.locals.documentStorage.remove(userId, file.filename); } catch {}
  };
  if (!file) return res.status(400).json({ error: 'Selecciona un archivo' });
  const target = targetFor(db, userId, req.body || {});
   if (!target) {
    discardUpload();
      return res.status(400).json({ error: 'Indica un bien, una persona u organización, una obligación o un contrato válido' });
  }

  try {
    const inspected = await inspectFile(file);
    if (!inspected) {
      discardUpload();
      return res.status(415).json({ error: 'Formato no admitido o contenido no válido' });
    }
    const title = req.body.title === undefined ? inspected.displayName : req.body.title;
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 160) {
      discardUpload();
      return res.status(400).json({ error: 'El nombre debe tener entre 1 y 160 caracteres' });
    }
    const document = db.create('documents', {
      ...target,
      title: title.trim(),
      fileName: inspected.displayName,
      contentType: inspected.contentType,
      size: inspected.bytes,
      storageKey: file.filename,
      uploadedAt: new Date().toISOString()
    }, userId);
    res.status(201).json(publicMetadata(document));
  } catch {
    discardUpload();
    res.status(500).json({ error: 'No se pudo registrar el documento' });
  }
});

router.get('/:id/content', async (req, res) => {
  const userId = req.session.userId;
  const db = req.app.locals.db;
  const document = db.findById('documents', req.params.id, userId);
  if (!document) return res.status(404).json({ error: 'Documento no encontrado' });
  let fileStream;
  try {
    const storageKeyPath = req.app.locals.documentStorage.filePath(userId, document.storageKey);
    await fs.promises.access(storageKeyPath, fs.constants.R_OK);
    fileStream = req.app.locals.documentStorage.createReadStream(userId, document.storageKey);
  } catch {
    return res.status(404).json({ error: 'Documento no encontrado' });
  }
  const download = req.query.download === '1';
  const extension = path.posix.extname(document.fileName || '').replace(/[^.a-z0-9]/gi, '').slice(0, 12);
  const safeName = `document${extension}`;
  res.set({
    'Content-Type': document.contentType,
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safeName}"`,
    'Content-Length': String(document.size),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox"
  });
  fileStream.on('error', () => {
    if (!res.headersSent) res.status(404).json({ error: 'Documento no encontrado' });
    else res.destroy();
  }).pipe(res);
});

router.get('/:id', (req, res) => {
  const document = req.app.locals.db.findById('documents', req.params.id, req.session.userId);
  if (!document) return res.status(404).json({ error: 'Documento no encontrado' });
  res.json(publicMetadata(document));
});

module.exports = { router, MAX_FILE_SIZE, detectFileType, inspectFile, targetFor };
