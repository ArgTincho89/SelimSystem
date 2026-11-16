// Shared confirmation dialog (the browser native dialog is never used). Opens on top of the current dialog and resolves with
// `{ confirmed, reason }`. `details` is a list of [label, value] pairs shown above the buttons;
// `reasonField` adds an optional reason (at most 500 characters).
//
//   const { confirmed, reason } = await ConfirmDialog.open({ title, message, confirmLabel, danger, details, reasonField });
const ConfirmDialog = {
  MAX_REASON_LENGTH: 500,

  open({ title, message = '', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false, details = [], reasonField = false, reasonLabel = 'Motivo (opcional)' }) {
    return new Promise(resolve => {
      let settled = false;
      const finish = (confirmed, reason = '') => {
        if (settled) return;
        settled = true;
        resolve({ confirmed, reason });
      };
      const body = create('div', { className: 'confirm-dialog', style: { display: 'grid', gap: '10px' } });
      String(message).split('\n').filter(Boolean).forEach(line => body.appendChild(create('p', { style: { margin: '0' }, textContent: line })));
      if (details.length) {
        body.appendChild(create('div', { className: 'confirm-details card', style: { padding: '10px', display: 'grid', gap: '4px' } },
          details.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => create('div', { className: 'label-value' }, [create('strong', { textContent: `${label}:` }), create('span', { textContent: String(value) })]))));
      }
      let reason = null;
      if (reasonField) {
        reason = create('textarea', { className: 'form-control', rows: 3, maxLength: this.MAX_REASON_LENGTH, 'aria-label': reasonLabel });
        body.appendChild(create('label', { className: 'form-group', style: { display: 'grid', gap: '4px', margin: '0' } }, [create('span', { textContent: reasonLabel }), reason]));
      }
      const footer = create('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' } }, [
        create('button', { className: 'btn btn-ghost', type: 'button', textContent: cancelLabel, onClick: () => { finish(false); Modal.hide(); } }),
        create('button', { className: danger ? 'btn btn-danger' : 'btn btn-primary', type: 'button', textContent: confirmLabel, dataset: { confirmAction: 'true' },
          onClick: () => { finish(true, reason ? reason.value.trim() : ''); Modal.hide(); } })
      ]);
      Modal.push(title, body, { footer, width: '480px', onClose: () => finish(false) });
    });
  }
};
