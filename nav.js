// Nav responsive y marca página activa
(function() {
  const navToggle = document.querySelector('.nav-toggle');
  const navList = document.getElementById('nav-list');
  const mainNav = document.querySelector('.main-nav');

  // Insertar marca/site-brand si no existe
  if (mainNav && !mainNav.querySelector('.site-brand')) {
    const brand = document.createElement('a');
    brand.href = 'index.html';
    brand.className = 'site-brand';
    brand.textContent = 'SenzillamentFinances';
    mainNav.insertBefore(brand, mainNav.firstChild);
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
      // Añadir botón de cerrar sesión (visible)
      const logout = document.createElement('button');
      logout.className = 'btn btn-logout';
      logout.textContent = 'Cerrar sesión';
      logout.style.marginLeft = '8px';
      logout.addEventListener('click', (e) => {
        e.preventDefault();
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
        const u = document.getElementById('sf-username').value.trim();
        const p = document.getElementById('sf-password').value;
        if (!u || !p) return alert('Introduce usuario y contraseña para registrarte');
        if (u.length < 5) return alert('El nombre de usuario debe tener al menos 5 caracteres');
        if (p.length < 8) return alert('La contraseña debe tener al menos 8 caracteres');
        try {
          const ok = await registrarUsuario(u, p);
          if (!ok) return;
          const logged = await iniciarSesion(u, p);
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
        const u = document.getElementById('sf-username').value.trim();
        const p = document.getElementById('sf-password').value;
        if (!u || !p) return alert('Introduce usuario y contraseña');
        try {
          const ok = await iniciarSesion(u, p);
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

  // Crear mini-tab para modo compacto (scroll)
  let miniTab = mainNav ? mainNav.querySelector('.mini-tab') : null;
  if (!miniTab && mainNav) {
    miniTab = document.createElement('button');
    miniTab.className = 'mini-tab';
    miniTab.setAttribute('aria-label', 'Abrir menú');
    miniTab.innerHTML = '<span class="mini-icon" aria-hidden="true">☰</span><span class="visually-hidden">Menú</span>';
    mainNav.appendChild(miniTab);
  }

  // Toggle menú principal en móvil: ahora muestra/oculta clase 'open-panel'
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!expanded));
      mainNav.classList.toggle('open-panel');
    });
  }

  // El cierre del panel se gestiona con el toggle y clic fuera (sin cruz)

  // Mini-tab: abrir menú cuando estamos en modo compacto
  if (miniTab && mainNav) {
    miniTab.addEventListener('click', (e) => {
      e.stopPropagation();
      // alternar clase que muestra nav-list temporalmente
      const open = mainNav.classList.toggle('mini-open');
      miniTab.setAttribute('aria-expanded', String(open));
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
})();
