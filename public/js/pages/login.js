const LoginPage = {
  async render() {
    const content = $('#page-content');
    const navbar = $('#navbar');
    navbar.style.display = 'none';
    content.style.paddingBottom = 'var(--space-xl)';

    let versionData = { version: '' };
    try {
      const res = await fetch('/version.json');
      versionData = await res.json();
    } catch {}

    const CHANGELOG = [
      {
        v: '1.11.17', date: '05/11/2026',
        items: [
          'Configuración de cuentas: cuentas múltiples con moneda propia y saldo independiente',
          'Transferencias y conversiones entre cuentas, con comisión opcional',
          'Resumen, tendencias y objetivos calculados por moneda',
          'Alertas internas de saldo bajo con recálculo diario',
          'Migración automática: el histórico existente queda en la cuenta principal en EUR'
        ]
      },
      {
        v: '1.11.2', date: '23/08/2026',
        items: [
          'Resumen: gráfico A vs B movido al final, debajo de Fijo vs Variable; IVA acumulado al pie'
        ]
      },
      {
        v: '1.11.1', date: '23/08/2026',
        items: [
          'Desglose Mixto: al ingresar el importe A se completa B con el saldo restante'
        ]
      },
      {
        v: '1.11.0', date: '23/08/2026',
        items: [
          'Campo IVA (%) en ingresos, con IVA acumulado en Resumen y Estadísticas',
          'Clasificación de ingresos por defecto ahora es A'
        ]
      },
      {
        v: '1.10.0', date: '23/08/2026',
        items: [
          'Frecuencia recurrente trimestral',
          'Clasificación de ingresos A, B y Mixto con desglose y evolución porcentual'
        ]
      },
      {
        v: '1.9.1', date: '04/08/2026',
        items: [
          'Fix: nueva transacción ahora marca como fecha por defecto el día actual (antes el día 1 del mes)',
          'Service Worker v9: carga forzada de nuevos assets'
        ]
      },
      {
        v: '1.9.0', date: '01/08/2026',
        items: [
          'Navegación a meses futuros en Inicio (ahora con flecha derecha)',
          'Imputar ingresos, gastos y reembolsos en meses futuros',
          'Fecha del formulario por defecto al día 1 del mes visualizado',
          'Service Worker v8: carga forzada de nuevos assets'
        ]
      },
      {
        v: '1.8.0', date: '14/07/2026',
        items: [
          'Nuevo tipo de meta: "Límite de gasto general" para controlar el presupuesto total del mes',
          'Barra de progreso con 4 zonas de color: verde (0-49%), amarillo (50-75%), naranja (76-99%), rojo (100%+)',
          'Desglose detallado al exceder el límite: límite, gasto actual y excedente',
          'Soporte para monto fijo, porcentaje de salario y porcentaje de ingresos dinámico',
          'Coexistencia: se pueden tener metas de ahorro, límite por categoría y límite general en el mismo mes'
        ]
      },
      {
        v: '1.7.2', date: '14/07/2026',
        items: [
          'Resumen: fix donut chart — ahora filtra correctamente solo categorías padre (sin duplicar hijos)',
          'Estadísticas: fix donut chart — misma corrección, eliminado flatten de hijos que duplicaba montos'
        ]
      },
      {
        v: '1.7.1', date: '14/07/2026',
        items: [
          'Resumen: barras de categoría ahora muestran gasto total (padres incluyen hijos)',
          'Resumen: gráfico donut solo muestra categorías padre (sin duplicar)',
          'Resumen: meta de límite busca subcategorías en hijos recursivamente',
          'Resumen: leyenda Fijo vs Variable ahora muestra porcentaje',
          'Inicio: estadísticas reordenadas (Ingresos, Gastos, Ahorro) para consistencia',
          'Inicio: icono de ojo movido al lado del botón Filtrar',
          'Metas: eliminada opción deshabilitada "Control de consumo"'
        ]
      },
      {
        v: '1.7.0', date: '13/07/2026',
        items: [
          'Nuevo tipo de meta: "Límite de gasto por categoría/subcategoría"',
          'Selector jerárquico de categorías en el modal de creación',
          'Múltiples metas por mes permitidas (ahorro + límites de gasto)',
          'Confirmación al duplicar metas del mismo tipo en el mismo período',
          'Barra de progreso inversa: verde dentro del límite, rojo al exceder',
          'Información detallada de excedente en metas que superan el límite'
        ]
      },
      {
        v: '1.6.3', date: '13/07/2026',
        items: [
          'Mejorados iconos de editar/eliminar en tarjetas de metas',
          'Eliminado valor del salario del resumen de parámetros'
        ]
      },
      {
        v: '1.6.2', date: '13/07/2026',
        items: [
          'Renombrado "Metas de ahorro" a "Metas financieras"',
          'Tarjetas mejoradas: muestra tipo, parámetros y rango de meses',
          'Botón de editar meta agregado',
          'Barra de progreso en Resumen: eliminado texto "Restante"'
        ]
      },
      {
        v: '1.6.1', date: '13/07/2026',
        items: [
          'Rediseño de Metas: formulario ahora se abre en modal flotante',
          'Selector de período inteligente: Mes único o Múltiples meses (rango)',
          'Jerarquía de opciones preparada para futuros tipos de metas',
          'Eliminada la grilla de meses fija'
        ]
      },
      {
        v: '1.6.0', date: '13/07/2026',
        items: [
          'Nuevo: Metas de ahorro (monto fijo, % salario, % ingresos dinámico)',
          'Nuevo: Gráfico de ritmo de gasto (burn rate) en Resumen',
          'Barra de progreso de meta en Resumen mensual',
          'Página Metas con selector de meses y CRUD completo'
        ]
      },
      {
        v: '1.5.9', date: '13/07/2026',
        items: [
          'Fix: Editar transacción desde Inicio ahora abre el formulario correctamente',
          'Texto de login actualizado'
        ]
      },
      {
        v: '1.5.8', date: '13/07/2026',
        items: [
          'Fix: Gráficos ahora muestran TODOS los gastos incluyendo subcategorías',
          'El total del gráfico ahora coincide con el total de la stat card'
        ]
      },
      {
        v: '1.5.7', date: '13/07/2026',
        items: [
          'Fix: toggle de ojito (Ingresos/Ahorro) ya no recarga la página',
          'Fix: botones de período y categoría en Estadísticas actualizan sin flash',
          'Navegación de mes con transición suave'
        ]
      },
      {
        v: '1.5.6', date: '13/07/2026',
        items: [
          'Fix: Montos en Home ya no se cortan (€ adaptable al contenedor)',
          'Fix: Gráficos de Distribución muestran TODOS los gastos (incluye categorías hijas)',
          'Resumen mantiene tamaño de fuente original'
        ]
      },
      {
        v: '1.5.5', date: '13/07/2026',
        items: [
          'Fix: Distribución de gastos ahora muestra todas las categorías (incluye hijas)',
          'Valores de Gastos/Ingresos/Ahorro aún más grandes'
        ]
      },
      {
        v: '1.5.4', date: '13/07/2026',
        items: [
          'Valores de Gastos/Ingresos/Ahorro más grandes en móvil',
          'Botón Filtrar con borde accent para mayor visibilidad',
          'Nuevo icono PWA'
        ]
      },
      {
        v: '1.5.3', date: '13/07/2026',
        items: [
          'Clasificación y recurrente solo para gastos',
          'Eliminada sección "Gastos fijos" del Home',
          'Fix sesión: trust proxy para Fly.io'
        ]
      },
      {
        v: '1.5.2', date: '13/07/2026',
        items: [
          'Persistencia de datos con volumen en Fly.io',
          'Health check endpoint para estabilidad del deploy',
          'Sesiones persistentes en disco',
          'Fix 502: variables de entorno APP_URL y SESSION_SECRET'
        ]
      },
      {
        v: '1.5.1', date: '12/07/2026',
        items: [
          'Foto de perfil guardada en el servidor',
          'CI gate: tests obligatorios antes del deploy',
          'Fix scroll en Estadísticas',
          'Removida sección "Por categoría" del Home'
        ]
      },
      {
        v: '1.5.0', date: '12/07/2026',
        items: [
          'Modal de filtros en Inicio (tipo, categoría, monto, fechas)',
          'Título de transacción ahora es opcional'
        ]
      },
      {
        v: '1.4.0', date: '12/07/2026',
        items: [
          'Editar transacciones',
          'Campo Clasificación (Fijo/Variable) + pie chart',
          'Meses con mayúscula, navegación a meses futuros'
        ]
      },
      {
        v: '1.3.0', date: '12/07/2026',
        items: [
          'Fix: transacciones recurrentes ahora impactan resumen y estadísticas',
          'Función getMonthTransactions compartida'
        ]
      },
      {
        v: '1.2.0', date: '12/07/2026',
        items: [
          'Frecuencia bimensual',
          'Símbolo €, botón ojo oculta ingresos y ahorro',
          'Datepickers funcionales para recurrentes'
        ]
      },
      {
        v: '1.1.0', date: '12/07/2026',
        items: [
          'Categorías jerárquicas (padre/hija)',
          'Transacciones recurrentes (mensual, semestral, anual)',
          'Página de Perfil con foto',
          'UI mobile-first mejorada'
        ]
      },
      {
        v: '1.0.0', date: '12/07/2026',
        items: [
          'Login por nombre de usuario',
          'CRUD de categorías y transacciones',
          'Resumen mensual con gráficos',
          'PWA offline, tema oscuro'
        ]
      }
    ];

    content.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div class="login-logo">
            <h1>SelimSystem</h1>
            <p>La información es poder, sobretodo en tus finanzas</p>
          </div>
          <div class="experience-picker" role="group" aria-label="Elegir experiencia">
            <button type="button" class="experience-option" data-experience="mobile" aria-pressed="${App.getExperience() === 'mobile'}">
              <span class="experience-option-title">Móvil</span>
              <span class="experience-option-description">Experiencia actual</span>
            </button>
            <button type="button" class="experience-option" data-experience="desktop" aria-pressed="${App.getExperience() === 'desktop'}">
              <span class="experience-option-title">Escritorio</span>
              <span class="experience-option-description">Nueva experiencia</span>
            </button>
          </div>
          <div class="login-tabs">
            <button class="login-tab active" data-tab="login">Iniciar sesión</button>
            <button class="login-tab" data-tab="register">Registrarse</button>
          </div>
          <form class="login-form active" id="login-form">
            <div class="form-group">
              <label>Nombre de usuario</label>
              <input type="text" class="form-control" id="login-nombre" required autocomplete="username">
            </div>
            <div class="form-group">
              <label>Contraseña</label>
              <input type="password" class="form-control" id="login-password" required autocomplete="current-password">
            </div>
            <button type="submit" class="btn btn-primary btn-full">Iniciar sesión</button>
            <p class="text-center mt-md">
              <a href="#" id="forgot-link" style="font-size: var(--font-sm);">¿Olvidaste tu contraseña?</a>
            </p>
            <p class="text-center mt-sm">
              <button type="button" id="clear-cache-btn" class="btn btn-ghost btn-sm" style="font-size: var(--font-xs); opacity: 0.5;">Limpiar caché y recargar</button>
            </p>
          </form>
          <form class="login-form" id="register-form">
            <div class="form-group">
              <label>Nombre</label>
              <input type="text" class="form-control" id="register-nombre" required autocomplete="username">
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" class="form-control" id="register-email" required autocomplete="email">
            </div>
            <div class="form-group">
              <label>Contraseña</label>
              <input type="password" class="form-control" id="register-password" required minlength="6" autocomplete="new-password">
            </div>
            <button type="submit" class="btn btn-primary btn-full">Crear cuenta</button>
          </form>
          <div class="version-section">
            <button type="button" class="version-toggle" id="version-toggle">
              ${versionData.version ? `v${versionData.version}` : ''}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="version-changelog" id="version-changelog">
              ${CHANGELOG.map(entry => `
                <div class="changelog-entry">
                  <div class="changelog-header">
                    <span class="changelog-version">v${entry.v}</span>
                    <span class="changelog-date">${entry.date}</span>
                  </div>
                  <ul class="changelog-list">
                    ${entry.items.map(item => `<li>${item}</li>`).join('')}
                  </ul>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    $$('[data-experience]').forEach(option => {
      on(option, 'click', () => {
        const selected = App.setExperience(option.dataset.experience);
        $$('[data-experience]').forEach(item => {
          item.setAttribute('aria-pressed', String(item.dataset.experience === selected));
        });
      });
    });

    $$('.login-tab').forEach(tab => {
      on(tab, 'click', () => {
        $$('.login-tab').forEach(t => t.classList.remove('active'));
        $$('.login-form').forEach(f => f.classList.remove('active'));
        tab.classList.add('active');
        $(`#${tab.dataset.tab}-form`).classList.add('active');
      });
    });

    on($('#version-toggle'), 'click', () => {
      $('#version-changelog').classList.toggle('open');
    });

    on($('#login-form'), 'submit', async (e) => {
      e.preventDefault();
      try {
        App.user = await API.auth.login({
          nombre: $('#login-nombre').value,
          password: $('#login-password').value
        });
        App.applyExperience();
        navbar.style.display = '';
        content.style.paddingBottom = '';
        Router.navigate('/home');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    on($('#register-form'), 'submit', async (e) => {
      e.preventDefault();
      try {
        App.user = await API.auth.register({
          nombre: $('#register-nombre').value,
          email: $('#register-email').value,
          password: $('#register-password').value
        });
        App.applyExperience();
        navbar.style.display = '';
        content.style.paddingBottom = '';
        Router.navigate('/home');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    on($('#forgot-link'), 'click', async (e) => {
      e.preventDefault();
      const form = create('div');
      form.innerHTML = `
        <div class="form-group">
          <label>Email</label>
          <input type="email" class="form-control" id="forgot-email" placeholder="Tu email">
        </div>
      `;
      const footer = create('div', { style: { display: 'flex', gap: '8px' } });
      footer.appendChild(create('button', {
        className: 'btn btn-ghost', textContent: 'Cancelar', onClick: () => Modal.hide()
      }));
      footer.appendChild(create('button', {
        className: 'btn btn-primary', textContent: 'Enviar enlace'
      }));

      Modal.show('Recuperar contraseña', form, { footer });

      on(footer.lastChild, 'click', async () => {
        const email = $('#forgot-email').value;
        if (!email) return showToast('Ingresá tu email', 'error');
        try {
          await API.auth.forgotPassword(email);
          Modal.hide();
          showToast('Si el email existe, recibirás un enlace');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    on($('#clear-cache-btn'), 'click', async () => {
      try {
        if ('caches' in window) {
          const names = await caches.keys();
          await Promise.all(names.map(name => caches.delete(name)));
        }
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
        localStorage.clear();
        sessionStorage.clear();
        location.reload(true);
      } catch (err) {
        location.reload(true);
      }
    });
  },

  renderReset(params) {
    const content = $('#page-content');
    const navbar = $('#navbar');
    navbar.style.display = 'none';

    content.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div class="login-logo">
            <h1>SelimSystem</h1>
            <p>Nueva contraseña</p>
          </div>
          <form id="reset-form">
            <div class="form-group">
              <label>Nueva contraseña</label>
              <input type="password" class="form-control" id="reset-password" required minlength="6">
            </div>
            <button type="submit" class="btn btn-primary btn-full">Restablecer</button>
          </form>
        </div>
      </div>
    `;

    on($('#reset-form'), 'submit', async (e) => {
      e.preventDefault();
      try {
        await API.auth.resetPassword(params.token, $('#reset-password').value);
        showToast('Contraseña actualizada');
        Router.navigate('/login');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
};
