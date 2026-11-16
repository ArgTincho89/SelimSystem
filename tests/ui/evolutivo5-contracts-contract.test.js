const fs = require('fs');
const path = require('path');
const { loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const flush = async () => { for (let index = 0; index < 6; index += 1) await Promise.resolve(); };

describe('Evolutivo 5 contracts and lifecycle UI contract', () => {
  const source = read('js/pages/rentalModal.js');

  describe('"Actualizar alquiler"', () => {
    it('is reachable from the header, Resumen, every contract card and the Períodos tab', () => {
      expect(source).toContain("textContent: 'Actualizar alquiler', onClick: () => this.updateRent(ctx)");
      expect(source).toContain("button('Actualizar alquiler', () => this.updateRent(ctx, card.contractId))");
      expect(read('js/pages/rentalPeriods.js')).toContain("textContent: 'Actualizar alquiler', onClick: () => RentalModal.updateRent(ctx)");
      expect(source).toContain('renderComposition(ctx');
      expect(source).toContain('renderContracts(ctx)');
    });

    it('picks the effective date among the future due dates and previews before saving', () => {
      expect(source).toContain('card.futureDueDates.forEach(value => date.appendChild(');
      expect(source).toContain('API.rentals.previewCondition(contractId, current)');
      expect(source).toContain("textContent: 'Guardar ajuste', disabled: true");
      expect(source).toContain('API.rentals.addCondition(contractId, input())');
      expect(read('js/api.js')).toContain('/conditions/preview');
    });

    it('words the preview as "Desde <mes>, el alquiler pasa de X a Y. Se actualizarán N períodos futuros no cobrados."', () => {
      const { RentalModal } = loadBrowser(['js/utils/format.js', 'js/pages/rentalModal.js'], ['RentalModal']);
      const card = { currencyCode: 'ARS' };
      const text = RentalModal.previewText({ effectiveDate: '2026-12-01', previousAmount: 11797500, newAmount: 15336750, affectedDates: ['a', 'b', 'c', 'd', 'e'], skippedCollectedDates: [] }, card);
      expect(text).toContain('Desde diciembre 2026, el alquiler pasa de');
      expect(text).toContain('11.797.500');
      expect(text).toContain('15.336.750');
      expect(text).toContain('Se actualizarán 5 períodos futuros no cobrados.');
      const skipped = RentalModal.previewText({ effectiveDate: '2026-12-01', previousAmount: 1, newAmount: 2, affectedDates: ['a'], skippedCollectedDates: ['b'] }, card);
      expect(skipped).toContain('Se actualizarán 1 período futuro no cobrado.');
      expect(skipped).toContain('Un período ya cobrado se mantiene sin cambios.');
    });
  });

  describe('end flows', () => {
    const setup = () => {
      const pushed = [];
      const Modal = { push: (title, body, options) => pushed.push({ title, body, options }), hide: jest.fn() };
      const declarations = {
        endPreview: jest.fn().mockResolvedValue({ cancelledPeriods: [{ modality: 'locacion', period: '2026-12', amount: 100, currencyCode: 'ARS' }], tenantObligations: [{ obligationId: 'o1', title: 'Expensas' }] }),
        end: jest.fn().mockResolvedValue({}),
        endModalityPreview: jest.fn().mockResolvedValue({ cancelledPeriods: [] }),
        endModality: jest.fn().mockResolvedValue({})
      };
      const showToast = jest.fn();
      const { RentalModal } = loadBrowser(['js/utils/format.js', 'js/pages/rentalModal.js'], ['RentalModal'], { Modal, API: { rentals: { declarations } }, showToast, MoneyInput: {} });
      return { RentalModal, pushed, Modal, declarations, showToast, ctx: { declarationId: 'd1', reload: jest.fn() } };
    };

    it('"Finalizar alquiler" shows the confirmation copy, what gets cancelled and the tenant obligations, then ends', async () => {
      const { RentalModal, pushed, Modal, declarations, ctx } = setup();
      RentalModal.finishRental(ctx);
      await flush();
      const { title, body, options } = pushed[0];
      expect(title).toBe('Finalizar alquiler');
      ['Estás por finalizar este alquiler.', 'Se cancelarán los períodos futuros sin cobrar.', 'Las obligaciones a cargo del inquilino volverán al titular.', 'Esta acción no se puede deshacer.', '¿Querés continuar?'].forEach(line => expect(body.textContent).toContain(line));
      expect(body.textContent).toContain('Se cancelarán 1 período sin cobrar');
      expect(body.textContent).toContain('Expensas');
      expect(declarations.endPreview).toHaveBeenCalledWith('d1', { endDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
      expect(declarations.end).not.toHaveBeenCalled();
      const confirm = options.footer.find(element => element.dataset.confirmEnd);
      expect(confirm.disabled).toBe(false);
      confirm.click();
      await flush();
      expect(declarations.end).toHaveBeenCalledWith('d1', { endDate: expect.any(String) });
      expect(Modal.hide).toHaveBeenCalled();
      expect(ctx.reload).toHaveBeenCalled();
    });

    it('"Finalizar contrato" is about one modality, asks for the date and calls its dedicated endpoint', async () => {
      const { RentalModal, pushed, declarations, ctx } = setup();
      RentalModal.finishContract(ctx, { contractId: 'c9', modalityLabel: 'Comodato' });
      await flush();
      expect(pushed[0].title).toBe('Finalizar contrato · Comodato');
      expect(pushed[0].body.textContent).toContain('Estás por finalizar el contrato de comodato.');
      expect(pushed[0].body.textContent).toContain('No hay períodos futuros sin cobrar para cancelar');
      expect(declarations.endModalityPreview).toHaveBeenCalledWith('d1', 'c9', expect.any(Object));
      pushed[0].options.footer.find(element => element.dataset.confirmEnd).click();
      await flush();
      expect(declarations.endModality).toHaveBeenCalledWith('d1', 'c9', expect.any(Object));
      expect(declarations.end).not.toHaveBeenCalled();
    });

    it('keeps the confirm button disabled and shows the server error when the preview fails', async () => {
      const { RentalModal, pushed, declarations, ctx } = setup();
      declarations.endModalityPreview.mockRejectedValue(new Error('No se puede finalizar este contrato porque ya está finalizado.'));
      RentalModal.finishContract(ctx, { contractId: 'c9', modalityLabel: 'Comodato' });
      await flush();
      expect(pushed[0].body.textContent).toContain('ya está finalizado');
      expect(pushed[0].options.footer.find(element => element.dataset.confirmEnd).disabled).toBe(true);
    });
  });

  describe('structure rules', () => {
    it('offers "Finalizar contrato" only on active modality cards and "Finalizar alquiler" in the red header action', () => {
      expect(source).toContain("if (card.status === 'active') button('Finalizar contrato', () => this.finishContract(ctx, card));");
      expect(source).toContain("'btn btn-danger btn-sm rental-finish'");
      expect(source.match(/'Finalizar contrato'/g)).toHaveLength(1);
    });

    it('does not offer "Declarar nuevo alquiler" and no longer ends rentals with PUT status ended', () => {
      ['js/pages/rentalModal.js', 'js/pages/rentalPeriods.js', 'js/pages/assets.js', 'js/pages/rentalDeclaration.js'].forEach(file => {
        expect(read(file)).not.toContain("textContent: 'Declarar nuevo alquiler'");
        expect(read(file)).not.toMatch(/API\.rentals\.update\([^)]*status: 'ended'/);
      });
      expect(read('js/pages/assets.js')).not.toContain('showRentalConditionModal');
    });

    it('hides the update and finish actions for a finished rental', () => {
      expect(source).toContain('!ctx.readOnly && !ended');
    });

    it('wires the end endpoints in the API client', () => {
      const api = read('js/api.js');
      ['/end-preview', '/modalities/', 'endModality(id, contractId, data = {})', 'endPreview(id, filters = {})'].forEach(text => expect(api).toContain(text));
    });
  });
});
