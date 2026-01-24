// Nav responsive y marca página activa
(function() {
  const navToggle = document.querySelector('.nav-toggle');
  const navList = document.getElementById('nav-list');
  const mainNav = document.querySelector('.main-nav');

  // URL de suscripción: Payment Link de Stripe por defecto
  // Si prefieres gestionar el enlace desde `localStorage.sf_subscribe_url`, déjalo ahí.
  const SUBSCRIBE_URL = 'https://buy.stripe.com/test_dRm28r8Ea6WBde10Y91VK01';
  // Guardar el Payment Link en localStorage para que el botón lo use (y podamos añadir client_reference_id)
  try { localStorage.setItem('sf_subscribe_url', SUBSCRIBE_URL); } catch(e) {}

  // Insertar marca/site-brand si no existe
  if (mainNav && !mainNav.querySelector('.site-brand')) {
    const brand = document.createElement('a');
    brand.href = 'index.html';
    brand.className = 'site-brand';
    brand.textContent = 'SenzillamentFinances';
    mainNav.insertBefore(brand, mainNav.firstChild);
  }

  // Añadir controles a la derecha: selector de idioma + suscribirse
  if (mainNav && !mainNav.querySelector('.nav-controls')) {
    const controls = document.createElement('div');
    controls.className = 'nav-controls';
    controls.style.display = 'inline-flex';
    controls.style.alignItems = 'center';
    controls.style.gap = '10px';
    controls.style.marginLeft = '12px';

    // Suscribirse
    const subBtn = document.createElement('a');
    subBtn.id = 'subscribe-btn';
    subBtn.className = 'nav-subscribe btn';
    subBtn.href = SUBSCRIBE_URL;
    subBtn.target = '_blank';
    subBtn.rel = 'noopener';
    subBtn.textContent = 'Suscribirse';
    // Si existe un Payment Link guardado en localStorage, abrirlo directamente.
    // Si no, navegará a `subscribe.html` (SUBSCRIBE_URL) para que puedas pegar el enlace.
    subBtn.addEventListener('click', function(e){
      try {
        // Requerir sesión: si no hay usuario logueado, abrir modal de login
        const sfUserRaw = localStorage.getItem('sf_user');
        const userObj = sfUserRaw ? JSON.parse(sfUserRaw) : null;
        if (!userObj) {
          e.preventDefault();
          try { if (window.SF && typeof window.SF.showAuthModal === 'function') { window.SF.showAuthModal(); return; } } catch(e){}
          // fallback: ir a la página de subscribe para que el usuario pueda loguear/pegar enlace
          location.href = 'subscribe.html';
          return;
        }

        const url = localStorage.getItem('sf_subscribe_url');
        // Si ya es premium, ofrecer cancelar suscripción
        if (this.dataset && this.dataset.premium === 'true') {
          e.preventDefault();
          const lang = (localStorage.getItem('sf_lang')||'es');
          const confirmMsg = (TRANSLATIONS[lang] && TRANSLATIONS[lang]['subscribe.cancel']) ? TRANSLATIONS[lang]['subscribe.cancel'] + '? ' : '¿Cancelar suscripción?';
          if (!confirm(confirmMsg)) return;
          // intentar cancelar vía backend /cancelar_suscripcion
          const userObjLocal = (()=>{ try{ return JSON.parse(localStorage.getItem('sf_user')||'null'); }catch(e){return null;} })();
          const username = (userObjLocal && userObjLocal.name) ? userObjLocal.name : sessionStorage.getItem('usuario_actual');
          if (!username) { alert('Necesitas iniciar sesión para cancelar la suscripción.'); try { showAuthModal(); } catch(e){}; return; }
          let password = sessionStorage.getItem('pass_actual');
          if (!password) {
            password = prompt('Confirma tu contraseña para cancelar la suscripción');
            if (!password) return;
          }
          (async ()=>{
            try {
              const resp = await fetch(API_URL + '/cancelar_suscripcion', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) });
              const j = await resp.json().catch(()=>null);
              if (!resp.ok) {
                const msg = (j && (j.detail || j.mensaje)) ? (j.detail || j.mensaje) : 'Error cancelando suscripción';
                alert(msg);
                return;
              }
              // marcar localmente cancel_pending para reflejar la cancelación de inmediato en UI
              try { const su = JSON.parse(localStorage.getItem('sf_user')||'null'); if (su) { su.cancel_pending = true; localStorage.setItem('sf_user', JSON.stringify(su)); } } catch(e){}
              alert('Cancelación programada. Seguirás siendo premium hasta el final del periodo.');
              setTimeout(updateSubscribeButtonState, 500);
            } catch (err) {
              alert('No se pudo conectar al servidor para cancelar la suscripción.');
            }
          })();
          return;
        }

        if (url) {
          // marcar que hay una suscripción pendiente (usado por subscribe-success.html)
          try { localStorage.setItem('sf_pending_subscribe', JSON.stringify({user: userObj.name, ts: Date.now()})); } catch(e){}
          e.preventDefault();
          // Añadir client_reference_id para que el webhook reciba el username
          try {
            const base = localStorage.getItem('sf_subscribe_url') || SUBSCRIBE_URL;
            const u = new URL(base, location.href);
            const uname = (userObj && userObj.name) ? userObj.name : (sessionStorage.getItem('usuario_actual') || '');
            if (uname) u.searchParams.set('client_reference_id', uname);
            window.open(u.toString(), '_blank');
          } catch (err) {
            // fallback simple si URL() falla
            window.open(url, '_blank');
          }
        }
      } catch (err) {
        // En caso de error dejamos el comportamiento por defecto (ir a subscribe.html)
      }
    });
    controls.appendChild(subBtn);

    // Selector de idioma (simple <select>)
    const sel = document.createElement('select');
    sel.id = 'lang-select';
    sel.setAttribute('aria-label', 'Seleccionar idioma');
    ['ca','es','en'].forEach(code => {
      const opt = document.createElement('option'); opt.value = code;
      opt.textContent = code === 'ca' ? 'CAT' : (code === 'es' ? 'ES' : 'EN');
      sel.appendChild(opt);
    });
    controls.appendChild(sel);

    mainNav.appendChild(controls);
  }

  // Quitar el botón de tres barras que está a la izquierda (si existe)
  try { if (navToggle && navToggle.parentNode) { navToggle.parentNode.removeChild(navToggle); } } catch(e) {}

  // Traducciones mínimas para elementos principales
  const TRANSLATIONS = {
    en: {
      'nav.quien-soy': '1 - Who I am',
      'nav.porque': '2 - Why invest',
      'nav.aprende': '3 - Learn',
      'nav.cartera': '4 - Build portfolio',
      'nav.toma-accion': '5 - Take action',
      'nav.foro': '6 - Forum',
      'hero.title': 'Senzillament Finances',
      'hero.subtitle': 'Take control of your financial future with simple, honest education.',
      'hero.cta': 'Start now →',
      'subscribe': 'Subscribe',
      'subscribe.newsletter': 'Subscribe to Newsletter €2.99/month',
      'subscribe.cancel': 'Cancel Newsletter subscription',
      'subscribe.until': 'Subscribed until {date}',
      'subscribe.scheduled_until': 'Cancellation scheduled until {date}',
      'subscribe.scheduled': 'Cancellation scheduled',
      'contact.label': 'Contact us via:'
    },
    es: {
      'nav.quien-soy': '1 - Quién soy',
      'nav.porque': '2 - Importancia de invertir',
      'nav.aprende': '3 - Aprende',
      'nav.cartera': '4 - Cómo crearse la cartera',
      'nav.toma-accion': '5 - Toma acción',
      'nav.foro': '6 - Foro',
      'hero.title': 'SenzillamentFinances',
      'hero.subtitle': 'Pren el control del tu futuro financiero con educación simple y honesta.',
      'hero.cta': 'Comienza ahora →',
      'subscribe': 'Suscribirse',
      'subscribe.newsletter': 'Suscribirme a la Newsletter 2,99€ / mes',
      'subscribe.cancel': 'Cancelar subscripción Newsletter',
      'subscribe.scheduled': 'Cancelación programada',
      'subscribe.until': 'Suscrito hasta {date}',
      'subscribe.scheduled_until': 'Cancelación programada hasta {date}',
      'contact.label': 'Contáctanos por:'
    },
    ca: {
      'nav.quien-soy': '1 - Qui sóc',
      'nav.porque': '2 - Importància d’invertir',
      'nav.aprende': '3 - Aprèn',
      'nav.cartera': '4 - Com crear la cartera',
      'nav.toma-accion': '5 - Pren acció',
      'nav.foro': '6 - Fòrum',
      'hero.title': 'Senzillament Finances',
      'hero.subtitle': 'Pren el control del teu futur financer amb educació simple i honesta.',
      'hero.cta': 'Comença ara →',
      'subscribe': 'Subscriu-te',
      'subscribe.newsletter': 'Subscriure\u2019m a la Newsletter 2,99€ / mes',
      'subscribe.cancel': 'Cancel·lar subscripci\u00f3 Newsletter',
      'subscribe.scheduled': 'Cancel·laci\u00f3 programada',
      'subscribe.until': 'Subscriut fins el {date}',
      'subscribe.scheduled_until': 'Cancel·laci\u00f3 programada fins el {date}',
      'contact.label': 'Contacta per:'
    }
  };

  // Formatear timestamp UNIX (segundos) según idioma
  function formatPeriodEnd(ts) {
    if (!ts) return null;
    try {
      const ms = Number(ts) * 1000;
      const lang = (localStorage.getItem('sf_lang')||'es');
      const locale = lang === 'ca' ? 'ca-ES' : (lang === 'en' ? 'en-US' : 'es-ES');
      return new Date(ms).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return null; }
  }
  function applyTranslations(lang) {
    const dict = TRANSLATIONS[lang] || TRANSLATIONS['es'];
    // nav items
    document.querySelectorAll('.nav-item').forEach(link => {
      const page = link.getAttribute('data-page');
      if (!page) return;
      let key = null;
      if (page === 'quien-soy') key = 'nav.quien-soy';
      if (page === 'porque-invertir') key = 'nav.porque';
      if (page === 'conceptos-basicos') key = 'nav.aprende';
      if (page === 'index' || page === 'gestor') key = 'nav.cartera';
      if (page === 'toma-accion') key = 'nav.toma-accion';
      if (page === 'foro') key = 'nav.foro';
      if (key && dict[key]) link.textContent = dict[key];
    });

    // hero
    try {
      const h1 = document.querySelector('.hero-title'); if (h1 && dict['hero.title']) h1.textContent = dict['hero.title'];
      const sub = document.querySelector('.hero-subtitle'); if (sub && dict['hero.subtitle']) sub.textContent = dict['hero.subtitle'];
      const cta = document.querySelector('.hero-cta'); if (cta && dict['hero.cta']) cta.textContent = dict['hero.cta'];
    } catch (e) { /* ignore */ }

    // footer/contact label
    try { const cl = document.querySelector('.site-footer .contact .contact-label'); if (cl && dict['contact.label']) cl.textContent = dict['contact.label']; } catch(e){}

    // subscribe button label (default: newsletter CTA)
    try { const sb = document.getElementById('subscribe-btn'); if (sb) sb.textContent = dict['subscribe.newsletter'] || dict['subscribe'] || 'Suscribirse'; } catch(e){}
  }

  // API base (coincide con scripts.js)
  const API_URL = 'https://cartera-pr-pia.onrender.com';

  // Actualizar el estado del botón Suscribirse según si el usuario es premium
  async function updateSubscribeButtonState() {
    try {
      const btn = document.getElementById('subscribe-btn');
      if (!btn) return;
      btn.classList.remove('subscribed');
      // usuario en localStorage (la UI usa localStorage sf_user)
      const su = localStorage.getItem('sf_user');
      if (!su) {
        const lang = (localStorage.getItem('sf_lang')||'es');
        btn.textContent = TRANSLATIONS[lang]['subscribe.newsletter'] || TRANSLATIONS[lang]['subscribe'] || 'Suscribirme a la Newsletter 2,99€ / mes';
        btn.href = SUBSCRIBE_URL;
        btn.dataset.premium = 'false';
        return;
      }
      const userObj = JSON.parse(su);
      // Intentar usar credenciales de sessionStorage para verificar con el servidor
      const username = sessionStorage.getItem('usuario_actual') || userObj.name;
      const password = sessionStorage.getItem('pass_actual');
      if (!username || !password) {
        // No tenemos contraseña: intentar fallback querying debug endpoint por username
        try {
          const debugResp = await fetch(API_URL + '/debug/user/' + encodeURIComponent(username || userObj.name));
          if (debugResp && debugResp.ok) {
              const debugJson = await debugResp.json();
                if (debugJson && debugJson.cancel_pending === true) {
                  const lang = (localStorage.getItem('sf_lang')||'es');
                  const pe = debugJson.subscription_period_end || null;
                  const dateStr = formatPeriodEnd(pe);
                  if (dateStr) {
                    const tpl = TRANSLATIONS[lang]['subscribe.scheduled_until'] || TRANSLATIONS[lang]['subscribe.scheduled'] || 'Cancelación programada';
                    btn.textContent = tpl.replace('{date}', dateStr);
                  } else {
                    btn.textContent = TRANSLATIONS[lang]['subscribe.scheduled'] || TRANSLATIONS[lang]['subscribe.cancel'] || 'Cancelación programada';
                  }
                  btn.classList.add('scheduled');
                  btn.href = '#';
                  btn.dataset.premium = 'true';
                  btn.dataset.cancel_pending = 'true';
                  return;
                }
                if (debugJson && debugJson.premium === true) {
                  const lang = (localStorage.getItem('sf_lang')||'es');
                  // Mostrar etiqueta de cancelar mientras no haya cancel_pending
                  btn.textContent = TRANSLATIONS[lang]['subscribe.cancel'] || TRANSLATIONS[lang]['subscribe'] || 'Cancelar subscripción Newsletter';
                  btn.classList.add('subscribed');
                  btn.href = '#';
                  btn.dataset.premium = 'true';
                  return;
                }
          }
        } catch (e) { /* ignore */ }
        // fallback por defecto
        const l = (localStorage.getItem('sf_lang')||'es');
        btn.textContent = TRANSLATIONS[l]['subscribe.newsletter'] || TRANSLATIONS[l]['subscribe'] || 'Suscribirme a la Newsletter 2,99€ / mes';
        btn.href = SUBSCRIBE_URL;
        btn.dataset.premium = 'false';
        return;
      }
      // Llamar a /login para obtener datos del usuario
      try {
        const resp = await fetch(API_URL + '/login', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ username, password })
        });
        if (!resp.ok) throw new Error('login failed');
        const data = await resp.json();
        const datos = data.datos || {};
        const apiPremium = (data.premium === true) || (datos && datos.premium === true);
        const apiCancel = (data.cancel_pending === true) || (datos && datos.cancel_pending === true);

        // Si Stripe redirigió y marcó sf_subscription_completed, y aún no tenemos premium,
        // intentar actualizar la BD automáticamente desde esta pestaña (si disponemos de credenciales).
        const completedRaw = localStorage.getItem('sf_subscription_completed');
        const completed = completedRaw ? (() => { try { return JSON.parse(completedRaw); } catch(e){return null;} })() : null;
        if (completed && !apiPremium) {
          try {
            const newDatos = Object.assign({}, datos, { premium: true });
            await fetch(API_URL + '/guardar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username, password, datos: newDatos }) });
            try { localStorage.removeItem('sf_subscription_completed'); } catch(e){}
            // mark locally
            apiPremium = true; // eslint-disable-line no-param-reassign
          } catch (err) { /* ignore server update errors */ }
        }

        // prefer server-provided period end if está disponible
        let periodEnd = data.subscription_period_end || (datos && datos.subscription_period_end) || null;
        if (apiCancel) {
          const lang = (localStorage.getItem('sf_lang')||'es');
          const dateStr = formatPeriodEnd(periodEnd);
          if (dateStr) {
            const tpl = TRANSLATIONS[lang]['subscribe.scheduled_until'] || TRANSLATIONS[lang]['subscribe.scheduled'] || 'Cancelación programada';
            btn.textContent = tpl.replace('{date}', dateStr);
          } else {
            btn.textContent = TRANSLATIONS[lang]['subscribe.scheduled'] || TRANSLATIONS[lang]['subscribe.cancel'] || 'Cancelación programada';
          }
          btn.classList.add('scheduled');
          btn.href = '#';
          btn.dataset.premium = 'true';
          btn.dataset.cancel_pending = 'true';
        } else if (apiPremium) {
          const lang = (localStorage.getItem('sf_lang')||'es');
          // Si el usuario es premium y no hay cancel_pending, mostrar la acción de cancelar (sin fecha)
          btn.textContent = TRANSLATIONS[lang]['subscribe.cancel'] || TRANSLATIONS[lang]['subscribe'] || 'Cancelar subscripción Newsletter';
          btn.classList.add('subscribed');
          btn.href = '#';
          btn.dataset.premium = 'true';
        } else {
          const lang = (localStorage.getItem('sf_lang')||'es');
          btn.textContent = TRANSLATIONS[lang]['subscribe.newsletter'] || TRANSLATIONS[lang]['subscribe'] || 'Suscribirme a la Newsletter 2,99€ / mes';
          btn.href = SUBSCRIBE_URL;
          btn.dataset.premium = 'false';
        }
      } catch (e) {
        // en caso de fallo, dejar por defecto
        const _l = (localStorage.getItem('sf_lang')||'es');
        btn.textContent = TRANSLATIONS[_l]['subscribe.newsletter'] || TRANSLATIONS[_l]['subscribe'] || 'Suscribirme a la Newsletter 2,99€ / mes';
        btn.href = SUBSCRIBE_URL;
        btn.dataset.premium = 'false';
      }
    } catch (e) { /* ignore */ }
  }

  // Escuchar cambios de sesión o eventos relacionados con suscripción
  window.addEventListener('sf:auth-changed', () => { setTimeout(() => { updateSubscribeButtonState(); ensureNewsletterLink(); }, 200); });
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    if (e.key === 'sf_subscription_completed' || e.key === 'sf_pending_subscribe' || e.key === 'sf_user') {
      setTimeout(updateSubscribeButtonState, 200);
    }
  });

  // --- Newsletter link: mostrar solo si el usuario es premium ---
  function removeNewsletterLink() {
    try {
      const existing = document.querySelector('.nav-item[data-page="newsletter"]');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    } catch (e) {}
  }

  async function ensureNewsletterLink() {
    try {
      const navListEl = document.getElementById('nav-list');
      if (!navListEl) return;
      // obtener credenciales desde sessionStorage (si existen)
      const username = sessionStorage.getItem('usuario_actual') || null;
      const password = sessionStorage.getItem('pass_actual') || null;
      if (!username || !password) {
        removeNewsletterLink();
        return;
      }
      // llamar al endpoint /me para comprobar premium
      try {
        const resp = await fetch(API_URL + '/me', {
          headers: { 'x-username': username, 'x-password': password }
        });
        if (!resp.ok) { removeNewsletterLink(); return; }
        const j = await resp.json();
        if (j && j.premium === true) {
          // añadir link si no existe
          if (!document.querySelector('.nav-item[data-page="newsletter"]')) {
            const a = document.createElement('a');
            a.className = 'nav-item';
            a.setAttribute('data-page', 'newsletter');
            a.href = 'newsletter.html';
            a.textContent = '7 - NEWSLETTER';
            // añadir al final de la lista
            try { navListEl.appendChild(a); } catch(e){ navListEl.appendChild(a); }
          }
        } else {
          removeNewsletterLink();
        }
      } catch (err) {
        removeNewsletterLink();
      }
    } catch (e) {}
  }

  // Persistencia y manejo del selector
  const langSelect = document.getElementById('lang-select');
  if (langSelect) {
    const saved = localStorage.getItem('sf_lang') || (navigator.language && navigator.language.startsWith('en') ? 'en' : (navigator.language && navigator.language.startsWith('ca') ? 'ca' : 'es'));
    langSelect.value = saved;
    applyTranslations(saved);
    langSelect.addEventListener('change', () => {
      const v = langSelect.value || 'es';
      localStorage.setItem('sf_lang', v);
      applyTranslations(v);
      try { window.dispatchEvent(new CustomEvent('sf:lang-changed', { detail: { lang: v } })); } catch(e){}
    });
  }

  // --- Persistencia de usuario en cabecera (localStorage) ---
  const USER_KEY = 'sf_user';
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
  }
  function setUser(user) {
    if (!user) return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    renderUser();
  }
  function clearUser() {
    localStorage.removeItem(USER_KEY);
    renderUser();
  }

  function renderUser() {
    if (!mainNav) return;
    let userArea = mainNav.querySelector('.nav-user-area');
    if (!userArea) {
      userArea = document.createElement('div');
      userArea.className = 'nav-user-area';
      // marcar que este contenedor lo creó el script para distinguirlo de elementos estáticos
      userArea.dataset.sfGenerated = '1';
      mainNav.appendChild(userArea);
    }
    userArea.innerHTML = '';
    // ocultar cualquier elemento estático #navUser o controles duplicados que algunas páginas insertan
    try{
      const staticById = document.getElementById('navUser'); if (staticById) staticById.style.display = 'none';
    }catch(e){}
    try{
      document.querySelectorAll('.nav-user').forEach(nu=>{
        // si el elemento '.nav-user' no está dentro del contenedor que creó este script, ocultarlo
        if (!nu.closest('.nav-user-area') || nu.closest('.nav-user-area').dataset.sfGenerated !== '1') {
          nu.style.display = 'none';
        }
      });
    }catch(e){}
    const user = getUser();
    if (user && user.name) {
      const wrapper = document.createElement('div');
      wrapper.className = 'nav-user sf-active-user';

      const img = document.createElement('img');
      img.className = 'nav-user-avatar';
      img.src = user.avatar || 'imagenes/foto_de_perfil.png';
      img.alt = user.name;
      img.width = 34;
      img.height = 34;

      const name = document.createElement('small');
      name.textContent = user.name;

      wrapper.appendChild(img);
      wrapper.appendChild(name);
      // Botón Perfil (abre mini-dropdown para solicitar roles)
      const profileBtn = document.createElement('button');
      profileBtn.className = 'btn profile-btn';
      profileBtn.textContent = 'Perfil';
      profileBtn.style.marginLeft = '8px';
      profileBtn.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        let drop = wrapper.querySelector('.profile-drop');
        if (!drop) {
          drop = document.createElement('div');
          drop.className = 'profile-drop';
          drop.style.position = 'absolute';
          drop.style.background = '#fff';
          drop.style.border = '1px solid #ddd';
          drop.style.padding = '8px';
          drop.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
          drop.style.zIndex = '10001';
          const btn2 = document.createElement('button'); btn2.textContent = 'Solicitar nivel 2'; btn2.style.display='block'; btn2.style.marginBottom='6px';
          const btnJ = document.createElement('button'); btnJ.textContent = 'Solicitar JEFE'; btnJ.style.display='block';
          btn2.addEventListener('click', ()=>{ requestRole('PREGUNTADOR_2'); try{ drop.remove(); }catch(e){} });
          btnJ.addEventListener('click', ()=>{ requestRole('JEFE'); try{ drop.remove(); }catch(e){} });
          drop.appendChild(btn2); drop.appendChild(btnJ);
          wrapper.appendChild(drop);
        } else {
          try{ drop.remove(); }catch(e){}
        }
      });
      wrapper.appendChild(profileBtn);
      // En móvil: al clicar la imagen alternamos visibilidad del nombre y logout
      try {
        img.style.cursor = 'pointer';
        img.addEventListener('click', (ev) => {
          ev.stopPropagation();
          try {
            if (window.innerWidth <= 700) {
              wrapper.classList.toggle('mobile-open');
            }
          } catch(e) {}
        });
      } catch(e) {}
      // Añadir botón de cerrar sesión (visible)
      const logout = document.createElement('button');
      logout.className = 'btn btn-logout';
      logout.textContent = 'Cerrar sesión';
      logout.style.marginLeft = '8px';
      logout.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try{ sessionStorage.removeItem('foro_current'); localStorage.removeItem('foro_current'); }catch(err){}
        try{ localStorage.removeItem(USER_KEY); }catch(err){}
        try{ window.dispatchEvent(new CustomEvent('sf:auth-changed', { detail: { user: null } })); }catch(err){}
        clearUser();
      });
      wrapper.appendChild(logout);
      userArea.appendChild(wrapper);
      userArea.appendChild(wrapper);
    } else {
      const loginBtn = document.createElement('button');
      loginBtn.className = 'nav-login';
      loginBtn.textContent = 'Iniciar sesión';
      loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showAuthModal();
      });
      userArea.appendChild(loginBtn);
    }
  }

  async function requestRole(role) {
    try {
      const username = sessionStorage.getItem('usuario_actual');
      const password = sessionStorage.getItem('pass_actual');
      if (!username || !password) return alert('Inicia sesión para solicitar roles');
      const resp = await fetch(API_URL + '/role-requests', { method: 'POST', headers: {'Content-Type':'application/json', 'x-username': username, 'x-password': password}, body: JSON.stringify({ requested_role: role }) });
      if (!resp.ok) {
        const j = await resp.json().catch(()=>null);
        return alert('Error creando solicitud: ' + (j && j.detail ? j.detail : resp.statusText));
      }
      const j = await resp.json().catch(()=>null) || {};
      if (j.email_sent === false) {
        alert('Solicitud creada, pero no se pudo enviar el email al administrador. Contacta manualmente.');
      } else {
        alert('Solicitud creada. Se ha enviado un email al administrador.');
      }
    } catch (e) { alert('Error al crear la solicitud'); }
  }

  /* --- Modal de autenticación (registro / inicio) --- */
  function createAuthModal() {
    if (document.getElementById('sfAuthOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'sfAuthOverlay';
    overlay.className = 'sf-modal-overlay';
    overlay.innerHTML = `
      <div class="sf-modal" role="dialog" aria-modal="true" aria-label="Iniciar sesión o registrarse">
        <button class="sf-close" aria-label="Cerrar">✕</button>
        <h3>Iniciar sesión o registrarse</h3>
        <div class="sf-row"><input id="sf-email" type="email" placeholder="Email" /></div>
        <div class="sf-row"><input id="sf-username" type="text" placeholder="Nombre de usuario" /></div>
        <div class="sf-row">
          <div class="password-wrapper">
            <input id="sf-password" type="password" placeholder="Contraseña" />
            <button id="sf-toggle-password" type="button" class="sf-eye" aria-label="Mostrar contraseña">
              <img src="imagenes/ull_obert.png" alt="Mostrar" />
            </button>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;"><label><input id="sf-remember" type="checkbox"/> Recordarme</label></div>
        <div class="sf-actions">
          <button id="sf-register" class="btn">Registrar</button>
          <button id="sf-login" class="btn">Iniciar sesión</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // handlers
    overlay.querySelector('.sf-close').addEventListener('click', hideAuthModal);
    overlay.addEventListener('click', (e)=>{ if (e.target === overlay) hideAuthModal(); });

    // Toggle mostrar/ocultar contraseña (botón ojo)
    try{
      const pwdInput = overlay.querySelector('#sf-password');
      const toggleBtn = overlay.querySelector('#sf-toggle-password');
      if (pwdInput && toggleBtn) {
        const img = toggleBtn.querySelector('img');
        toggleBtn.addEventListener('click', (ev)=>{
          ev.preventDefault();
          const nowShow = pwdInput.type === 'password';
          // si nowShow === true, cambiamos de password -> text (mostrar)
          pwdInput.type = nowShow ? 'text' : 'password';
          // invertir la imagen respecto al comportamiento previo: cuando se muestra, usar ojo cerrado, y viceversa
          toggleBtn.setAttribute('aria-label', nowShow ? 'Ocultar contraseña' : 'Mostrar contraseña');
          try{
            if (img) img.src = nowShow ? 'imagenes/ull_tancat.png' : 'imagenes/ull_obert.png';
          }catch(e){}
          pwdInput.focus();
        });
      }
    }catch(e){ /* no bloquear si algo falla */ }

    document.getElementById('sf-register').addEventListener('click', ()=>{
      (async ()=>{
        const e = document.getElementById('sf-email').value.trim();
        const u = document.getElementById('sf-username').value.trim();
        const p = document.getElementById('sf-password').value;
        if (!e || !u || !p) return alert('Introduce email, usuario y contraseña para registrarte');
        if (u.length < 5) return alert('El nombre de usuario debe tener al menos 5 caracteres');
        if (p.length < 8) return alert('La contraseña debe tener al menos 8 caracteres');
        try {
          // soportar distintas formas de exponer la función (global o en window.SF)
          let ok = false;
          if (typeof window.registrarUsuario === 'function') {
            ok = await window.registrarUsuario(e, u, p);
          } else if (window.SF && typeof window.SF.registrarUsuario === 'function') {
            ok = await window.SF.registrarUsuario(e, u, p);
          } else if (typeof registrarUsuario === 'function') {
            ok = await registrarUsuario(e, u, p);
          } else {
            // fallback: llamar al backend directamente
            try {
              const resp = await fetch(API_URL + '/registro', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ email: e, username: u, password: p })
              });
              const j = await resp.json().catch(()=>null);
              if (resp.ok) {
                ok = true;
              } else {
                alert('Error registro: ' + (j && (j.detail||j.mensaje) ? (j.detail||j.mensaje) : resp.statusText));
                return;
              }
            } catch (e) {
              alert('No se pudo conectar al servidor para registrar.');
              return;
            }
          }
          if (!ok) return;
          // iniciar sesión usando la función disponible
          let logged = false;
          if (typeof window.iniciarSesion === 'function') {
            logged = await window.iniciarSesion(e, u, p);
          } else if (window.SF && typeof window.SF.iniciarSesion === 'function') {
            logged = await window.SF.iniciarSesion(e, u, p);
          } else if (typeof iniciarSesion === 'function') {
            logged = await iniciarSesion(e, u, p);
          } else {
            // fallback: llamar a /login directamente y aplicar efectos localmente
            try {
              const resp = await fetch(API_URL + '/login', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ email: e || undefined, username: u, password: p })
              });
              const data = await resp.json().catch(()=>null);
              if (resp.ok) {
                logged = true;
                // guardar en session/local
                try { sessionStorage.setItem('usuario_actual', u); sessionStorage.setItem('pass_actual', p); } catch(e){}
                try { localStorage.setItem('sf_user', JSON.stringify({ name: u, avatar: 'imagenes/foto_de_perfil.png', premium: !!(data && data.premium) })); } catch(e){}
                try { window.dispatchEvent(new CustomEvent('sf:auth-changed', { detail: { user: u } })); } catch(e){}
              } else {
                alert('Usuario o contraseña incorrectos');
                return;
              }
            } catch(e) {
              alert('Error conectando al servidor para login.');
              return;
            }
          }
          if (logged) {
            const avatar = 'imagenes/foto_de_perfil.png';
            const userObj = { name: u, avatar };
            try{ localStorage.setItem('sf_user', JSON.stringify(userObj)); sessionStorage.setItem('foro_current', u); }catch(e){}
            try { sessionStorage.setItem('usuario_actual', u); sessionStorage.setItem('pass_actual', p); } catch(e){}
            if (document.getElementById('sf-remember').checked) { localStorage.setItem('foro_current', u); }
            renderUser(); hideAuthModal();
            try{ window.dispatchEvent(new CustomEvent('sf:auth-changed', { detail: { user: u } })); }catch(e){}
          }
        } catch (e) { console && console.warn && console.warn('registro error', e); }
      })();
    });

    document.getElementById('sf-login').addEventListener('click', ()=>{
      (async ()=>{
        const e = document.getElementById('sf-email').value.trim();
        const u = document.getElementById('sf-username').value.trim();
        const p = document.getElementById('sf-password').value;
        if (!e || !u || !p) return alert('Introduce email, usuario y contraseña');
        try {
          let ok = false;
          if (typeof window.iniciarSesion === 'function') {
            ok = await window.iniciarSesion(e, u, p);
          } else if (window.SF && typeof window.SF.iniciarSesion === 'function') {
            ok = await window.SF.iniciarSesion(e, u, p);
          } else if (typeof iniciarSesion === 'function') {
            ok = await iniciarSesion(e, u, p);
          } else {
            // fallback: llamar a /login directamente
            try {
              const resp = await fetch(API_URL + '/login', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ email: e || undefined, username: u, password: p })
              });
              const data = await resp.json().catch(()=>null);
              if (resp.ok) {
                ok = true;
                try { sessionStorage.setItem('usuario_actual', u); sessionStorage.setItem('pass_actual', p); } catch(e){}
                try { localStorage.setItem('sf_user', JSON.stringify({ name: u, avatar: 'imagenes/foto_de_perfil.png', premium: !!(data && data.premium) })); } catch(e){}
                try{ window.dispatchEvent(new CustomEvent('sf:auth-changed', { detail: { user: u } })); } catch(e){}
              } else {
                alert('Usuario o contraseña incorrectos');
                return;
              }
            } catch (e) { alert('Error conectando al servidor para login.'); return; }
          }
          if (!ok) { alert('Usuario o contraseña incorrectos'); return; }
          const avatar = 'imagenes/foto_de_perfil.png';
          const userObj = { name: u, avatar };
          try{ localStorage.setItem('sf_user', JSON.stringify(userObj)); sessionStorage.setItem('foro_current', u); }catch(e){}
          try { sessionStorage.setItem('usuario_actual', u); sessionStorage.setItem('pass_actual', p); } catch(e){}
          if (document.getElementById('sf-remember').checked) { localStorage.setItem('foro_current', u); }
          renderUser(); hideAuthModal();
          try{ window.dispatchEvent(new CustomEvent('sf:auth-changed', { detail: { user: u } })); }catch(e){}
          alert('Has iniciado sesión correctamente');
        } catch (e) { console && console.warn && console.warn('login error', e); }
      })();
    });
  }

  function showAuthModal(){ createAuthModal(); const o = document.getElementById('sfAuthOverlay'); if (o) o.classList.add('show'); document.getElementById('sf-username').focus(); }
  function hideAuthModal(){ const o = document.getElementById('sfAuthOverlay'); if (o) o.classList.remove('show'); }

  // Exponer API mínima para que otras páginas puedan registrar/limpiar usuario
  window.SF = window.SF || {};
  window.SF.setUser = setUser;
  window.SF.clearUser = clearUser;
  window.SF.getUser = getUser;
  window.SF.showAuthModal = showAuthModal;

  // Render inicial del estado de sesión
  renderUser();

  // Si la sesión cambia en otra pestaña (localStorage), actualizar UI automáticamente
  window.addEventListener('storage', (e) => {
    if (e.key === USER_KEY) {
      renderUser();
    }
  });

  // Obtén la página actual (sin extensión .html)
  const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';

  // Marca la página actual como activa
  document.querySelectorAll('.nav-item').forEach(link => {
    const linkPage = link.getAttribute('data-page');
    if (linkPage === currentPage) {
      link.classList.add('active');
      // Si es un submenú, abre el parent
      const subMenu = link.closest('.has-sub');
      if (subMenu) {
        const subToggle = subMenu.querySelector('.sub-toggle');
        if (subToggle) {
          subMenu.classList.add('open');
          subToggle.setAttribute('aria-expanded', 'true');
        }
      }
    }
  });

  // (Se eliminó el botón de cierre visual para un aspecto más limpio)

  // Crear mini-tab (botón de tres barras) que siempre abre el panel móvil
  let miniTab = mainNav ? mainNav.querySelector('.mini-tab') : null;
  if (!miniTab && mainNav) {
    miniTab = document.createElement('button');
    miniTab.className = 'mini-tab';
    miniTab.setAttribute('aria-label', 'Abrir menú');
    miniTab.innerHTML = '<span class="mini-icon" aria-hidden="true">☰</span><span class="visually-hidden">Menú</span>';
    mainNav.appendChild(miniTab);
  }

  // Mobile menu panel (hidden). We'll populate it when in mobile mode.
  let mobileMenu = mainNav ? mainNav.querySelector('.mobile-menu') : null;
  if (!mobileMenu && mainNav) {
    mobileMenu = document.createElement('div');
    mobileMenu.className = 'mobile-menu';
    mobileMenu.style.display = 'none';
    mobileMenu.style.position = 'absolute';
    mobileMenu.style.top = '56px';
    mobileMenu.style.right = '12px';
    mobileMenu.style.background = 'white';
    mobileMenu.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
    mobileMenu.style.borderRadius = '8px';
    mobileMenu.style.padding = '10px';
    mobileMenu.style.zIndex = '9999';
    mobileMenu.style.minWidth = '200px';
    mainNav.appendChild(mobileMenu);
  }

  // Se elimina el manejador del nav-toggle izquierdo porque el diseño usa el mini-tab derecho.

  // El cierre del panel se gestiona con el toggle y clic fuera (sin cruz)

  // Manejador del mini-tab: siempre abrir/cerrar el panel móvil y repoblar su contenido
  if (miniTab && mainNav) {
    miniTab.addEventListener('click', (e) => {
      e.stopPropagation();
      // Alternar clase visual
      const open = mainNav.classList.toggle('mini-open');
      miniTab.setAttribute('aria-expanded', String(open));
      try {
        if (open) {
          // repoblar y mostrar el panel
          try { mobileMenu.innerHTML = ''; } catch(e){}
          try { enterMobileMode(); } catch(e){}
          // posicionamiento adaptativo: en pantallas pequeñas ocupar lateral completo
          if (window.innerWidth <= 700) {
            mobileMenu.style.position = 'fixed';
            mobileMenu.style.top = '0';
            mobileMenu.style.left = '0';
            mobileMenu.style.right = 'auto';
            mobileMenu.style.height = '100vh';
            mobileMenu.style.width = '80vw';
            mobileMenu.style.padding = '14px';
            mobileMenu.style.borderRadius = '0';
            mobileMenu.style.overflowY = 'auto';
            mobileMenu.style.boxShadow = '2px 0 18px rgba(0,0,0,0.18)';
            mobileMenu.style.zIndex = '20000';
          } else {
            mobileMenu.style.position = 'absolute';
            mobileMenu.style.top = '56px';
            mobileMenu.style.right = '12px';
            mobileMenu.style.left = 'auto';
            mobileMenu.style.height = 'auto';
            mobileMenu.style.width = 'auto';
            mobileMenu.style.padding = '10px';
            mobileMenu.style.borderRadius = '8px';
            mobileMenu.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
          }
          mobileMenu.style.display = 'block';
          // añadir clase 'show' para animación (dejar tiempo al display)
          try { setTimeout(()=>{ mobileMenu.classList.add('show'); }, 20); } catch(e){}
        } else {
          try { mobileMenu.classList.remove('show'); } catch(e){}
          // esperar la animación antes de ocultar
          try { setTimeout(()=>{ mobileMenu.style.display = 'none'; }, 280); } catch(e){ mobileMenu.style.display = 'none'; }
        }
      } catch (err) {}
    });
  }

  // Toggle submenús (mantener)
  document.querySelectorAll('.sub-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const li = btn.closest('.has-sub');
      const open = li.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  // Cerrar menú al clicar fuera
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.main-nav')) {
      document.querySelectorAll('.has-sub.open').forEach(el => el.classList.remove('open'));
      if (mainNav) mainNav.classList.remove('open-panel');
      if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
      if (mainNav) mainNav.classList.remove('mini-open');
      try { if (mobileMenu) mobileMenu.style.display = 'none'; } catch(e){}
    }
  });

  // Compactar header al hacer scroll: cuando scrollY > threshold
  const compactThreshold = 140;
  function checkScroll() {
    if (!mainNav) return;
    if (window.scrollY > compactThreshold) {
      mainNav.classList.add('compact');
    } else {
      mainNav.classList.remove('compact');
      mainNav.classList.remove('mini-open');
    }
  }
  checkScroll();
  window.addEventListener('scroll', checkScroll);

  // Mobile mode detection: abbreviate brand and prepare mobile menu
  function enterMobileMode() {
    try { const brand = mainNav.querySelector('.site-brand'); if (brand) brand.textContent = 'SF'; } catch(e){}
    try { const c = mainNav.querySelector('.nav-controls'); if (c) { c.style.display = 'inline-flex'; c.style.gap = '6px'; c.style.alignItems = 'center'; } } catch(e){}
    try { if (miniTab) { miniTab.style.display = 'inline-flex'; miniTab.style.zIndex = '20001'; miniTab.style.position = 'relative'; } } catch(e){}
    // populate mobileMenu with ordered items if empty
    try {
      if (mobileMenu && (!mobileMenu.childNodes || mobileMenu.childNodes.length === 0)) {
        // header con marca y cierre
        try {
          const header = document.createElement('div'); header.className = 'mobile-header';
          const b = document.createElement('div'); b.className = 'brand'; b.textContent = 'SF'; header.appendChild(b);
          const closeBtn = document.createElement('button'); closeBtn.className = 'mobile-close'; closeBtn.setAttribute('aria-label','Cerrar menú'); closeBtn.innerHTML = '✕';
          closeBtn.addEventListener('click', (e)=>{ e.preventDefault(); try{ mobileMenu.classList.remove('show'); mainNav.classList.remove('mini-open'); if (miniTab) miniTab.setAttribute('aria-expanded','false'); setTimeout(()=>{ try{ mobileMenu.style.display='none'; }catch(e){} }, 280); }catch(err){} });
          header.appendChild(closeBtn);
          mobileMenu.appendChild(header);
        } catch(e){}
        // nav titles (clonado, sin la clase que lo oculta)
        const navList = document.querySelector('#nav-list');
        if (navList) {
          try {
            const cloned = navList.cloneNode(true);
            cloned.classList.remove('nav-list');
            cloned.classList.add('mobile-nav-list');
            if (cloned.id) cloned.id = '';
            mobileMenu.appendChild(cloned);
          } catch(e) { mobileMenu.appendChild(navList.cloneNode(true)); }
        }
        // user area compact: mostrar solo avatar; al clicar muestra nombre y cerrar sesión
        try {
          const muWrap = document.createElement('div'); muWrap.className = 'mobile-user'; muWrap.style.margin = '6px 0'; muWrap.style.display = 'flex'; muWrap.style.alignItems = 'center';
          const current = getUser();
          const avatarBtn = document.createElement('button');
          avatarBtn.className = 'mobile-avatar-btn';
          avatarBtn.style.border = 'none'; avatarBtn.style.background = 'transparent'; avatarBtn.style.padding = '0'; avatarBtn.style.marginRight = '8px';
          const ava = document.createElement('img'); ava.className = 'mobile-avatar-img'; ava.src = (current && current.avatar) ? current.avatar : 'imagenes/foto_de_perfil.png'; ava.alt = (current && current.name) ? current.name : 'Usuario'; ava.style.width = '36px'; ava.style.height = '36px'; ava.style.borderRadius = '50%'; ava.style.objectFit = 'cover'; ava.style.boxShadow = '0 4px 10px rgba(0,0,0,0.08)';
          avatarBtn.appendChild(ava);
          muWrap.appendChild(avatarBtn);
          // hidden panel with name + logout
          const drop = document.createElement('div'); drop.className = 'mobile-avatar-drop'; drop.style.display = 'none'; drop.style.marginLeft = '6px';
          if (current && current.name) {
            const nameEl = document.createElement('div'); nameEl.textContent = current.name; nameEl.style.fontWeight = '700'; nameEl.style.marginBottom = '6px'; drop.appendChild(nameEl);
            const lo = document.createElement('button'); lo.className = 'btn btn-logout-mobile'; lo.textContent = 'Cerrar sesión';
            lo.addEventListener('click', ()=>{ try{ localStorage.removeItem(USER_KEY); sessionStorage.removeItem('usuario_actual'); sessionStorage.removeItem('pass_actual'); renderUser(); try{ window.dispatchEvent(new CustomEvent('sf:auth-changed',{detail:{user:null}})); }catch(e){} }catch(e){} });
            drop.appendChild(lo);
          } else {
            const li = document.createElement('button'); li.className = 'btn mobile-login'; li.textContent = 'Iniciar sesión';
            li.addEventListener('click', (e)=>{ e.preventDefault(); try{ showAuthModal(); }catch(err){} });
            drop.appendChild(li);
          }
          muWrap.appendChild(drop);
          avatarBtn.addEventListener('click', (e)=>{ e.preventDefault(); try { drop.style.display = drop.style.display === 'none' ? 'block' : 'none'; } catch(err){} });
          mobileMenu.appendChild(muWrap);
        } catch(e){}
        // Ensure main controls are compact and visible in header (language + subscribe)
        try {
          const controls = mainNav.querySelector('.nav-controls');
          if (controls) {
            const lang = controls.querySelector('#lang-select');
            const sub = controls.querySelector('#subscribe-btn');
            if (lang) {
              lang.style.width = '48px'; lang.style.padding = '4px'; lang.style.fontSize = '13px';
            }
            if (sub) {
              sub.classList.add('mobile-subscribe-small');
              sub.style.padding = '6px 8px'; sub.style.fontSize = '13px';
            }
          }
        } catch(e){}
      }
    } catch(e){}
  }

  function exitMobileMode() {
    try { const brand = mainNav.querySelector('.site-brand'); if (brand) brand.textContent = 'SenzillamentFinances'; } catch(e){}
    try { const c = mainNav.querySelector('.nav-controls'); if (c) c.style.display = 'inline-flex'; } catch(e){}
    try { if (mobileMenu) { mobileMenu.style.display = 'none'; mobileMenu.innerHTML = ''; } } catch(e){}
    try { if (miniTab) { miniTab.style.display = 'none'; } } catch(e){}
  }

  function checkMobile() {
    try {
      const isMobile = window.innerWidth <= 700;
      if (isMobile) enterMobileMode(); else exitMobileMode();
    } catch(e){}
  }
  window.addEventListener('resize', checkMobile);
  checkMobile();

  // Refresh mobile menu when auth/lang changes
  window.addEventListener('sf:auth-changed', () => { try { if (mobileMenu) { mobileMenu.innerHTML = ''; if (mainNav.classList.contains('mini-open')) mobileMenu.style.display = 'block'; } } catch(e){} });
  window.addEventListener('storage', (e) => { try { if (!e.key) return; if (['sf_user','sf_lang','sf_subscription_completed','sf_pending_subscribe'].includes(e.key)) { if (mobileMenu) mobileMenu.innerHTML = ''; } } catch(e){} });

  // Comprobar estado de suscripción al cargar la página y ajustar link de newsletter
  setTimeout(() => { updateSubscribeButtonState(); ensureNewsletterLink(); }, 300);
})();
