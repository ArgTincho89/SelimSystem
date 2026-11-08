const { CronJob } = require('cron');
const ledger = require('./account-ledger');

function startAccountAlertScheduler(db) {
  const job = new CronJob('*/15 * * * *', () => {
    try {
      ledger.reviewDueAlerts(db);
    } catch (error) {
      console.error('[account-alerts] daily review failed:', error.message);
    }
  }, null, true, 'UTC');
  return job;
}

module.exports = { startAccountAlertScheduler };
