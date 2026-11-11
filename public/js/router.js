const Router = {
  routes: {},
  currentRoute: null,
  navigationId: 0,
  // Routes that render another section's screen are highlighted as that section.
  navAliases: { '/entities': '/settings' },

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

    // Highlight the target section right away, so programmatic navigations (and slow or failing
    // handlers) never leave the previous section highlighted.
    const navigationId = ++this.navigationId;
    this.highlightNav(path);

    try {
      await handler(params);
    } catch (err) {
      console.error('[Router]', err);
    }

    // A newer navigation started while this handler was awaiting: it owns the highlight.
    if (navigationId !== this.navigationId) return;
    this.currentRoute = this.currentPath();
    this.updateNavbar(this.currentRoute);
  },

  // Path (without query) of the screen currently addressed by the URL hash.
  currentPath() {
    return (window.location.hash.slice(1) || '/login').split('?')[0];
  },

  highlightNav(path) {
    const target = this.navAliases[path] || path;
    $$('.navbar-item').forEach(item => {
      item.classList.toggle('active', item.dataset.route === target);
    });
  },

  updateNavbar(path) {
    this.highlightNav(path);
    App?.refreshAlertIndicator?.();
  },

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  }
};
