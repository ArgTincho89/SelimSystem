const fs = require('fs');
const path = require('path');

describe('Asset form UI contract', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../public/js/pages/assets.js'), 'utf8');

  it('shows only the requested classification labels and no extensible JSON editor', () => {
    expect(source).toContain("[['movable', 'Mueble'], ['immovable', 'Inmueble']]");
    expect(source).not.toContain('Detalles extensibles (JSON)');
    expect(source).not.toContain('detailsControl');
  });

  it('does not add a local Obligaciones navigation button to the Bienes page', () => {
    expect(source).not.toContain("textContent: 'Obligaciones'");
    expect(source).not.toContain("Router.navigate('/obligations')");
  });
});
