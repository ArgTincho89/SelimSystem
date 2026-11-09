const API = {
  async request(method, url, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin'
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`/api${url}`, opts);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Error de servidor');
    }
    return data;
  },

  get(url) { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body); },
  put(url, body) { return this.request('PUT', url, body); },
  patch(url, body) { return this.request('PATCH', url, body); },
  delete(url) { return this.request('DELETE', url); },

  auth: {
    me() { return API.get('/auth/me'); },
    register(data) { return API.post('/auth/register', data); },
    login(data) { return API.post('/auth/login', data); },
    logout() { return API.post('/auth/logout'); },
    forgotPassword(email) { return API.post('/auth/forgot-password', { email }); },
    resetPassword(token, newPassword) { return API.post('/auth/reset-password', { token, newPassword }); },
    uploadPhoto(photo) { return API.put('/auth/photo', { photo }); },
    deletePhoto() { return API.delete('/auth/photo'); }
  },

  categories: {
    list() { return API.get('/categories'); },
    create(data) { return API.post('/categories', data); },
    update(id, data) { return API.put(`/categories/${id}`, data); },
    delete(id) { return API.delete(`/categories/${id}`); },
    reorder(orderedIds) { return API.patch('/categories/reorder', { orderedIds }); }
  },

  transactions: {
    list(month, accountId) {
      const query = new URLSearchParams();
      if (month) query.set('month', month);
      if (accountId) query.set('accountId', accountId);
      const params = query.toString();
      return API.get(`/transactions${params ? `?${params}` : ''}`);
    },
    create(data) { return API.post('/transactions', data); },
    update(id, data) { return API.put(`/transactions/${id}`, data); },
    delete(id) { return API.delete(`/transactions/${id}`); },
    recurringTotal(month) { return API.get(`/transactions/recurring-total?month=${month}`); },
    postOccurrence(id, date) { return API.post(`/transactions/${id}/occurrences/${date}/post`, {}); },
    updateOccurrence(id, date, data) { return API.put(`/transactions/${id}/occurrences/${date}`, data); },
    skipOccurrence(id, date) { return API.delete(`/transactions/${id}/occurrences/${date}`); }
  },

  summary: {
    get(month) { return API.get(`/summary?month=${month}`); },
    burnRate(month, compare) {
      let url = `/summary/burn-rate?month=${month}`;
      if (compare) url += `&compare=${compare}`;
      return API.get(url);
    }
  },

  trends: {
    get(from, to, categoryId) {
      let url = `/trends?from=${from}&to=${to}`;
      if (categoryId) url += `&categoryId=${categoryId}`;
      return API.get(url);
    }
  },

  goals: {
    list(month) {
      let url = '/goals';
      if (month) url += `?month=${month}`;
      return API.get(url);
    },
    create(data) { return API.post('/goals', data); },
    delete(id) { return API.delete(`/goals/${id}`); }
  },

  accounts: {
    list() { return API.get('/accounts'); },
    setup() { return API.get('/accounts/setup'); },
    rollbackMigration() { return API.post('/accounts/migration/rollback', {}); },
    reapplyMigration() { return API.post('/accounts/migration/reapply', {}); },
    settings() { return API.get('/accounts/settings'); },
    updateSettings(data) { return API.patch('/accounts/settings', data); },
    create(data) { return API.post('/accounts', data); },
    update(id, data) { return API.put(`/accounts/${id}`, data); },
    archive(id) { return API.post(`/accounts/${id}/archive`, {}); },
    delete(id) { return API.delete(`/accounts/${id}`); },
    reconcile(id, data) { return API.post(`/accounts/${id}/reconcile`, data); },
    reconciliation(id) { return API.get(`/accounts/${id}/reconciliation`); },
    forecast(id) { return API.get(`/accounts/${id}/forecast`); },
    alerts() { return API.get('/accounts/alerts'); }
  },

  transfers: {
    list() { return API.get('/transfers'); },
    create(data) { return API.post('/transfers', data); },
    update(id, data) { return API.put(`/transfers/${id}`, data); },
    post(id, data = {}) { return API.post(`/transfers/${id}/post`, data); },
    delete(id) { return API.delete(`/transfers/${id}`); }
  },

  finance: {
    overview(month) { return API.get(`/finance/overview${month ? `?month=${encodeURIComponent(month)}` : ''}`); },
    paymentMethods() { return API.get('/finance/payment-methods'); },
    createPaymentMethod(data) { return API.post('/finance/payment-methods', data); },
    updatePaymentMethod(id, data) { return API.put(`/finance/payment-methods/${encodeURIComponent(id)}`, data); },
    deletePaymentMethod(id) { return API.delete(`/finance/payment-methods/${encodeURIComponent(id)}`); },
    allocations(filters = {}) {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
      return API.get(`/finance/allocations${query.toString() ? `?${query}` : ''}`);
    },
    associations(transactionId) { return API.get(`/finance/transactions/${encodeURIComponent(transactionId)}/associations`); },
    setAllocations(transactionId, data) { return API.put(`/finance/transactions/${encodeURIComponent(transactionId)}/allocations`, data); },
    claims(filters = {}) {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
      const serialized = query.toString();
      return API.get(`/finance/claims${serialized ? `?${serialized}` : ''}`);
    },
    createClaim(data) { return API.post('/finance/claims', data); },
    collectClaim(id, data) { return API.post(`/finance/claims/${encodeURIComponent(id)}/recoveries`, data); }
  },

  assets: {
    list(filters = {}) {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null));
      const serialized = query.toString();
      return API.get(`/assets${serialized ? `?${serialized}` : ''}`);
    },
    get(id) { return API.get(`/assets/${id}`); },
    economics(id, filters = {}) {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null));
      return API.get(`/assets/${encodeURIComponent(id)}/economics${query.toString() ? `?${query}` : ''}`);
    },
    file(id, horizonDays) { return API.get(`/assets/${encodeURIComponent(id)}/file${horizonDays ? `?horizonDays=${encodeURIComponent(horizonDays)}` : ''}`); },
    monthlyView(id, filters = {}) {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null));
      return API.get(`/assets/${encodeURIComponent(id)}/monthly-view${query.toString() ? `?${query}` : ''}`);
    },
    create(data) { return API.post('/assets', data); },
    update(id, data) { return API.put(`/assets/${id}`, data); },
    addOwnership(id, data) { return API.post(`/assets/${id}/ownerships`, data); },
    closeOwnership(id, ownershipId, endDate) { return API.patch(`/assets/${id}/ownerships/${ownershipId}`, { endDate }); }
  },

  owners: {
    list() { return API.get('/owners'); },
    create(data) { return API.post('/owners', data); },
    update(id, data) { return API.put(`/owners/${id}`, data); }
  },

  alerts: {
    list(filters = {}) {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null));
      const serialized = query.toString();
      return API.get(`/alerts${serialized ? `?${serialized}` : ''}`);
    }
  },

  getAlerts(filters = {}) { return API.alerts.list(filters); },
  getAssetFile(id, horizonDays) { return API.assets.file(id, horizonDays); },

  installments: {
    plans() { return API.get('/installments/plans'); },
    createPlan(data) { return API.post('/installments/plans', data); },
    plan(id) { return API.get(`/installments/plans/${encodeURIComponent(id)}`); },
    cancelPlan(id) { return API.post(`/installments/plans/${encodeURIComponent(id)}/cancel`, {}); },
    occurrences(month) { return API.get(`/installments/occurrences?month=${encodeURIComponent(month)}`); },
    postOccurrence(planId, occurrenceId, data = {}) { return API.post(`/installments/plans/${encodeURIComponent(planId)}/occurrences/${encodeURIComponent(occurrenceId)}/post`, data); },
    cancelOccurrence(planId, occurrenceId) { return API.post(`/installments/plans/${encodeURIComponent(planId)}/occurrences/${encodeURIComponent(occurrenceId)}/cancel`, {}); }
  },

  documents: {
    list(targetType, targetId) {
      const field = ({ asset: 'assetId', obligation: 'obligationId', contract: 'contractId', occurrence: 'occurrenceId', rentOccurrence: 'rentOccurrenceId', transaction: 'transactionId', tenant: 'tenantEntityId' })[targetType] || 'entityId';
      const query = new URLSearchParams({ [field]: targetId });
      return API.get(`/documents?${query}`);
    },
    listBy(targets) {
      return API.get(`/documents?${new URLSearchParams(targets)}`);
    },
    upload(targetType, targetId, file) {
      const field = ({ asset: 'assetId', obligation: 'obligationId', contract: 'contractId', occurrence: 'occurrenceId', rentOccurrence: 'rentOccurrenceId', transaction: 'transactionId', tenant: 'tenantEntityId' })[targetType] || 'entityId';
      return API.documents.uploadTargets({ [field]: targetId }, file);
    },
    async uploadTargets(targets, file) {
      const form = new FormData();
      Object.entries(targets).forEach(([field, value]) => { if (value) form.append(field, value); });
      form.append('file', file);
      const response = await fetch('/api/documents', { method: 'POST', credentials: 'same-origin', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar el documento');
      return data;
    },
    contentUrl(id, download = false) { return `/api/documents/${encodeURIComponent(id)}/content${download ? '?download=1' : ''}`; }
  },

  wealthNotes: {
    list(targetType, targetId) {
      const query = new URLSearchParams({ targetType, targetId });
      return API.get(`/notes?${query}`);
    },
    create(data) { return API.post('/notes', data); }
  },

  obligations: {
    list(filters = {}) {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null));
      const serialized = query.toString();
      return API.get(`/obligations${serialized ? `?${serialized}` : ''}`);
    },
    get(id) { return API.get(`/obligations/${encodeURIComponent(id)}`); },
    create(data) { return API.post('/obligations', data); },
    update(id, data) { return API.put(`/obligations/${encodeURIComponent(id)}`, data); },
    delete(id) { return API.delete(`/obligations/${encodeURIComponent(id)}`); },
    alerts() { return API.get('/obligations/alerts'); },
    confirm(id, occurrenceId) { return API.post(`/obligations/${encodeURIComponent(id)}/occurrences/${encodeURIComponent(occurrenceId)}/confirm`, {}); },
    cancelOccurrence(id, occurrenceId) { return API.post(`/obligations/${encodeURIComponent(id)}/occurrences/${encodeURIComponent(occurrenceId)}/cancel`, {}); },
    updateOccurrence(id, occurrenceId, data) { return API.put(`/obligations/${encodeURIComponent(id)}/occurrences/${encodeURIComponent(occurrenceId)}`, data); },
    pay(id, occurrenceId, data) { return API.post(`/obligations/${encodeURIComponent(id)}/occurrences/${encodeURIComponent(occurrenceId)}/payments`, data); },
    createResolution(id, occurrenceId, data) { return API.post(`/obligations/${encodeURIComponent(id)}/occurrences/${encodeURIComponent(occurrenceId)}/resolution`, data); },
    voidResolution(id, occurrenceId) { return API.delete(`/obligations/${encodeURIComponent(id)}/occurrences/${encodeURIComponent(occurrenceId)}/resolution`); },
    listResolutions(filters = {}) { return API.get(`/obligations/resolutions?${new URLSearchParams(filters)}`); }
  },

  rentals: {
    list(filters = {}) {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null));
      const serialized = query.toString();
      return API.get(`/rentals${serialized ? `?${serialized}` : ''}`);
    },
    get(id) { return API.get(`/rentals/${encodeURIComponent(id)}`); },
    create(data) { return API.post('/rentals', data); },
    update(id, data) { return API.put(`/rentals/${encodeURIComponent(id)}`, data); },
    addCondition(id, data) { return API.post(`/rentals/${encodeURIComponent(id)}/conditions`, data); },
    cancelOccurrence(id, occurrenceId) { return API.post(`/rentals/${encodeURIComponent(id)}/occurrences/${encodeURIComponent(occurrenceId)}/cancel`, {}); },
    alerts() { return API.get('/rentals/alerts'); },
    collections(contractId) { return API.get(`/rentals/collections/list${contractId ? `?contractId=${encodeURIComponent(contractId)}` : ''}`); },
    collect(data) { return API.post('/rentals/collections', data); },
    allocate(collectionId, data) { return API.post(`/rentals/collections/${encodeURIComponent(collectionId)}/allocations`, data); }
  }
};
