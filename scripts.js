// Paletas por categoría (más contraste entre tonalidades)
const paletaColchon = [
  "#0b3d91","#0f4fa8","#1565c0","#1976d2","#1e88e5","#42a5f5","#64b5f6","#90caf9","#b3e5fc","#e3f2fd","#cfe8ff","#9fd0ff"
]; // azules (de más oscuro a más claro)
const paletaFija = [
  "#0b6623","#1b5e20","#2e7d32","#388e3c","#43a047","#66bb6a","#81c784","#a5d6a7","#c8e6c9","#e8f5e9","#eaf7ea","#f0fff4"
]; // verdes
const paletaVariable = [
  "#b71c1c","#c62828","#d32f2f","#e53935","#ef5350","#f66b6b","#ff8a80","#ffab91","#ffcccb","#ffebe9","#ffecec","#fff1f1"
]; // rojos
const coloresBasicos = [paletaColchon[2], paletaFija[3], paletaVariable[4], "#76b7b2", "#edc949"];

// Registrar el plugin de datalabels
if (typeof Chart !== "undefined" && typeof ChartDataLabels !== "undefined") {
  Chart.register(ChartDataLabels);
}

// --- NUEVAS FUNCIONES PARA CONECTAR CON LA NUBE ---
const API_URL = "https://cartera-pr-pia.onrender.com"; // Esto cambiará cuando subas a la nube

// 1. REGISTRARSE
async function registrarUsuario(username, password) {
  try {
    const response = await fetch(`${API_URL}/registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (response.ok) {
      alert("¡Usuario creado! Ahora inicia sesión.");
      return true;
    } else {
      alert("Error: " + (data.detail || JSON.stringify(data)));
      return false;
    }
  } catch (error) {
    console.error("Error conectando:", error);
    alert("No se pudo conectar con el servidor.");
    return false;
  }
}

// 2. INICIAR SESIÓN Y CARGAR DATOS
async function iniciarSesion(username, password) {
  try {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
        
    if (response.ok) {
      alert("¡Bienvenido, " + username + "!");
      // Guardamos temporalmente quién eres en el navegador para no pedirte contraseña a cada rato
      sessionStorage.setItem("usuario_actual", username);
      sessionStorage.setItem("pass_actual", password);
      // Guardar objeto de usuario en localStorage incluyendo flag premium
      try {
        const userObj = { name: username, avatar: 'imagenes/foto_de_perfil.png', premium: !!data.premium };
        localStorage.setItem('sf_user', JSON.stringify(userObj));
      } catch (e) { }
            
      // Si hay datos en la nube, actualizamos tu web
      if (data.datos) {
        console.log("Datos descargados:", data.datos);
        // --- AQUÍ ES DONDE ACTUALIZAS TU WEB ---
        // Ejemplo: misDatos = data.datos;
        // guardarEnLocalStorage(data.datos); // Opcional: guardar copia local
        // actualizarPantalla();
      }
      return true;
    } else {
      alert("Usuario o contraseña incorrectos");
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

// 3. GUARDAR DATOS EN LA NUBE
async function guardarEnNube(datosAGuardar) {
  const usuario = sessionStorage.getItem("usuario_actual");
  const pass = sessionStorage.getItem("pass_actual");
    
  if (!usuario) {
    console.log("No estás logueado, solo guardo en local.");
    return; 
  }

  try {
    await fetch(`${API_URL}/guardar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: usuario, 
        password: pass,
        datos: datosAGuardar 
      })
    });
    console.log("☁️ Datos sincronizados con la nube");
  } catch (e) { console.error('guardarEnNube error', e); }
}

