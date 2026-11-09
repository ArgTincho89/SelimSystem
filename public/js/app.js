const App = {
  user: null,
  experienceKey: 'pate_experience',

  getExperience() {
    return localStorage.getItem(this.experienceKey) === 'desktop' ? 'desktop' : 'mobile';
  },

  isDesktop() {
    return this.getExperience() === 'desktop';
  },

  applyExperience() {
    document.body.classList.toggle('desktop-mode', this.isDesktop());
  },

  setExperience(experience) {
    const selected = experience === 'desktop' ? 'desktop' : 'mobile';
    localStorage.setItem(this.experienceKey, selected);
    if (this.user) this.applyExperience();
    return selected;
  },

  async refreshAlertIndicator() {
    if (!this.user) return;
    try {
      const [accountAlerts, rentAlerts] = await Promise.all([API.accounts.alerts(), API.rentals.alerts()]);
      const item = document.querySelector('#navbar [data-route="/settings"]');
      if (item) item.classList.toggle('has-alert', accountAlerts.length + rentAlerts.length > 0);
      this.setAlertBadge((await API.getAlerts()).length);
    } catch {
      // The alert indicator is non-critical.
    }
  },

  setAlertBadge(count) {
    const item = document.querySelector('#navbar [data-route="/avisos"]');
    if (!item) return;
    item.querySelector('.nav-badge')?.remove();
    if (count > 0) item.appendChild(create('span', { className: 'nav-badge', textContent: count > 99 ? '99+' : String(count) }));
  },

  async init() {
    this.registerSW();
    this.renderNavbar();

    try {
      this.user = await API.auth.me();
      try {
        const preferences = await API.accounts.settings();
        localStorage.setItem('pate_app_currency', preferences.appCurrency || 'ARS');
        localStorage.setItem('pate_locale', preferences.locale || 'es-AR');
        localStorage.setItem('pate_timezone', preferences.timezone || 'Europe/Madrid');
      } catch (error) {
        console.warn('No se pudieron cargar las preferencias financieras:', error.message);
      }
      await this.refreshAlertIndicator();
      this.applyExperience();
      if (!window.location.hash || window.location.hash === '#/login') {
        Router.navigate('/home');
      }
    } catch {
      this.user = null;
      document.body.classList.remove('desktop-mode');
      Router.navigate('/login');
    }

    Router.register('/login', () => LoginPage.render());
    Router.register('/home', (params) => {
      if (!this.user) return Router.navigate('/login');
      HomePage.render(params);
    });
    Router.register('/categories', () => {
      if (!this.user) return Router.navigate('/login');
      CategoriesPage.render();
    });
    Router.register('/avisos', (params) => {
      if (!this.user) return Router.navigate('/login');
      AlertsPage.render(params);
    });
    Router.register('/assets', async (params) => {
      if (!this.user) return Router.navigate('/login');
      await AssetsPage.render();
      if (params.asset) await AssetsPage.showDetails(params.asset);
    });
    Router.register('/entities', () => {
      if (!this.user) return Router.navigate('/login');
      Router.navigate('/settings?section=owners');
    });
    Router.register('/obligations', (params) => {
      if (!this.user) return Router.navigate('/login');
      ObligationsPage.render({}, params.focus);
    });
    Router.register('/profile', () => {
      if (!this.user) return Router.navigate('/login');
      ProfilePage.render();
    });
    Router.register('/settings', (params) => {
      if (!this.user) return Router.navigate('/login');
      SettingsPage.render(params);
    });
    Router.register('/reset-password', (params) => LoginPage.renderReset(params));

    Router.init();
  },

  registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
          });
        })
        .catch(err => console.warn('SW registration failed:', err));
    }
  },

  renderNavbar() {
    const navbar = $('#navbar');
    navbar.className = 'navbar';
    navbar.innerHTML = `
      <button class="navbar-item" data-route="/home">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span>Inicio</span>
      </button>
      <button class="navbar-item" data-route="/avisos" aria-label="Centro de avisos">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        <span>Avisos</span>
      </button>
      <button class="navbar-item" data-route="/categories">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
        </svg>
        <span>Categorías</span>
      </button>
      <button class="navbar-item" data-route="/assets">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 10h18M5 10V5h14v5M5 10v9h14v-9M9 14h6"/>
        </svg>
        <span>Bienes</span>
      </button>
      <button class="navbar-item" data-route="/obligations">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h3M8 17h7"/>
        </svg>
        <span>Obligaciones</span>
      </button>
      <button class="navbar-item" data-route="/profile">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span>Perfil</span>
      </button>
      <button class="navbar-item" data-route="/settings">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.34 1.88l.06.06-1.7 2.94-.08-.02a1.7 1.7 0 00-1.75.22l-.07.05h-3.4l-.04-.08a1.7 1.7 0 00-1.52-1.06h-.1l-2.94-1.7.02-.08a1.7 1.7 0 00-.22-1.75l-.05-.07v-3.4l.08-.04a1.7 1.7 0 001.06-1.52v-.1l1.7-2.94.08.02a1.7 1.7 0 001.75-.22l.07-.05h3.4l.04.08a1.7 1.7 0 001.52 1.06h.1l2.94 1.7-.02.08a1.7 1.7 0 00.22 1.75l.05.07z"/>
        </svg>
        <span>Configuración</span>
      </button>
    `;

    $$('.navbar-item', navbar).forEach(item => {
      on(item, 'click', () => Router.navigate(item.dataset.route));
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
