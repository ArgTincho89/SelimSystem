const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { version } = require('../package.json');
const JsonDB = require('./db/jsondb');
const DiskDocumentStorage = require('./services/document-storage');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const transactionRoutes = require('./routes/transactions');
const summaryRoutes = require('./routes/summary');
const trendsRoutes = require('./routes/trends');
const goalRoutes = require('./routes/goals');
const accountRoutes = require('./routes/accounts');
const transferRoutes = require('./routes/transfers');
const assetRoutes = require('./routes/assets');
const ownerRoutes = require('./routes/owners');
const documentRoutes = require('./routes/documents').router;
const wealthNoteRoutes = require('./routes/wealth-notes').router;
const obligationRoutes = require('./routes/obligations');
const rentalRoutes = require('./routes/rentals');

const app = express();

app.set('trust proxy', 1);

const db = new JsonDB(config.dataDir);
app.locals.db = db;
app.locals.documentStorage = new DiskDocumentStorage(config.dataDir);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({ origin: config.appUrl, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/trends', trendsRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/owners', ownerRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/notes', wealthNoteRoutes);
app.use('/api/obligations', obligationRoutes);
app.use('/api/rentals', rentalRoutes);

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.get('/version.json', (req, res) => res.json({ version }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(errorHandler);

module.exports = app;
