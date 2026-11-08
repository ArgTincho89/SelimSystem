const Router = {
  routes: {},
  currentRoute: null,

  register(path, handler) {
    this.routes[path] = handler;
  },

  navigate(path) {
    window.location.hash = path;
  },

  async handleRoute() {
    const hash = window.location.hash.slice(1) || '/login';
    const [path, queryStr] = hash.split('?');
    const params = {};

    if (queryStr) {
      queryStr.split('&').forEach(pair => {
        const [key, val] = pair.split('=');
        params[decodeURIComponent(key)] = decodeURIComponent(val || '');
      });
    }

    const handler = this.routes[path];
    if (!handler) {
      this.navigate('/home');
      return;
    }

    if (path !== '/home' && HomePage.chartResizeObserver) {
      HomePage.chartResizeObserver.disconnect();
      HomePage.chartResizeObserver = null;
    }

    if (path !== '/home' && HomePage.statFitObserver) {
      HomePage.statFitObserver.disconnect();
      HomePage.statFitObserver = null;
    }

    if (!App.user) document.body.classList.remove('desktop-mode');
    document.body.classList.toggle('desktop-home', path === '/home' && App.isDesktop());

    try {
      await handler(params);
      this.currentRoute = path;
      this.updateNavbar(path);
    } catch (err) {
      console.error('[Router]', err);
    }
  },

  updateNavbar(path) {
    $$('.navbar-item').forEach(item => {
      item.classList.toggle('active', item.dataset.route === path);
    });
    App?.refreshAlertIndicator?.();
  },

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  }
};
