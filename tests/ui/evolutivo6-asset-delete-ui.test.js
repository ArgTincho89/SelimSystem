const fs = require('fs');
const path = require('path');
const { loadBrowser } = require('../helpers/fake-dom');

const source = fs.readFileSync(path.join(__dirname, '../../public/js/pages/assets.js'), 'utf8');

describe('Evolutivo 6 asset deletion UI', () => {
  const setup = ({ confirmed = true, deleteResult } = {}) => {
    const dialogs = [];
    const ConfirmDialog = { open: jest.fn(async options => { dialogs.push(options); return { confirmed: dialogs.length === 1 ? confirmed : true }; }) };
    const API = { assets: { delete: jest.fn(deleteResult || (async () => ({ ok: true }))) } };
    const Modal = { hide: jest.fn() };
    const showToast = jest.fn();
    const { AssetsPage, context } = loadBrowser(['js/pages/assets.js'], ['AssetsPage'], { API, ConfirmDialog, Modal });
    context.showToast = showToast;
    AssetsPage.render = jest.fn();
    return { AssetsPage, API, ConfirmDialog, Modal, showToast, dialogs };
  };
  const asset = { id: 'a1', name: 'Casa Norte' };

  it('opens a danger confirmation and sends nothing when cancelled', async () => {
    const { AssetsPage, API, dialogs, Modal } = setup({ confirmed: false });
    expect(await AssetsPage.confirmDelete(asset)).toBe(false);
    expect(dialogs[0]).toMatchObject({ danger: true, title: 'Eliminar bien' });
    expect(API.assets.delete).not.toHaveBeenCalled();
    expect(Modal.hide).not.toHaveBeenCalled();
  });

  it('deletes after confirming, closes the ficha and reloads the list', async () => {
    const { AssetsPage, API, Modal, showToast } = setup();
    expect(await AssetsPage.confirmDelete(asset)).toBe(true);
    expect(API.assets.delete).toHaveBeenCalledWith('a1');
    expect(Modal.hide).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Bien eliminado');
    expect(AssetsPage.render).toHaveBeenCalled();
  });

  it('shows the server reason in a dialog on 409 and keeps the asset', async () => {
    const reason = 'No se puede eliminar el bien porque tiene movimientos asociados';
    const { AssetsPage, dialogs, Modal } = setup({ deleteResult: async () => { throw new Error(reason); } });
    expect(await AssetsPage.confirmDelete(asset)).toBe(false);
    expect(dialogs[1].message).toBe(reason);
    expect(Modal.hide).not.toHaveBeenCalled();
    expect(AssetsPage.render).not.toHaveBeenCalled();
  });

  it('offers Eliminar in the ficha header and the edit form footer only when editing', () => {
    expect(source).toContain("textContent: 'Eliminar', dataset: { assetDelete: 'true' }, onClick: () => this.confirmDelete(asset)");
    expect(source).toContain('...(editing ? [create(\'button\', { className: \'btn btn-danger\'');
  });

  it('merges custom kinds into the options and offers "Agregar tipo…"', () => {
    const { AssetsPage } = setup();
    AssetsPage.kinds = [{ key: 'custom-local-comercial', name: 'Local comercial' }];
    expect(AssetsPage.propertyKindOptions().map(([key]) => key)).toEqual(['departamento', 'casa', 'galpon', 'lote', 'custom-local-comercial']);
    expect(AssetsPage.optionLabel(AssetsPage.propertyKindOptions(), 'custom-local-comercial')).toBe('Local comercial');
    expect(source).toContain("'Agregar tipo…'");
  });
});