// Crear gráfico de tipo pie
function crearPieChart(ctx, etiquetas, datos, titulo, backgroundColors) {
  return new Chart(ctx, {
    type: "pie",
    data: {
      labels: etiquetas,
      datasets: [{
        data: datos,
        backgroundColor: backgroundColors || coloresBasicos
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom"
        },
        title: {
          display: true,
          text: titulo,
          align: "center"
        },
        datalabels: {
          color: "#000",
          font: {
            weight: "bold",
            size: 11
          },
          formatter: (value, ctx) => {
            const dataArr = ctx.chart.data.datasets[0].data;
            const total = dataArr.reduce((a, b) => a + b, 0);
            if (!total) return "";
            const porcentaje = (value / total) * 100;
            return porcentaje.toFixed(1) + "%";
          }
        }
      },
      layout: {
        padding: 10
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Asegurar que el total se calcule inmediatamente al cargar
  try { actualizarTotalGlobal(); } catch (err) { /* si la función no existe aún, seguirá más abajo */ }

  // Detectar si existe carrusel móvil
  const carouselExists = !!(document.getElementById('carouselColchon') && document.getElementById('carouselFija') && document.getElementById('carouselVariable'));

  // Inicialización robusta de canvases y gráficos con reintentos
  let chartGlobal = null;
  let chartVariable = null;
  let chartFija = null;
  let chartColchon = null;
  let carouselChartColchon = null;
  let carouselChartFija = null;
  let carouselChartVariable = null;

  function initChartsOnce() {
    const gEl = document.getElementById('graficoGlobal');
    const vEl = document.getElementById('graficoVariable');
    const fEl = document.getElementById('graficoFija');
    const cEl = document.getElementById('graficoColchon');
    const carouselColchonEl = document.getElementById('carouselColchon');
    const carouselFijaEl = document.getElementById('carouselFija');
    const carouselVariableEl = document.getElementById('carouselVariable');

    // Necesitamos que existan los elementos canvas y que Chart esté disponible
    if (!gEl || !vEl || !fEl || !cEl || typeof Chart === 'undefined') return false;

    try {
      const ctxGlobal = gEl.getContext && gEl.getContext('2d');
      const ctxVariable = vEl.getContext && vEl.getContext('2d');
      const ctxFija = fEl.getContext && fEl.getContext('2d');
      const ctxColchon = cEl.getContext && cEl.getContext('2d');

      chartGlobal   = crearPieChart(ctxGlobal,   [], [], 'Patrimonio global');
      chartVariable = crearPieChart(ctxVariable, [], [], 'Detalle renta variable', paletaVariable);
      chartFija     = crearPieChart(ctxFija,     [], [], 'Detalle renta fija', paletaFija);
      chartColchon  = crearPieChart(ctxColchon,  [], [], 'Detalle colchón de emergencia', paletaColchon);

      if (carouselColchonEl && carouselFijaEl && carouselVariableEl) {
        carouselChartColchon = crearPieChart(carouselColchonEl.getContext('2d'), [], [], 'Colchón de emergencia', paletaColchon);
        carouselChartFija = crearPieChart(carouselFijaEl.getContext('2d'), [], [], 'Detalle renta fija', paletaFija);
        carouselChartVariable = crearPieChart(carouselVariableEl.getContext('2d'), [], [], 'Detalle renta variable', paletaVariable);
      }

      return true;
    } catch (err) {
      console && console.warn && console.warn('Error inicializando charts:', err);
      return false;
    }
  }
  
  // ---------------- Persistencia de patrimonio por usuario ----------------
  function getLoggedUserName() {
    try {
      const su = localStorage.getItem('sf_user');
      if (!su) return null;
      const obj = JSON.parse(su);
      return obj && obj.name ? obj.name : null;
    } catch (e) { return null; }
  }

  // Pedir login al intentar editar valores (devuelve true si abrió modal / redirigió)
  function promptLoginToEdit() {
    try {
      const msg = 'Necesitas iniciar sesión para editar los importes. ¿Quieres iniciar sesión ahora?';
      const ok = window.confirm(msg);
      if (!ok) return false;
      try { if (window.SF && typeof window.SF.showAuthModal === 'function') { window.SF.showAuthModal(); return true; } } catch(e){}
      try { location.href = 'gestor.html'; } catch(e){}
      return true;
    } catch (e) { return false; }
  }

  function buildPatrimonioObject() {
    const obj = { globals: {}, tablas: {} };
    document.querySelectorAll('.importe-global').forEach(i => {
      const cat = i.dataset.categoria || (i.name || i.id || 'unknown');
      obj.globals[cat] = parseFloat(i.value) || 0;
    });
    // tablas detalle
    ['tablaColchon','tablaFija','tablaVariable'].forEach(id => {
      const tab = document.getElementById(id);
      if (!tab) return;
      const rows = [];
      tab.querySelectorAll('tbody tr').forEach(tr => {
        const nameInp = tr.querySelector('td:nth-child(1) input');
        const valInp = tr.querySelector('td:nth-child(2) input');
        const name = nameInp ? nameInp.value.trim() : '';
        const val = valInp ? (parseFloat(valInp.value) || 0) : 0;
        rows.push({ name: name, value: val });
      });
      obj.tablas[id] = rows;
    });
    return obj;
  }

  function applyPatrimonioObject(obj) {
    if (!obj) return;
    // globals
    document.querySelectorAll('.importe-global').forEach(i => {
      const cat = i.dataset.categoria || (i.name || i.id || 'unknown');
      if (obj.globals && typeof obj.globals[cat] !== 'undefined') {
        i.value = obj.globals[cat];
      }
    });
    // tablas
    ['tablaColchon','tablaFija','tablaVariable'].forEach(id => {
      const tab = document.getElementById(id);
      if (!tab) return;
      const tbody = tab.querySelector('tbody');
      // clear
      tbody.innerHTML = '';
      const rows = (obj.tablas && obj.tablas[id]) ? obj.tablas[id] : [];
      rows.forEach(r => {
        const tr = crearFilaNueva(id === 'tablaVariable' ? 'variable' : (id === 'tablaFija' ? 'fija' : 'colchon'));
        const nameInp = tr.querySelector('td:nth-child(1) input');
        const valInp = tr.querySelector('td:nth-child(2) input');
        if (nameInp) nameInp.value = r.name || '';
        if (valInp) valInp.value = r.value || 0;
        tbody.appendChild(tr);
      });
    });
    // actualizar visuales
    actualizarGraficoGlobal();
    actualizarGraficoDetalle('#tablaColchon', '.importe-colchon', chartColchon, 'Detalle colchón de emergencia');
    actualizarGraficoDetalle('#tablaFija', '.importe-fija', chartFija, 'Detalle renta fija');
    actualizarGraficoDetalle('#tablaVariable', '.importe-variable', chartVariable, 'Detalle renta variable');
    actualizarTotalGlobal();
  }

  function savePatrimonioForCurrentUser() {
    const user = getLoggedUserName();
    const obj = buildPatrimonioObject();
    try {
      if (user) {
        const key = 'patrimonio_' + user;
        localStorage.setItem(key, JSON.stringify(obj));
        // intentar guardar en la nube (no bloquear si falla)
        try { guardarEnNube(obj); } catch(e) { console && console.warn && console.warn('guardarEnNube error', e); }
      } else {
        // si no hay usuario, guardar local temporalmente
        try { localStorage.setItem('patrimonio_guest', JSON.stringify(obj)); } catch(e){}
      }
    } catch (e) { console && console.warn && console.warn('savePatrimonio error', e); }
  }

  async function loadPatrimonioForCurrentUser() {
    const user = getLoggedUserName();
    if (!user) return;
    try {
      // Si hay credenciales en sessionStorage, intentar cargar desde servidor
      const su = sessionStorage.getItem('usuario_actual');
      const sp = sessionStorage.getItem('pass_actual');
      if (su && sp) {
        try {
          const resp = await fetch(`${API_URL}/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: su, password: sp })
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data && data.datos) {
              applyPatrimonioObject(data.datos);
              // almacenar copia local también
              try { localStorage.setItem('patrimonio_' + user, JSON.stringify(data.datos)); } catch(e){}
              return;
            }
          }
        } catch (e) { /* ignore server load errors and fallback to local */ }
      }

      // Fallback: cargar desde localStorage
      const key = 'patrimonio_' + user;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const obj = JSON.parse(raw);
      applyPatrimonioObject(obj);
    } catch (e) { console && console.warn && console.warn('loadPatrimonio error', e); }
  }

  // Recordatorio para usuarios no logueados: crear/show/hide
  function createPatrimonioReminder() {
    try {
      const ref = document.getElementById('totalPatrimonio');
      if (!ref) return;
      if (document.getElementById('patrimonio-recordatorio')) return;
      const el = document.createElement('div');
      el.id = 'patrimonio-recordatorio';
      el.style.background = '#fff3cd';
      el.style.border = '1px solid #ffeeba';
      el.style.color = '#856404';
      el.style.padding = '8px';
      el.style.marginTop = '8px';
      el.style.borderRadius = '4px';
      el.style.display = 'none';
      el.style.fontSize = '0.95rem';
      el.textContent = 'Recuerda: si no inicias sesión, tus cambios no se guardarán.';
      ref.parentNode.insertBefore(el, ref.nextSibling);
    } catch (e) { /* no bloquear si falla */ }
  }

  function showPatrimonioSaveReminder() {
    try {
      const el = document.getElementById('patrimonio-recordatorio');
      if (!el) return;
      const user = getLoggedUserName();
      if (user) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      if (window._patrimonioReminderTimeout) clearTimeout(window._patrimonioReminderTimeout);
      window._patrimonioReminderTimeout = setTimeout(() => { try { el.style.display = 'none'; } catch(e){} }, 6000);
    } catch (e) { /* ignore */ }
  }

  // Mostrar mensaje nativo del navegador (confirm) una sola vez por sesión
  function showPatrimonioBlockingModal() {
    try {
      if (sessionStorage && sessionStorage.getItem && sessionStorage.getItem('patrimonio_blocking_shown')) return;
      if (getLoggedUserName()) return; // no mostrar si hay usuario
      const msg = 'Recuerda: si no inicias sesión, tus cambios no se guardarán.\n\n¿Quieres iniciar sesión ahora?';
      const ok = window.confirm(msg);
      try { sessionStorage.setItem('patrimonio_blocking_shown', '1'); } catch (e) {}
      if (ok) {
        try {
          if (window.SF && typeof window.SF.showAuthModal === 'function') {
            window.SF.showAuthModal();
            return;
          }
        } catch (e) {}
        // fallback a la página del foro
        try { location.href = 'foro.html'; } catch (e) {}
      }
    } catch (e) { console && console.warn && console.warn('showPatrimonioBlockingModal error', e); }
  }


  // Evitar edición de importes sin iniciar sesión: interceptar focus en inputs relevantes
  document.addEventListener('focusin', (e) => {
    try {
      const t = e.target;
      if (!t) return;
      if (t.classList && (t.classList.contains('importe-global') || t.classList.contains('importe-variable') || t.classList.contains('importe-fija') || t.classList.contains('importe-colchon'))) {
        const user = getLoggedUserName();
        if (!user) {
          // preguntar y evitar editar (se vuelve a preguntar en próximos intentos)
          promptLoginToEdit();
          try { t.blur(); } catch (err) {}
        }
      }
    } catch (err) { }
  });

  // Interceptar clicks en botones de añadir/borrar para requerir login
  document.addEventListener('click', (e) => {
    try {
      const t = e.target;
      if (!t) return;
      const isAdd = (t.id && (t.id.indexOf('addFila') === 0));
      const isDel = t.classList && t.classList.contains('btn-borrar');
      if (isAdd || isDel) {
        const user = getLoggedUserName();
        if (!user) {
          const ok = promptLoginToEdit();
          if (!ok) { e.preventDefault(); e.stopPropagation(); return; }
          // si acepta, abrir modal y no ejecutar la acción actual
          e.preventDefault(); e.stopPropagation(); return;
        }
        // delay to allow DOM changes (only when logged)
        setTimeout(() => { savePatrimonioForCurrentUser(); }, 300);
      }
    } catch (err) {}
  });

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;
    const isAdd = (t.id && (t.id.indexOf('addFila') === 0));
    const isDel = t.classList && t.classList.contains('btn-borrar');
    if (isAdd || isDel) {
      // mostrar modal bloqueante si no está logueado
      try { showPatrimonioBlockingModal(); } catch (e) {}
      // delay to allow DOM changes
      setTimeout(() => { savePatrimonioForCurrentUser(); }, 300);
    }
  });

  // cargar patrimonio del usuario al iniciar si existe
  try { loadPatrimonioForCurrentUser(); } catch(e) {}

  // crear elemento recordatorio en la UI
  try { createPatrimonioReminder(); } catch(e) {}

  // si se detecta login/logout desde el header, cargar/guardar según corresponda
  window.addEventListener('sf:auth-changed', (ev) => {
    try {
      // al cambiar de usuario, intentar cargar su patrimonio
      loadPatrimonioForCurrentUser();
    } catch(e){}
  });

  // Intentar inicializar ahora; si falla, reintentar varias veces
  let chartsOk = initChartsOnce();
  if (!chartsOk) {
    let attempts = 0;
    const maxAttempts = 12;
    const tid = setInterval(() => {
      attempts++;
      chartsOk = initChartsOnce();
      if (chartsOk || attempts >= maxAttempts) {
        clearInterval(tid);
        // Forzar actualización una vez inicializados (si lo están)
        try { actualizarGraficoGlobal(); } catch (e) {}
        try { actualizarTotalGlobal(); } catch (e) {}
        // Si tras los intentos no hay gráficos, forzar datos mínimos visibles
        setTimeout(() => {
          if (!chartsOk) {
            // Forzar que los canvases tengan algo visible
            const gEl = document.getElementById('graficoGlobal');
            if (gEl && typeof Chart !== 'undefined') {
              crearPieChart(gEl.getContext('2d'), ['Colchón','Fija','Variable'], [1,1,1], 'Patrimonio global');
            }
            const cEl = document.getElementById('graficoColchon');
            if (cEl && typeof Chart !== 'undefined') {
              crearPieChart(cEl.getContext('2d'), ['Ejemplo'], [1], 'Detalle colchón de emergencia', paletaColchon);
            }
            const fEl = document.getElementById('graficoFija');
            if (fEl && typeof Chart !== 'undefined') {
              crearPieChart(fEl.getContext('2d'), ['Ejemplo'], [1], 'Detalle renta fija', paletaFija);
            }
            const vEl = document.getElementById('graficoVariable');
            if (vEl && typeof Chart !== 'undefined') {
              crearPieChart(vEl.getContext('2d'), ['Ejemplo'], [1], 'Detalle renta variable', paletaVariable);
            }
          }
        }, 200);
      }
    }, 400);
  } else {
    // Si se inicializaron de inmediato, actualizar datos
    try { actualizarGraficoGlobal(); } catch (e) {}
    try { actualizarTotalGlobal(); } catch (e) {}
  }

  // Global
  function actualizarGraficoGlobal() {
    const inputs = document.querySelectorAll(".importe-global");
    const etiquetas = [];
    const datos = [];

    inputs.forEach(input => {
      const valor = parseFloat(input.value) || 0;
      if (valor > 0) {
        const categoria = input.dataset.categoria;
        let nombre = "";
        if (categoria === "colchon")  nombre = "Colchón de emergencia";
        if (categoria === "fija")     nombre = "Renta fija";
        if (categoria === "variable") nombre = "Renta variable";
        etiquetas.push(nombre);
        datos.push(valor);
      }
    });

    // Si no hay datos detectados (por ejemplo inputs vacíos), usar
    // los valores por defecto del atributo `value` como fallback.
    if (etiquetas.length === 0) {
      inputs.forEach(input => {
        const attrVal = parseFloat(input.getAttribute('value')) || 0;
        if (attrVal > 0) {
          const categoria = input.dataset.categoria;
          let nombre = '';
          if (categoria === 'colchon')  nombre = 'Colchón de emergencia';
          if (categoria === 'fija')     nombre = 'Renta fija';
          if (categoria === 'variable') nombre = 'Renta variable';
          etiquetas.push(nombre);
          datos.push(attrVal);
        }
      });
      // Si aun así no hay datos (por ejemplo no hay value en HTML), mostrar
      // tres porciones mínimas para que el gráfico siempre sea visible.
      if (etiquetas.length === 0) {
        etiquetas.push('Colchón de emergencia', 'Renta fija', 'Renta variable');
        datos.push(1,1,1);
      }
    }

    if (chartGlobal) {
      chartGlobal.data.labels = etiquetas;
      chartGlobal.data.datasets[0].data = datos;
      // Asignar color por categoría para el gráfico global
      const colorMap = {
        'Colchón de emergencia': paletaColchon[0],
        'Renta fija': paletaFija[0],
        'Renta variable': paletaVariable[0]
      };
      chartGlobal.data.datasets[0].backgroundColor = etiquetas.map(l => colorMap[l] || paletaColchon[0]);
      if (typeof chartGlobal.update === 'function') chartGlobal.update();
    } else {
      // si no está inicializado, intentar crear los charts
      try { initChartsOnce(); } catch (e) {}
    }
    // actualizar total visible
    actualizarTotalGlobal();
  }

  // Mostrar total sumado de los inputs globales
  function actualizarTotalGlobal(){
    const inputs = document.querySelectorAll('.importe-global');
    let total = 0;
    inputs.forEach(i => total += parseFloat(i.value) || 0);
    // Si la suma dinámica es 0 (inputs vacíos), usar los valores del
    // atributo `value` como fallback para mostrar un total inicial.
    if (total === 0) {
      let fallback = 0;
      inputs.forEach(i => fallback += parseFloat(i.getAttribute('value')) || 0);
      if (fallback > 0) total = fallback;
    }
    const el = document.getElementById('totalPatrimonio');
    if (el) el.innerHTML = `Total patrimonio: <strong>${total.toLocaleString('es-ES', {maximumFractionDigits:0})} €</strong>`;
  }

  // ---------- Validación de límites por categoría (disponible antes de uso) ----------
  function obtenerLimiteGlobal(categoria){
    const el = Array.from(document.querySelectorAll('.importe-global')).find(i=>i.dataset.categoria===categoria);
    return el ? (parseFloat(el.value) || 0) : 0;
  }

  function validarLimitesPorCategoria(selectorTabla, selectorInputImporte){
    let categoria = '';
    if (selectorTabla.indexOf('Colchon')>-1 || selectorTabla.toLowerCase().indexOf('colchon')>-1) categoria='colchon';
    if (selectorTabla.toLowerCase().indexOf('fija')>-1) categoria='fija';
    if (selectorTabla.toLowerCase().indexOf('variable')>-1) categoria='variable';

    const tabla = document.querySelector(selectorTabla);
    if (!tabla) return;
    const section = tabla.closest('.bloque') || tabla.parentElement;

    let aviso = section.querySelector('.detail-warning');
    if (!aviso) {
      aviso = document.createElement('div');
      aviso.className = 'detail-warning';
      aviso.style.display = 'none';
      tabla.parentElement.insertBefore(aviso, tabla.nextSibling);
    }

    const filas = tabla.querySelectorAll('tbody tr');
    let suma = 0;
    filas.forEach(tr => { const inp = tr.querySelector(selectorInputImporte); if (inp) suma += parseFloat(inp.value) || 0; });

    const limite = obtenerLimiteGlobal(categoria);
    if (limite <= 0) {
      if (suma > 0) {
        aviso.style.display = 'block';
        aviso.innerHTML = `Límite global para esta categoría no definido (suma detalle: <strong>${suma} €</strong>). Define el importe en la tabla principal.`;
        aviso.classList.add('warning');
      } else {
        aviso.style.display = 'none';
        aviso.classList.remove('warning');
      }
      tabla.querySelectorAll('.input-exceed').forEach(n => n.classList.remove('input-exceed'));
      return;
    }

    if (suma !== limite) {
      aviso.style.display = 'block';
      aviso.innerHTML = `No coincide: límite global <strong>${limite.toLocaleString('es-ES')} €</strong>, suma detalle <strong>${suma.toLocaleString('es-ES')} €</strong>. Ajusta las filas para que sumen exactamente.`;
      aviso.classList.add('warning');
      tabla.querySelectorAll(selectorInputImporte).forEach(inp => inp.classList.add('input-exceed'));
    } else {
      aviso.style.display = 'none';
      aviso.classList.remove('warning');
      tabla.querySelectorAll('.input-exceed').forEach(n => n.classList.remove('input-exceed'));
    }
  }

  // Detalle
  function actualizarGraficoDetalle(selectorTabla, selectorInputImporte, chart, tituloBase) {
    const filas = document.querySelectorAll(selectorTabla + " tbody tr");
    const etiquetas = [];
    const datos = [];

    filas.forEach(fila => {
      const nombreInput = fila.querySelector("td:nth-child(1) input");
      const importeInput = fila.querySelector(selectorInputImporte);
      const nombre = (nombreInput && nombreInput.value.trim()) || "Sin nombre";
      const valor = importeInput ? (parseFloat(importeInput.value) || 0) : 0;
      if (valor > 0) {
        etiquetas.push(nombre);
        datos.push(valor);
      }
    });

    if (chart) {
      chart.data.labels = etiquetas;
      chart.data.datasets[0].data = datos;
      if (chart.options && chart.options.plugins && chart.options.plugins.title) chart.options.plugins.title.text = tituloBase;
      // Usar paleta según el chart (colchón/ fija/ variable)
      if (chart === chartColchon || chart === carouselChartColchon) {
        chart.data.datasets[0].backgroundColor = paletaColchon.slice(0, datos.length);
      } else if (chart === chartFija || chart === carouselChartFija) {
        chart.data.datasets[0].backgroundColor = paletaFija.slice(0, datos.length);
      } else if (chart === chartVariable || chart === carouselChartVariable) {
        chart.data.datasets[0].backgroundColor = paletaVariable.slice(0, datos.length);
      }
      if (typeof chart.update === 'function') chart.update();
    }

    // Validación de límites respecto a los importes globales
    validarLimitesPorCategoria(selectorTabla, selectorInputImporte);

    // Si existe el carrusel, actualizar también la versión móvil correspondiente
    if (carouselExists) {
      if (selectorTabla === '#tablaVariable' && carouselChartVariable) {
        carouselChartVariable.data.labels = etiquetas;
        carouselChartVariable.data.datasets[0].data = datos;
        if (carouselChartVariable.options && carouselChartVariable.options.plugins && carouselChartVariable.options.plugins.title) carouselChartVariable.options.plugins.title.text = tituloBase;
        if (typeof carouselChartVariable.update === 'function') carouselChartVariable.update();
      }
      if (selectorTabla === '#tablaFija' && carouselChartFija) {
        carouselChartFija.data.labels = etiquetas;
        carouselChartFija.data.datasets[0].data = datos;
        if (carouselChartFija.options && carouselChartFija.options.plugins && carouselChartFija.options.plugins.title) carouselChartFija.options.plugins.title.text = tituloBase;
        if (typeof carouselChartFija.update === 'function') carouselChartFija.update();
      }
      if (selectorTabla === '#tablaColchon' && carouselChartColchon) {
        carouselChartColchon.data.labels = etiquetas;
        carouselChartColchon.data.datasets[0].data = datos;
        if (carouselChartColchon.options && carouselChartColchon.options.plugins && carouselChartColchon.options.plugins.title) carouselChartColchon.options.plugins.title.text = tituloBase;
        if (typeof carouselChartColchon.update === 'function') carouselChartColchon.update();
      }
    }
  }

  // Inputs globales
  document.querySelectorAll(".importe-global").forEach(input => {
    input.addEventListener("input", () => {
      actualizarGraficoGlobal();
      // revalidar los detalles cuando cambie el límite global
      validarLimitesPorCategoria('#tablaColchon', '.importe-colchon');
      validarLimitesPorCategoria('#tablaFija', '.importe-fija');
      validarLimitesPorCategoria('#tablaVariable', '.importe-variable');
    });
  });

  // Asignar eventos a tablas de detalle
  function asignarEventosDetalle(selectorTabla, selectorClaseImporte, chart, tituloBase) {
    const tabla = document.querySelector(selectorTabla);
    if (!tabla) return;
    tabla.addEventListener("input", (e) => {
      if (e.target && e.target.classList && e.target.classList.contains(selectorClaseImporte.replace(".", ""))) {
        actualizarGraficoDetalle(selectorTabla, selectorClaseImporte, chart, tituloBase);
      }
    });
    actualizarGraficoDetalle(selectorTabla, selectorClaseImporte, chart, tituloBase);
  }

  asignarEventosDetalle("#tablaVariable", ".importe-variable", chartVariable, "Detalle renta variable");
  asignarEventosDetalle("#tablaFija",     ".importe-fija",     chartFija,     "Detalle renta fija");
  asignarEventosDetalle("#tablaColchon",  ".importe-colchon",  chartColchon,  "Detalle colchón de emergencia");

  actualizarGraficoGlobal();
  // Validar inicialmente que las sumas detalle coincidan con los importes globales
  try {
    validarLimitesPorCategoria('#tablaColchon', '.importe-colchon');
    validarLimitesPorCategoria('#tablaFija', '.importe-fija');
    validarLimitesPorCategoria('#tablaVariable', '.importe-variable');
  } catch (err) { /* ignore */ }

  // Filas dinámicas
  function puedeAñadirFila(tbody) {
    let filasVacias = 0;
    tbody.querySelectorAll("tr").forEach(tr => {
      const inputs = tr.querySelectorAll("input[type='text'], input[type='number']");
      let vacia = true;
      inputs.forEach(inp => {
        if (inp.type === "text" && inp.value.trim() !== "") vacia = false;
        if (inp.type === "number" && parseFloat(inp.value) > 0) vacia = false;
      });
      if (vacia) filasVacias++;
    });
    return filasVacias < 1;
  }

  function crearFilaNueva(tipo) {
    const tr = document.createElement("tr");

    const tdNombre = document.createElement("td");
    const inputNombre = document.createElement("input");
    inputNombre.type = "text";
    inputNombre.placeholder = "Nombre";
    tdNombre.appendChild(inputNombre);

    const tdImporte = document.createElement("td");
    const inputImporte = document.createElement("input");
    inputImporte.type = "number";
    inputImporte.min = "0";
    if (tipo === "variable") inputImporte.classList.add("importe-variable");
    if (tipo === "fija")     inputImporte.classList.add("importe-fija");
    if (tipo === "colchon")  inputImporte.classList.add("importe-colchon");
    tdImporte.appendChild(inputImporte);

    const tdAcciones = document.createElement("td");
    const btnBorrar = document.createElement("button");
    btnBorrar.type = "button";
    btnBorrar.textContent = "Borrar";
    btnBorrar.classList.add("btn", "btn-borrar", `btn-${tipo}`);
    tdAcciones.appendChild(btnBorrar);

    tr.appendChild(tdNombre);
    tr.appendChild(tdImporte);
    tr.appendChild(tdAcciones);

    return tr;
  }

  // Toggle para mostrar/ocultar ejemplos (soporta múltiples botones)
  (function () {
    const botones = Array.from(document.querySelectorAll('.toggle-ejemplo'));
    if (!botones.length) return;
    console && console.log && console.log('DEBUG: toggle-ejemplo buttons found', botones.length);
    botones.forEach(btn => {
      const targetId = btn.getAttribute('data-target');
      if (!targetId) return;
      const cont = document.getElementById(targetId);
      if (!cont) return;
      // establecer texto inicial según estado
      const hidden = getComputedStyle(cont).display === 'none';
      btn.textContent = hidden ? (btn.getAttribute('data-show-label') || 'MOSTRAR EJEMPLO') : (btn.getAttribute('data-hide-label') || 'NO MOSTRAR EJEMPLO');
      btn.setAttribute('aria-expanded', String(!hidden));
      btn.addEventListener('click', function () {
        const isHidden = getComputedStyle(cont).display === 'none';
        if (isHidden) {
          cont.style.display = 'block';
          btn.textContent = btn.getAttribute('data-hide-label') || 'NO MOSTRAR EJEMPLO';
          btn.setAttribute('aria-expanded', 'true');
        } else {
          cont.style.display = 'none';
          btn.textContent = btn.getAttribute('data-show-label') || 'MOSTRAR EJEMPLO';
          btn.setAttribute('aria-expanded', 'false');
        }
      });
    });
  })();

  // Acordeón: show only el contenido del item clicado (cierra los demás)
  (function () {
    const headers = Array.from(document.querySelectorAll('.accordion-header'));
    if (!headers.length) return;
    headers.forEach(h => {
      h.addEventListener('click', function () {
        const targetId = h.getAttribute('data-target');
        if (!targetId) return;
        const cont = document.getElementById(targetId);
        if (!cont) return;
        const isOpen = cont.classList.contains('show');
        // Cerrar todos
        document.querySelectorAll('.accordion-content.show').forEach(c => {
          c.classList.remove('show');
          const hdr = document.querySelector('.accordion-header[data-target="' + c.id + '"]');
          if (hdr) hdr.setAttribute('aria-expanded', 'false');
        });
        // Abrir el seleccionado si estaba cerrado
        if (!isOpen) {
          cont.classList.add('show');
          h.setAttribute('aria-expanded', 'true');
          // desplazar ligeramente para que el header sea visible en móvil
          try { h.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
        } else {
          h.setAttribute('aria-expanded', 'false');
        }
      });
    });
  })();

  // Si la URL contiene un hash que apunta a un id de acordeón o contenido,
  // abrir el acordeón correspondiente automáticamente.
  (function () {
    try {
      const hash = decodeURIComponent(location.hash || '');
      if (!hash) return;
      const id = hash.replace('#', '');
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;

      // Cerrar todos primero
      document.querySelectorAll('.accordion-content.show').forEach(c => {
        c.classList.remove('show');
        const hdr = document.querySelector('.accordion-header[data-target="' + c.id + '"]');
        if (hdr) hdr.setAttribute('aria-expanded', 'false');
      });

      // Si el id apunta directamente al contenido del acordeón
      if (target.classList && target.classList.contains('accordion-content')) {
        target.classList.add('show');
        const hdr = document.querySelector('.accordion-header[data-target="' + target.id + '"]');
        if (hdr) hdr.setAttribute('aria-expanded', 'true');
        try { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
        return;
      }

      // Si el id apunta a un elemento interno, abrir el acordeón padre
      const parent = target.closest && target.closest('.accordion-content');
      if (parent) {
        parent.classList.add('show');
        const hdr = document.querySelector('.accordion-header[data-target="' + parent.id + '"]');
        if (hdr) hdr.setAttribute('aria-expanded', 'true');
        try { parent.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
      }
    } catch (err) {
      console && console.warn && console.warn('hash open accordion error', err);
    }
  })();

  function configurarBloqueDetalle(idBtnAdd, idTabla, tipo, chart, tituloBase, selectorClaseImporte) {
    const btnAdd = document.getElementById(idBtnAdd);
    const tabla = document.getElementById(idTabla);
    if (!tabla) return;
    const tbody = tabla.querySelector("tbody");

    // colorear botón añadir según tipo si existe
    if (btnAdd) {
      btnAdd.classList.add(`btn-${tipo}`);
      btnAdd.addEventListener("click", () => {
        const user = getLoggedUserName();
        if (!user) {
          const ok = promptLoginToEdit();
          if (!ok) return;
          return;
        }
        if (!puedeAñadirFila(tbody)) {
          alert("Solo puede haber una fila vacía como máximo.");
          return;
        }
        const nuevaFila = crearFilaNueva(tipo);
        tbody.appendChild(nuevaFila);
      });
    }
    // asegurarnos que los botones "borrar" existentes reciban la clase de color correcta
    tbody.querySelectorAll('.btn-borrar').forEach(b => b.classList.add(`btn-${tipo}`));

    tbody.addEventListener("click", (e) => {
      if (e.target && e.target.classList && e.target.classList.contains("btn-borrar")) {
        const user = getLoggedUserName();
        if (!user) {
          const ok = promptLoginToEdit();
          if (!ok) return;
          return;
        }
        const fila = e.target.closest("tr");
        if (fila) fila.remove();
        try { actualizarGraficoDetalle("#" + idTabla, selectorClaseImporte, chart, tituloBase); } catch (err) {}
      }
    });
  }

  configurarBloqueDetalle("addFilaVariable", "tablaVariable", "variable", chartVariable, "Detalle renta variable", ".importe-variable");
  configurarBloqueDetalle("addFilaFija",     "tablaFija",     "fija",     chartFija,     "Detalle renta fija",     ".importe-fija");
  configurarBloqueDetalle("addFilaColchon",  "tablaColchon",  "colchon",  chartColchon,  "Detalle colchón de emergencia", ".importe-colchon");

  // Debug: registrar clicks en botones de añadir y borrar para diagnosticar
  try {
    ['addFilaColchon','addFilaFija','addFilaVariable'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => console.log('DEBUG: clicked', id));
    });
    document.addEventListener('click', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('btn-borrar')) {
        console.log('DEBUG: clicked borrar', e.target);
      }
    });
  } catch (err) { /* no bloquear si falla */ }

  // ---------- Synchronization helper (carrusel) ----------
  let sincronizando = false;
  function sincronizarValores(origen, destino) {
    try {
      if (!origen || !destino) return;
      if (sincronizando) return;
      sincronizando = true;
      const origenTbody = origen.querySelector('tbody');
      const destinoTbody = destino.querySelector('tbody');
      if (!origenTbody || !destinoTbody) { sincronizando = false; return; }
      const origenRows = origenTbody.querySelectorAll('tr').length;
      const destinoRows = destinoTbody.querySelectorAll('tr').length;
      if (origenRows !== destinoRows) {
        destinoTbody.innerHTML = origenTbody.innerHTML;
      } else {
        const origenInputs = origenTbody.querySelectorAll('input');
        const destinoInputs = destinoTbody.querySelectorAll('input');
        origenInputs.forEach((input, i) => {
          if (destinoInputs[i]) destinoInputs[i].value = input.value;
        });
      }
    } catch (err) {
      console && console.warn && console.warn('sincronizarValores error', err);
    } finally {
      sincronizando = false;
    }
  }

  // Configurar tablas del carrusel móvil (sincronizar datos con las tablas originales)
  if (carouselExists) {
    // Sincronizar tablas del carrusel con las originales
    const tblCarouselColchon = document.getElementById("tablaColchonCarousel");
    const tblCarouselFija = document.getElementById("tablaFijaCarousel");
    const tblCarouselVariable = document.getElementById("tablaVariableCarousel");

    // Función para copiar filas de una tabla a otra
    function sincronizarTablas() {
      // Copiar solo valores manteniendo nodos para no interrumpir edición
      sincronizarValores(document.getElementById("tablaColchon"), tblCarouselColchon);
      sincronizarValores(document.getElementById("tablaFija"), tblCarouselFija);
      sincronizarValores(document.getElementById("tablaVariable"), tblCarouselVariable);
    }

    // Sincronizar al inicio
    sincronizarTablas();

    // Observar cambios en las tablas originales y sincronizar
    const observerConfig = { childList: true, subtree: true };
    const observer = new MutationObserver(() => {
      // Cuando cambian las tablas originales, copiar solo valores al carrusel
      sincronizarValores(document.getElementById("tablaColchon"), tblCarouselColchon);
      sincronizarValores(document.getElementById("tablaFija"), tblCarouselFija);
      sincronizarValores(document.getElementById("tablaVariable"), tblCarouselVariable);
    });

    document.getElementById("tablaColchon").addEventListener("input", () => {
      sincronizarValores(document.getElementById("tablaColchon"), tblCarouselColchon);
    });
    document.getElementById("tablaFija").addEventListener("input", () => {
      sincronizarValores(document.getElementById("tablaFija"), tblCarouselFija);
    });
    document.getElementById("tablaVariable").addEventListener("input", () => {
      sincronizarValores(document.getElementById("tablaVariable"), tblCarouselVariable);
    });

    // Configurar botones de añadir y borrar fila en carrusel, y sincronizar con la tabla principal
    function configurarBloqueDetalleCarrusel(idBtnAdd, idTabla, tipo, chart, tituloBase, selectorClaseImporte, tablaPrincipalId) {
      const btnAdd = document.getElementById(idBtnAdd);
      const tabla = document.getElementById(idTabla);
      const tablaPrincipal = document.getElementById(tablaPrincipalId);
      if (!tabla || !tablaPrincipal) return;
      const tbody = tabla.querySelector("tbody");
      if (btnAdd) {
        btnAdd.classList.add(`btn-${tipo}`);
        btnAdd.addEventListener("click", () => {
          if (!puedeAñadirFila(tbody)) {
            alert("Solo puede haber una fila vacía como máximo.");
            return;
          }
          const nuevaFila = crearFilaNueva(tipo);
          tbody.appendChild(nuevaFila);
          sincronizarValores(tabla, tablaPrincipal);
          actualizarGraficoDetalle(`#${tablaPrincipalId}`, selectorClaseImporte, chart, tituloBase);
        });
      }
      tbody.addEventListener("click", (e) => {
        if (e.target && e.target.classList && e.target.classList.contains("btn-borrar")) {
          const fila = e.target.closest("tr");
          if (fila) fila.remove();
          setTimeout(() => {
            sincronizarValores(tabla, tablaPrincipal);
            actualizarGraficoDetalle(`#${tablaPrincipalId}`, selectorClaseImporte, chart, tituloBase);
          }, 50);
        }
      });
      // Sincronizar inputs
      tabla.addEventListener("input", (e) => {
        sincronizarValores(tabla, tablaPrincipal);
        actualizarGraficoDetalle(`#${tablaPrincipalId}`, selectorClaseImporte, chart, tituloBase);
      });
    }

    configurarBloqueDetalleCarrusel("addFilaColchonCarousel", "tablaColchonCarousel", "colchon", chartColchon, "Detalle colchón de emergencia", ".importe-colchon", "tablaColchon");
    configurarBloqueDetalleCarrusel("addFilaFijaCarousel",     "tablaFijaCarousel",     "fija",     chartFija,     "Detalle renta fija",     ".importe-fija",     "tablaFija");
    configurarBloqueDetalleCarrusel("addFilaVariableCarousel", "tablaVariableCarousel", "variable", chartVariable, "Detalle renta variable", ".importe-variable", "tablaVariable");
  }

  // Inicializar carrusel (puntos y sincronización de índice) si existe
  if (carouselExists) {
    const slidesContainer = document.getElementById('slidesGraficos');
    const dotsContainer = document.getElementById('carouselDots');
    const slides = Array.from(slidesContainer.querySelectorAll('.slide'));
    const slidesCount = slides.length;

    // Crear puntos
    const dots = [];
    for (let i = 0; i < slidesCount; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Slide ' + (i+1) + ' de ' + slidesCount);
      if (i === 0) btn.classList.add('active');
      btn.addEventListener('click', () => {
        // Usar requestAnimationFrame para asegurar que el scroll ocurra después del render
        const slideEl = slides[i];
        if (slideEl) {
          slideEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      });
      dotsContainer.appendChild(btn);
      dots.push(btn);
    }

    // Actualizar punto activo al hacer scroll en el carrusel
    let scrollTimeout;
    function updateActiveDot() {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const scrollLeft = slidesContainer.scrollLeft;
        const slideWidth = slides[0] ? slides[0].offsetWidth : 1;
        const activeIndex = Math.round(scrollLeft / slideWidth);
        const clampedIndex = Math.max(0, Math.min(activeIndex, slidesCount - 1));
        
        dots.forEach((dot, i) => {
          dot.classList.toggle('active', i === clampedIndex);
        });
      }, 50);
    }

    slidesContainer.addEventListener('scroll', updateActiveDot);
    slidesContainer.addEventListener('touchend', updateActiveDot);
    // Asegurar que los inputs dentro del carrusel reciban foco en móvil
    slidesContainer.addEventListener('touchstart', (e) => {
      const targetInput = e.target && e.target.closest ? e.target.closest('input') : null;
      console && console.debug && console.debug('touchstart target:', e.target, 'foundInput:', !!targetInput);
      if (targetInput) {
        // permitir que el input reciba foco sin que otros handlers interfieran
        try { targetInput.focus(); } catch (err) { /* ignore */ }
        // stopPropagation para evitar que el contenedor trate el gesto inmediatamente
        e.stopPropagation();
      }
    }, { passive: true });

    slidesContainer.addEventListener('pointerdown', (e) => {
      const targetInput = e.target && e.target.closest ? e.target.closest('input') : null;
      console && console.debug && console.debug('pointerdown target:', e.target, 'foundInput:', !!targetInput);
      if (targetInput) {
        try { targetInput.focus(); } catch (err) { /* ignore */ }
        e.stopPropagation();
      }
    });

    // también añadir click para dispositivos que interpretan toques como clicks
    slidesContainer.addEventListener('click', (e) => {
      const targetInput = e.target && e.target.closest ? e.target.closest('input') : null;
      if (targetInput) {
        try { targetInput.focus(); } catch (err) { /* ignore */ }
      }
    });
    // Evitar que el deslizamiento del carrusel quite el foco al escribir:
    // cuando un input dentro del carrusel tiene foco, deshabilitamos el scroll del contenedor
    const mqMobile = window.matchMedia('(max-width: 800px)');
    function disableCarouselScrollWhileTyping() {
      const inputs = slidesContainer.querySelectorAll('input');
      inputs.forEach(inp => {
        inp.addEventListener('focus', () => {
          if (mqMobile.matches) {
            slidesContainer.dataset.prevOverflow = slidesContainer.style.overflow || '';
            slidesContainer.style.overflow = 'hidden';
          }
        });
        inp.addEventListener('blur', () => {
          if (mqMobile.matches) {
            slidesContainer.style.overflow = slidesContainer.dataset.prevOverflow || 'auto';
            delete slidesContainer.dataset.prevOverflow;
          }
        });
        // También en touchstart garantizar foco
        inp.addEventListener('touchstart', (ev) => { ev.stopPropagation(); });
      });
    }
    // Llamar inicialmente y también al cambiar tamaño
    disableCarouselScrollWhileTyping();
    mqMobile.addEventListener && mqMobile.addEventListener('change', disableCarouselScrollWhileTyping);
    
    // Actualizar punto inicial
    updateActiveDot();

    // Hacer que el carrusel sea visible/oculto según el tamaño de pantalla
    function updateCarouselVisibility() {
      const isMobile = window.matchMedia('(max-width: 800px)').matches;
      const carr = document.querySelector('.carrusel-graficos');
      if (carr) {
        carr.setAttribute('aria-hidden', String(!isMobile));
      }
    }

    
    updateCarouselVisibility();
    window.addEventListener('resize', updateCarouselVisibility);
  }
});
    
// Nota: el resto de la sincronización y listeners está manejado dentro del
// bloque principal de `DOMContentLoaded`. Se eliminó el bloque duplicado
// que referenciaba variables fuera de su alcance y provocaba errores en
// tiempo de ejecución (evitando que los gráficos se renderizaran).