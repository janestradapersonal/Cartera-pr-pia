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
    brand.textContent = 'Gestor de Patrimonio';
    mainNav.insertBefore(brand, mainNav.firstChild);
  }

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
