const path = require('path');

module.exports = {
  default: {
    requireModule: ['ts-node/register'],
    require: [
      path.join(__dirname, 'support', '**', '*.ts'),
      path.join(__dirname, 'steps', '**', '*.ts'),
    ],
    paths: [path.join(__dirname, 'features', '**', '*.feature')],
    format: [
      'progress',
      `json:"${path.join(__dirname, 'reports', 'cucumber-report.json')}"`,
      `html:"${path.join(__dirname, 'reports', 'cucumber-report.html')}"`,
    ],
    formatOptions: {
      snippetInterface: 'async-await',
    },
  },
};
