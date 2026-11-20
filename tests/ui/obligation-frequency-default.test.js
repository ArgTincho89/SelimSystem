const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../../public/js/pages/obligations.js'), 'utf8');

describe('New obligation frequency default', () => {
  it('preselects Mensual for a new obligation and keeps the stored frequency when editing', () => {
    expect(source).toContain("existing ? (existing.recurrenceFrequency || '') : 'monthly'");
  });
});
