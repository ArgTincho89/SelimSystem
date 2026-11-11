const app = require('./app');
const config = require('./config');
const { startAccountAlertScheduler } = require('./services/account-alert-scheduler');
const { startResponsibilityJob } = require('./services/cron');

const server = app.listen(config.port, () => {
  console.log(`SelimSystem corriendo en puerto ${config.port}`);
  console.log(`Data dir: ${config.dataDir}`);
});

const accountAlertScheduler = startAccountAlertScheduler(app.locals.db);
const responsibilityJob = startResponsibilityJob(app.locals.db);

process.on('SIGTERM', () => {
  console.log('SIGTERM recibido, cerrando...');
  accountAlertScheduler.stop();
  responsibilityJob.stop();
  server.close(() => process.exit(0));
});

module.exports = server;
