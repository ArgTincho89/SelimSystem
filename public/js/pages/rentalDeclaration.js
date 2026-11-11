// "Declaración de alquiler" modal: 1 to 3 modalities (locación, comodato, mutuo) plus shared tenants, obligations and notes.
const RentalDeclarationModal = {
  MODALITIES: [['locacion', 'Contrato de locación'], ['comodato', 'Comodato'], ['mutuo', 'Mutuo']],
  CURRENCIES: ['ARS', 'EUR', 'USD'],

  today() { return new Date().toISOString().slice(0, 10); },

  field(container, label, control) {
    const group = create('label', { className: 'form-group', style: { display: 'grid', gap: '4px' } }, [create('span', { textContent: label }), control]);
    container.appendChild(group);
    return group;
  },

  // One fieldset per modality. Returns { box, collect, isFilled, check }.
  buildFieldset(kind, title, data = {}) {
    const box = create('fieldset', { className: 'card', dataset: { modality: kind }, style: { padding: '10px', marginBottom: '10px', display: 'none' } });
    box.appendChild(create('legend', { textContent: title }));
    // New declarations default to ARS; editing keeps the saved currency.
    const currencyValue = data.currencyCode || 'ARS';
    const startDate = create('input', { className: 'form-control', type: 'date', value: data.startDate || this.today(), 'aria-label': `Fecha de inicio (${title})` });
    const endDate = create('input', { className: 'form-control', type: 'date', value: data.endDate || '', 'aria-label': `Fecha de finalización (${title})` });
    const amount = MoneyInput.create({ currency: currencyValue, value: data.amount ?? null, ariaLabel: `Monto original (${title})` });
    const currency = create('select', { className: 'form-control', 'aria-label': `Moneda (${title})` });
    this.CURRENCIES.forEach(code => currency.appendChild(create('option', { value: code, textContent: code })));
    currency.value = currencyValue;
    const frequency = create('input', { className: 'form-control', type: 'number', min: '1', step: '1', value: data.adjustmentFrequencyMonths ?? '', 'aria-label': `Frecuencia de ajuste en meses (${title})` });
    const criterion = create('input', { className: 'form-control', type: 'text', maxLength: 120, value: data.adjustmentCriterion || '', 'aria-label': `Criterio de ajuste (${title})` });
    this.field(box, 'Fecha de inicio', startDate);
    this.field(box, 'Fecha de finalización', endDate);
    this.field(box, 'Monto original', amount);
    let iva = null;
    const total = create('small', { className: 'text-muted', dataset: { totalWithIva: 'true' } });
    if (kind === 'locacion') {
      iva = create('input', { className: 'form-control', type: 'number', min: '0', max: '100', step: '0.01', value: data.ivaPercent ?? '', 'aria-label': 'IVA (%)' });
      this.field(box, 'IVA (%)', iva);
      box.appendChild(total);
    }
    this.field(box, 'Moneda', currency);
    this.field(box, 'Frecuencia de ajuste (meses)', frequency);
    this.field(box, 'Criterio de ajuste', criterion);
    const refreshTotal = () => {
      if (!iva) return;
      const value = MoneyInput.value(amount);
      total.textContent = value && value > 0 ? `Total con IVA: ${MoneyInput.format(totalWithIva(value, iva.value, currency.value), currency.value)}` : '';
    };
    on(currency, 'change', () => { MoneyInput.setCurrency(amount, currency.value); refreshTotal(); });
    ['input', 'change', 'blur'].forEach(name => { on(amount, name, refreshTotal); if (iva) on(iva, name, refreshTotal); });
    refreshTotal();
    const confirmSlot = create('div', { dataset: { discardConfirm: 'true' } });
    box.appendChild(confirmSlot);
    return {
      box, confirmSlot, amount,
      isFilled: () => Boolean(endDate.value || (amount.value || '').trim() || frequency.value || criterion.value.trim() || (iva && iva.value)),
      collect: () => ({
        kind, startDate: startDate.value, endDate: endDate.value || null, amount: MoneyInput.value(amount), currencyCode: currency.value,
        ivaPercent: iva && iva.value !== '' ? Number(iva.value) : null,
        adjustmentFrequencyMonths: frequency.value === '' ? null : Number(frequency.value),
        adjustmentCriterion: criterion.value.trim() || null
      })
    };
  },

  // `options.newDeclaration` declares another (non-overlapping) rental even when one is in force.
  async show(page, asset, options = {}) {
    const readOnly = Boolean(options.readOnly);
    const declaration = !options.newDeclaration && asset.declaration && asset.declaration.status !== 'ended' ? asset.declaration : null;
    const editing = Boolean(declaration);
    // Obligations created from this (unsaved) declaration are linked to it through this token.
    const pendingToken = editing ? null : (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}-declaration`);
    let createdObligations = 0;
    let saved = false;
    let owners;
    try { owners = await API.owners.list(); } catch (error) { showToast(error.message, 'error'); return; }
    const body = create('div', { style: { maxHeight: '65vh', overflowY: 'auto', paddingRight: '4px' } });
    const tenantSelect = create('select', { className: 'form-control', multiple: true, 'aria-label': 'Inquilino' });
    owners.filter(item => (item.roles || ['owner']).includes('tenant')).forEach(item => tenantSelect.appendChild(create('option', { value: item.id, textContent: item.name })));
    tenantSelect.size = Math.min(Math.max(tenantSelect.options.length, 2), 5);
    const tenantIds = new Set((declaration?.tenants || []).map(item => item.id));
    [...tenantSelect.options].forEach(option => { option.selected = tenantIds.has(option.value); });
    this.field(body, 'Inquilino', tenantSelect);
    if (!tenantSelect.options.length) body.appendChild(create('small', { className: 'text-muted', textContent: 'Cargá un inquilino en Personas para poder declarar el alquiler.' }));

    const sets = new Map();
    const checks = create('div', { style: { display: 'grid', gap: '4px', margin: '8px 0' } });
    body.appendChild(checks);
    const existing = new Map((declaration?.modalities || []).filter(item => item.status === 'active' || item.status === 'draft').map(item => [item.kind, item]));
    this.MODALITIES.forEach(([kind, title]) => {
      const set = this.buildFieldset(kind, title, existing.get(kind) || {});
      const checkbox = create('input', { type: 'checkbox', dataset: { modalityCheck: kind } });
      const sync = () => { set.box.style.display = checkbox.checked ? '' : 'none'; };
      on(checkbox, 'change', () => {
        if (!checkbox.checked && set.isFilled()) {
          checkbox.checked = true;
          set.confirmSlot.replaceChildren(
            create('p', { style: { margin: '6px 0' }, textContent: `Se descartarán los datos cargados de ${title}.` }),
            create('button', { className: 'btn btn-danger btn-sm', type: 'button', textContent: 'Descartar datos', onClick: () => { checkbox.checked = false; set.confirmSlot.replaceChildren(); sync(); } }),
            create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Mantener', onClick: () => set.confirmSlot.replaceChildren() })
          );
          return;
        }
        set.confirmSlot.replaceChildren();
        sync();
      });
      checkbox.checked = existing.has(kind);
      sync();
      checks.appendChild(create('label', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [checkbox, create('span', { textContent: title })]));
      sets.set(kind, { ...set, checkbox });
      body.appendChild(set.box);
    });

    const slot = create('div', { dataset: { slot: 'obligations' } });
    body.appendChild(slot);
    // "Nueva obligación" opens the same obligation form stacked on top of this modal: no navigation and
    // the declaration keeps its data. The tenant entered here can be its responsible.
    const obligations = page.renderObligations(slot, asset, {
      allowTenant: true,
      onNewObligation: () => ObligationsPage.showStackedCreate({
        assetId: asset.id,
        tenantNames: [...tenantSelect.selectedOptions].map(option => option.textContent),
        pendingDeclarationToken: pendingToken,
        activeContractId: editing ? asset.activeContract?.id || null : null,
        onCreated: (obligation, responsibilityType) => { createdObligations += 1; obligations.add(obligation, responsibilityType); }
      })
    });
    const notes = create('textarea', { className: 'form-control', rows: 3, maxLength: 4000, 'aria-label': 'Notas' });
    notes.value = declaration?.notes || '';
    this.field(body, 'Notas', notes);

    const errorBox = create('p', { className: 'text-danger', role: 'alert', dataset: { declarationError: 'true' }, style: { display: 'none', margin: '6px 0' } });
    const confirmBox = create('div', { className: 'card', style: { display: 'none', padding: '10px', width: '100%' }, dataset: { saveConfirm: 'true' } });
    const showError = message => { errorBox.textContent = message; errorBox.style.display = message ? '' : 'none'; };
    const save = create('button', { className: 'btn btn-primary', type: 'button', textContent: editing ? 'Guardar cambios' : 'Guardar' });
    let confirmed = false;
    const submit = async () => {
      showError('');
      const selected = [...sets.values()].filter(item => item.checkbox.checked);
      if (!selected.length) return showError('Seleccioná al menos una modalidad');
      if (![...tenantSelect.selectedOptions].length) return showError('Seleccioná al menos un inquilino');
      if (!MoneyInput.validateAll(selected.map(item => item.amount))) return showError('Revisá los importes marcados');
      const modalities = selected.map(item => item.collect());
      if (modalities.some(item => !(item.amount > 0))) return showError('Ingresá el monto original de cada modalidad');
      if (modalities.some(item => !item.startDate)) return showError('Ingresá la fecha de inicio de cada modalidad');
      if (editing && !confirmed) {
        confirmBox.replaceChildren(
          create('p', { style: { margin: '0 0 8px' }, textContent: 'Estás por modificar la declaración de alquiler. Los períodos sin cobrar se vuelven a generar con los nuevos datos. Revisá los cambios antes de confirmar.' }),
          create('button', { className: 'btn btn-primary btn-sm', type: 'button', textContent: 'Confirmar y guardar', onClick: () => { confirmed = true; confirmBox.style.display = 'none'; save.click(); } }),
          create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Volver', onClick: () => { confirmBox.style.display = 'none'; } })
        );
        confirmBox.style.display = '';
        return;
      }
      confirmed = false;
      const payload = { assetId: asset.id, tenantIds: [...tenantSelect.selectedOptions].map(option => option.value), notes: notes.value.trim(), modalities, ...obligations.collect(), ...(pendingToken ? { pendingObligationToken: pendingToken } : {}) };
      try {
        if (editing) await API.rentals.declarations.update(declaration.id, payload);
        else await API.rentals.declarations.create(payload);
        saved = true;
        Modal.hide();
        showToast(editing ? 'Alquiler actualizado' : 'Alquiler declarado');
        await (options.onDone ? options.onDone() : page.showDetails(asset.id));
      } catch (error) {
        showError(error.message);
        // Overlapping rental: offer to declare the termination of the rental in force (stacked, keeps this form).
        const conflict = error.data?.conflict;
        if (conflict?.active && conflict.declarationId) {
          errorBox.appendChild(create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Declarar la finalización del alquiler vigente', style: { display: 'block', marginTop: '6px' },
            onClick: () => page.endDeclaration(asset, { declarationId: conflict.declarationId, stacked: true }) }));
        }
      }
    };
    on(save, 'click', submit);
    const footer = readOnly
      ? create('div', {}, [create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Cerrar', onClick: () => Modal.hide() })])
      : create('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
        errorBox, confirmBox,
        create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Cancelar', onClick: () => Modal.hide() }),
        save
      ]);
    if (readOnly) body.querySelectorAll('input, select, textarea, button').forEach(control => { control.disabled = true; });
    // Closed without saving: obligations created here stay with the owner (the server also expires the link).
    const onClose = () => {
      if (saved || !pendingToken || !createdObligations) return;
      API.obligations.releasePending(pendingToken).catch(() => {});
      showToast('La declaración no se guardó: las obligaciones creadas quedan a cargo del propietario');
    };
    Modal.show(readOnly ? 'Ver declaración de alquiler' : 'Declaración de alquiler', body, { footer, onClose });
  }
};
