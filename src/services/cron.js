const { CronJob } = require('cron');
const fs = require('fs');
const path = require('path');
const config = require('../config');

function startCronJobs(db) {
  const backupJob = new CronJob('0 3 * * 0', () => {
    console.log('[CRON] Iniciando backup semanal del JSON...');
    try {
      const backupDir = path.join(config.dataDir, 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(backupDir, `backup-${timestamp}.json`);

      const dataDir = config.dataDir;
      const allData = {};

      if (fs.existsSync(dataDir)) {
        const items = fs.readdirSync(dataDir);
        items.forEach(item => {
          const itemPath = path.join(dataDir, item);
          if (item === 'backups') return;

          if (fs.statSync(itemPath).isFile() && item.endsWith('.json')) {
            allData[item.replace('.json', '')] = JSON.parse(fs.readFileSync(itemPath, 'utf-8'));
          } else if (fs.statSync(itemPath).isDirectory()) {
            const userData = {};
            const userFiles = fs.readdirSync(itemPath);
            userFiles.forEach(file => {
              if (file.endsWith('.json')) {
                userData[file.replace('.json', '')] = JSON.parse(
                  fs.readFileSync(path.join(itemPath, file), 'utf-8')
                );
              }
            });
            allData[item] = userData;
          }
        });
      }

      fs.writeFileSync(backupFile, JSON.stringify(allData, null, 2));
      console.log(`[CRON] Backup completado: ${backupFile}`);

      const backups = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('backup-'))
        .sort()
        .reverse();

      while (backups.length > 4) {
        const old = backups.pop();
        fs.unlinkSync(path.join(backupDir, old));
        console.log(`[CRON] Backup antiguo eliminado: ${old}`);
      }
    } catch (err) {
      console.error('[CRON] Error en backup:', err);
    }
  }, null, true, 'America/Argentina/Buenos_Aires');

  console.log('[CRON] Jobs programados (backup semanal dom 03:00)');
}

module.exports = { startCronJobs };
