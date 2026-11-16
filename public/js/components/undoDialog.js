// Shared "Deshacer" dialog: every reversal (a payment, a resolution or a collected rent) asks for a justification
// ("Motivo", 1 to 500 characters once trimmed) and sends nothing until it is valid. One contract for the asset history,
// the logs, the obligations screen and the rental periods.
//
//   UndoDialog.open({ type: 'obligation.payment', obligationId, occurrenceId, transactionId }, { onDone })
//   UndoDialog.open({ type: 'obligation.resolution', obligationId, occurrenceId }, { onDone })
//   UndoDialog.open({ type: 'rental.collection', collectionId }, { onDone })        // or collectionIds: [...]
//
// Optional descriptor fields: `title`, `message`, `confirmLabel`, `details` ([label, value] pairs shown above the field).
// Resolves with true once the undo succeeded and false when the dialog was dismissed or the request failed.
const UndoDialog = {
  MAX_REASON: 500,
  REASON_ERROR: 'Indicá el motivo (hasta 500 caracteres)',

  TYPES: {
    'obligation.payment': { title: 'Deshacer pago', confirmLabel: 'Deshacer pago', message: 'Se anulará el gasto asociado y el vencimiento volverá a pendiente. Esta acción no se puede deshacer.' },
    'obligation.resolution': { title: 'Deshacer resolución', confirmLabel: 'Deshacer resolución', message: 'Se anulará la resolución y el vencimiento volverá a quedar pendiente de resolver.' },
    'rental.collection': { title: 'Deshacer cobro', confirmLabel: 'Deshacer cobro', message: 'Se deshace el cobro y el período vuelve a quedar pendiente de cobro.' }
  },

  // The trimmed reason, or '' when it is empty or too long.
  validReason(value) {
    const text = String(value || '').trim();
    return text && text.length <= this.MAX_REASON ? text : '';
  },

  // Sends the undo to the endpoint of the descriptor type.
  async request(descriptor, reason) {
    if (descriptor.type === 'obligation.payment') return API.obligations.revertPayment(descriptor.obligationId, descriptor.occurrenceId, descriptor.transactionId, { reason });
    if (descriptor.type === 'obligation.resolution') return API.obligations.voidResolution(descriptor.obligationId, descriptor.occurrenceId, { reason });
    if (descriptor.type === 'rental.collection') {
      const ids = descriptor.collectionIds || [descriptor.collectionId];
      const done = new Set();
      let reconciliationReset = false;
      for (const id of ids) {
        if (done.has(id)) continue;
        const result = await API.rentals.reverseCollection(id, { reason });
        reconciliationReset = Boolean(result.reconciliationReset) || reconciliationReset;
        [id, ...(result.collectionIds || [])].forEach(item => done.add(item));
      }
      return { reconciliationReset };
    }
    throw new Error('No se puede deshacer este registro');
  },

  successMessage(descriptor, result) {
    const warning = result && (result.reconciliationReset || result.reconciliationReset === true);
    const base = { 'obligation.payment': 'Pago revertido', 'obligation.resolution': 'Resolución anulada', 'rental.collection': 'Cobro deshecho' }[descriptor.type];
    return warning ? `${base}. La conciliación de la cuenta quedó pendiente de revisar` : base;
  },

  open(descriptor, { onDone = null } = {}) {
    const copy = this.TYPES[descriptor.type];
    if (!copy) return Promise.resolve(false);
    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const body = create('div', { className: 'undo-dialog', style: { display: 'grid', gap: '10px' } });
      String(descriptor.message || copy.message).split('\n').filter(Boolean).forEach(line => body.appendChild(create('p', { style: { margin: '0' }, textContent: line })));
      const details = (descriptor.details || []).filter(([, value]) => value !== null && value !== undefined && value !== '');
      if (details.length) {
        body.appendChild(create('div', { className: 'confirm-details card', style: { padding: '10px', display: 'grid', gap: '4px' } },
          details.map(([label, value]) => create('div', { className: 'label-value' }, [create('strong', { textContent: `${label}:` }), create('span', { textContent: String(value) })]))));
      }
      const reason = create('textarea', { className: 'form-control', rows: 3, maxLength: this.MAX_REASON, required: true, 'aria-label': 'Motivo', dataset: { undoReason: 'true' } });
      const error = create('small', { className: 'text-danger', role: 'alert', hidden: true, dataset: { undoError: 'true' } });
      body.appendChild(create('label', { className: 'form-group', style: { display: 'grid', gap: '4px', margin: '0' } }, [create('span', { textContent: 'Motivo' }), reason, error]));
      const showError = message => { error.textContent = message; error.hidden = !message; reason.setAttribute('aria-invalid', message ? 'true' : 'false'); };
      const confirm = create('button', {
        className: 'btn btn-danger', type: 'button', textContent: descriptor.confirmLabel || copy.confirmLabel, dataset: { undoConfirm: 'true' },
        onClick: async () => {
          const text = this.validReason(reason.value);
          if (!text) { showError(this.REASON_ERROR); return; }
          showError('');
          let result;
          try { result = await this.request(descriptor, text); } catch (failure) { showError(failure.message); return; }
          finish(true);
          Modal.hide();
          showToast(this.successMessage(descriptor, result));
          if (onDone) await onDone(result);
        }
      });
      on(reason, 'input', () => { if (this.validReason(reason.value)) showError(''); });
      const footer = create('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' } }, [
        create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Cancelar', onClick: () => { finish(false); Modal.hide(); } }),
        confirm
      ]);
      Modal.push(descriptor.title || copy.title, body, { footer, width: '480px', onClose: () => finish(false) });
    });
  }
};
