const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class JsonDB {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this._ensureDir(dataDir);
    this._cache = {};
  }

  _ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  _filePath(collection, userId) {
    if (userId) {
      const userDir = path.join(this.dataDir, userId);
      this._ensureDir(userDir);
      return path.join(userDir, `${collection}.json`);
    }
    return path.join(this.dataDir, `${collection}.json`);
  }

  _readFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return [];
      }
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  _writeFile(filePath, data) {
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
  }

  _readCollection(collection, userId) {
    const cacheKey = `${collection}:${userId || '_global'}`;
    if (this._cache[cacheKey]) {
      return this._cache[cacheKey];
    }
    const filePath = this._filePath(collection, userId);
    const data = this._readFile(filePath);
    this._cache[cacheKey] = data;
    return data;
  }

  _writeCollection(collection, userId, data) {
    const cacheKey = `${collection}:${userId || '_global'}`;
    this._cache[cacheKey] = data;
    const filePath = this._filePath(collection, userId);
    this._writeFile(filePath, data);
  }

  _invalidateCache(collection, userId) {
    const cacheKey = `${collection}:${userId || '_global'}`;
    delete this._cache[cacheKey];
  }

  clearCache() {
    this._cache = {};
  }

  findAll(collection, userId, filter) {
    let data = this._readCollection(collection, userId);
    if (filter) {
      data = data.filter(item => {
        return Object.entries(filter).every(([key, value]) => item[key] === value);
      });
    }
    return [...data];
  }

  findById(collection, id, userId) {
    const data = this._readCollection(collection, userId);
    return data.find(item => item.id === id) || null;
  }

  create(collection, item, userId) {
    const data = this._readCollection(collection, userId);
    const newItem = {
      id: uuidv4(),
      ...item,
      createdAt: new Date().toISOString()
    };
    data.push(newItem);
    this._writeCollection(collection, userId, data);
    return { ...newItem };
  }

  update(collection, id, updates, userId) {
    const data = this._readCollection(collection, userId);
    const index = data.findIndex(item => item.id === id);
    if (index === -1) {
      return null;
    }
    data[index] = { ...data[index], ...updates, id: data[index].id, createdAt: data[index].createdAt };
    this._writeCollection(collection, userId, data);
    return { ...data[index] };
  }

  remove(collection, id, userId) {
    const data = this._readCollection(collection, userId);
    const index = data.findIndex(item => item.id === id);
    if (index === -1) {
      return false;
    }
    data.splice(index, 1);
    this._writeCollection(collection, userId, data);
    return true;
  }

  replace(collection, userId, data) {
    if (!Array.isArray(data)) throw new TypeError('Collection data must be an array');
    this._writeCollection(collection, userId, data.map(item => ({ ...item })));
  }

  query(collection, userId, predicate) {
    const data = this._readCollection(collection, userId);
    return data.filter(predicate).map(item => ({ ...item }));
  }

  findUserByEmail(email) {
    const users = this._readCollection('users');
    return users.find(u => u.email === email) || null;
  }

  findUserByName(nombre) {
    const users = this._readCollection('users');
    return users.find(u => u.nombre === nombre) || null;
  }

  findUserById(id) {
    const users = this._readCollection('users');
    return users.find(u => u.id === id) || null;
  }

  createUser(userData) {
    return this.create('users', userData);
  }

  updateUser(id, updates) {
    return this.update('users', id, updates);
  }

  /**
   * Deletes a user and all of their data.
   * Removes the user row from users.json and the entire per-user data
   * directory (<dataDir>/<id>). Returns true if the user existed.
   */
  deleteUserById(id) {
    const users = this._readCollection('users');
    const index = users.findIndex(u => u.id === id);
    if (index === -1) {
      return false;
    }

    users.splice(index, 1);
    this._writeCollection('users', undefined, users);

    this._invalidateCache('users', undefined);

    // Remove the user's data directory (categories, transactions, goals, ...).
    const userDir = path.join(this.dataDir, id);
    try {
      if (fs.existsSync(userDir)) {
        fs.rmSync(userDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error('[jsondb] error removing user dir', userDir, err.message);
    }

    this._cache = {};
    return true;
  }
}

module.exports = JsonDB;
