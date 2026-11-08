const fs = require('fs');
const path = require('path');

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORAGE_KEY_PATTERN = /^[0-9a-f]{48}\.bin$/i;

class DiskDocumentStorage {
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
  }

  userDirectory(userId) {
    if (typeof userId !== 'string' || !USER_ID_PATTERN.test(userId)) throw new Error('Invalid document owner');
    const userRoot = path.resolve(this.dataDir, userId);
    const directory = path.resolve(userRoot, 'private-documents');
    if (!directory.startsWith(`${userRoot}${path.sep}`)) throw new Error('Invalid document directory');
    return directory;
  }

  ensureUserDirectory(userId) {
    const directory = this.userDirectory(userId);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') fs.chmodSync(directory, 0o700);
    return directory;
  }

  filePath(userId, storageKey) {
    if (typeof storageKey !== 'string' || !STORAGE_KEY_PATTERN.test(storageKey)) throw new Error('Invalid document key');
    const directory = this.userDirectory(userId);
    const filePath = path.resolve(directory, storageKey);
    if (path.dirname(filePath) !== directory) throw new Error('Invalid document path');
    return filePath;
  }

  createReadStream(userId, storageKey) {
    return fs.createReadStream(this.filePath(userId, storageKey));
  }

  remove(userId, storageKey) {
    const filePath = this.filePath(userId, storageKey);
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

module.exports = DiskDocumentStorage;
