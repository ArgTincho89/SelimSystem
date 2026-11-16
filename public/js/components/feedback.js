// Shared feedback states: loading, empty (with a suggested action) and error (with an optional retry).
// Every state names itself with text, is announced to assistive technology (`role="status"` / `role="alert"`) and
// never relies on color alone. The messages are the Spanish copy of the redesigned screens.
//
//   Feedback.loading('Cargando documentos...')
//   Feedback.empty({ message: 'No hay documentos cargados.', actionLabel: 'Cargar documento', onAction })
//   Feedback.error('No se pudieron cargar las notas: ...', { onRetry })
const Feedback = {
  MESSAGES: {
    noActiveRental: 'Este inmueble no tiene un alquiler activo.',
    noPendingPeriods: 'No hay períodos pendientes de cobro.',
    noTenantObligations: 'No hay obligaciones a cargo del inquilino.',
    noDocuments: 'No hay documentos cargados.',
    noNotesInRange: 'No hay notas en este rango de fechas.',
    noMovements: 'No hay movimientos en este período.'
  },

  loading(text = 'Cargando...') {
    return create('div', { className: 'loading feedback-loading', role: 'status', 'aria-live': 'polite', textContent: text });
  },

  empty({ message, hint = '', actionLabel = '', onAction = null } = {}) {
    const box = create('div', { className: 'empty-state feedback-empty', role: 'status' }, [create('p', { className: 'empty-state-text', textContent: message })]);
    if (hint) box.appendChild(create('p', { className: 'text-muted', textContent: hint }));
    if (actionLabel && onAction) box.appendChild(create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: actionLabel, onClick: onAction }));
    return box;
  },

  error(message, { onRetry = null, retryLabel = 'Reintentar' } = {}) {
    const box = create('div', { className: 'empty-state feedback-error', role: 'alert' }, [create('p', { className: 'empty-state-text', textContent: message })]);
    if (onRetry) box.appendChild(create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: retryLabel, onClick: onRetry }));
    return box;
  }
};
