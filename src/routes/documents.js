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
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 9, parts: 10, fieldNameSize: 50, fieldSize: 512 }
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

const TARGET_FIELDS = ['assetId', 'entityId', 'obligationId', 'contractId', 'occurrenceId', 'rentOccurrenceId', 'transactionId', 'tenantEntityId'];
const TARGET_ERROR = 'Indica un destino válido: bien, persona u organización, obligación, contrato, vencimiento, período de alquiler, movimiento o inquilino';

function idOf(body, field) {
  return typeof body[field] === 'string' && body[field] ? body[field] : null;
}

// Validates every provided target, derives parent links and checks consistency.
// Returns { target } or { error }. Legacy single-target documents keep the same shape.
function resolveTargets(db, userId, body) {
  const given = {};
  TARGET_FIELDS.forEach(field => { given[field] = idOf(body, field); });
  if (!TARGET_FIELDS.some(field => given[field])) return { error: TARGET_ERROR };
  const target = { ...given };
  if (given.assetId && !db.findById('assets', given.assetId, userId)) return { error: TARGET_ERROR };
  if (given.entityId && !db.findById('legalOwners', given.entityId, userId)) return { error: TARGET_ERROR };
  if (given.transactionId && !db.findById('transactions', given.transactionId, userId)) return { error: 'El movimiento no es válido' };
  if (given.tenantEntityId) {
    const tenant = db.findById('legalOwners', given.tenantEntityId, userId);
    if (!tenant || !(tenant.roles || ['owner']).includes('tenant')) return { error: 'El inquilino no es válido' };
  }
  let derivedAssetId = null;
  let obligation = given.obligationId ? db.findById('obligations', given.obligationId, userId) : null;
  if (given.obligationId && !obligation) return { error: TARGET_ERROR };
  let contract = given.contractId ? db.findById('rentalContracts', given.contractId, userId) : null;
  if (given.contractId && !contract) return { error: TARGET_ERROR };
  if (given.occurrenceId) {
    const occurrence = db.findById('obligationOccurrences', given.occurrenceId, userId);
    if (!occurrence) return { error: 'El vencimiento no es válido' };
    if (obligation && occurrence.obligationId !== obligation.id) return { error: 'El vencimiento no corresponde a la obligación indicada' };
    obligation = obligation || db.findById('obligations', occurrence.obligationId, userId);
    if (!obligation) return { error: 'El vencimiento no es válido' };
    target.obligationId = obligation.id;
  }
  if (obligation) derivedAssetId = obligation.assetId || null;
  if (given.rentOccurrenceId) {
    const rent = db.findById('rentOccurrences', given.rentOccurrenceId, userId);
    if (!rent) return { error: 'El período de alquiler no es válido' };
    if (contract && rent.contractId !== contract.id) return { error: 'El período de alquiler no corresponde al contrato indicado' };
    contract = contract || db.findById('rentalContracts', rent.contractId, userId);
    if (!contract) return { error: 'El período de alquiler no es válido' };
    target.contractId = contract.id;
  }
  if (contract) {
    if (derivedAssetId && contract.assetId && derivedAssetId !== contract.assetId) return { error: 'Los destinos del documento pertenecen a bienes distintos' };
    derivedAssetId = derivedAssetId || contract.assetId || null;
  }
  if (derivedAssetId && given.assetId && given.assetId !== derivedAssetId) return { error: 'El bien indicado no coincide con el destino del documento' };
  if (derivedAssetId) target.assetId = derivedAssetId;
  return { target };
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
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const filters = TARGET_FIELDS.filter(field => idOf(req.query, field));
  if (!filters.length) return res.status(400).json({ error: TARGET_ERROR });
  // Legacy targets must exist and belong to the user; newer links may dangle and simply match nothing.
  const legacy = { assetId: 'assets', entityId: 'legalOwners', obligationId: 'obligations', contractId: 'rentalContracts' };
  for (const field of filters) {
    if (legacy[field] && !db.findById(legacy[field], idOf(req.query, field), userId)) return res.status(400).json({ error: TARGET_ERROR });
  }
  const documents = db.findAll('documents', userId)
    .filter(item => filters.every(field => (item[field] || null) === idOf(req.query, field)))
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
  const resolved = resolveTargets(db, userId, req.body || {});
  if (resolved.error) {
    discardUpload();
    return res.status(400).json({ error: resolved.error });
  }
  const target = resolved.target;

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

module.exports = { router, MAX_FILE_SIZE, detectFileType, inspectFile, resolveTargets, TARGET_FIELDS };
