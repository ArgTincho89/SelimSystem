const fs = require('fs');
const path = require('path');
const { formatDisplayDate } = require('../../src/utils/date-format');
const activityLog = require('../../src/services/activity-log');

const src = file => fs.readFileSync(path.join(__dirname, '../../src', file), 'utf8');

describe('formatDisplayDate (server-side DD-MM-AAAA)', () => {
  it('formats ISO dates and the date part of ISO timestamps', () => {
    expect(formatDisplayDate('2026-11-20')).toBe('20-11-2026');
    expect(formatDisplayDate('2026-01-05')).toBe('05-01-2026');
    expect(formatDisplayDate('2026-11-20T23:59:00.000Z')).toBe('20-11-2026');
  });

  it('returns an empty string for empty or invalid values', () => {
    [undefined, null, '', 'hoy', '2026-11', '20/11/2026', '2026-11-20x'].forEach(value => expect(formatDisplayDate(value)).toBe(''));
  });

  it('is the only date formatting used by server messages', () => {
    ['services/alerts.js', 'services/activity-log.js', 'services/rental-declarations.js', 'routes/rentals.js'].forEach(file => {
      const source = src(file);
      expect(source).toContain("require('../utils/date-format')");
      expect(source).not.toMatch(/reverse\(\)\.join\('\/'\)/);
    });
    expect(src('services/alerts.js')).not.toMatch(/function (longDate|shortDate)\(/);
  });

  it('writes the activity-log due date as DD-MM-AAAA', () => {
    const route = activityLog.ROUTES.find(item => item.action === 'obligation.payment');
    expect(activityLog.describe(route, { title: 'Luz', dueDate: '2026-12-01' })).toBe('Luz, con vencimiento 01-12-2026');
  });
});
