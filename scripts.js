// Colores reutilizables para los quesitos
const coloresBasicos = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc949",
  "#af7aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ab"
];

// Registrar el plugin de datalabels
if (typeof Chart !== "undefined" && typeof ChartDataLabels !== "undefined") {
  Chart.register(ChartDataLabels);
}

// Crear gráfico de tipo pie
function crearPieChart(ctx, etiquetas, datos, titulo) {
  return new Chart(ctx, {
    type: "pie",
    data: {
      labels: etiquetas,
      datasets: [{
        data: datos,
        backgroundColor: coloresBasicos
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
  // Canvas escritorio
  const ctxGlobal   = document.getElementById("graficoGlobal").getContext("2d");
  const ctxVariable = document.getElementById("graficoVariable").getContext("2d");
  const ctxFija     = document.getElementById("graficoFija").getContext("2d");
  const ctxColchon  = document.getElementById("graficoColchon").getContext("2d");
  
  // Canvas para carrusel móvil (si existen)
  const carouselColchonEl = document.getElementById("carouselColchon");
  const carouselFijaEl = document.getElementById("carouselFija");
  const carouselVariableEl = document.getElementById("carouselVariable");
  const carouselExists = carouselColchonEl && carouselFijaEl && carouselVariableEl;

  // Gráficos
  let chartGlobal   = crearPieChart(ctxGlobal,   [], [], "Patrimonio global");
  let chartVariable = crearPieChart(ctxVariable, [], [], "Detalle renta variable");
  let chartFija     = crearPieChart(ctxFija,     [], [], "Detalle renta fija");
  let chartColchon  = crearPieChart(ctxColchon,  [], [], "Detalle colchón de emergencia");

  // Charts para carrusel (móvil)
  let carouselChartColchon = null;
  let carouselChartFija = null;
  let carouselChartVariable = null;
  if (carouselExists) {
    carouselChartColchon = crearPieChart(carouselColchonEl.getContext('2d'), [], [], 'Colchón de emergencia');
    carouselChartFija = crearPieChart(carouselFijaEl.getContext('2d'), [], [], 'Detalle renta fija');
    carouselChartVariable = crearPieChart(carouselVariableEl.getContext('2d'), [], [], 'Detalle renta variable');
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

    chartGlobal.data.labels = etiquetas;
    chartGlobal.data.datasets[0].data = datos;
    chartGlobal.update();
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

    chart.data.labels = etiquetas;
    chart.data.datasets[0].data = datos;
    chart.options.plugins.title.text = tituloBase;
    chart.update();

    // Si existe el carrusel, actualizar también la versión móvil correspondiente
    if (carouselExists) {
      if (selectorTabla === '#tablaVariable' && carouselChartVariable) {
        carouselChartVariable.data.labels = etiquetas;
        carouselChartVariable.data.datasets[0].data = datos;
        carouselChartVariable.options.plugins.title.text = tituloBase;
        carouselChartVariable.update();
      }
      if (selectorTabla === '#tablaFija' && carouselChartFija) {
        carouselChartFija.data.labels = etiquetas;
        carouselChartFija.data.datasets[0].data = datos;
        carouselChartFija.options.plugins.title.text = tituloBase;
        carouselChartFija.update();
      }
      if (selectorTabla === '#tablaColchon' && carouselChartColchon) {
        carouselChartColchon.data.labels = etiquetas;
        carouselChartColchon.data.datasets[0].data = datos;
        carouselChartColchon.options.plugins.title.text = tituloBase;
        carouselChartColchon.update();
      }
    }
  }

  // Inputs globales
  document.querySelectorAll(".importe-global").forEach(input => {
    input.addEventListener("input", actualizarGraficoGlobal);
  });

  // Asignar eventos a tablas de detalle
  function asignarEventosDetalle(selectorTabla, selectorClaseImporte, chart, tituloBase) {
    const tabla = document.querySelector(selectorTabla);
    tabla.addEventListener("input", (e) => {
      if (e.target.classList.contains(selectorClaseImporte.replace(".", ""))) {
        actualizarGraficoDetalle(selectorTabla, selectorClaseImporte, chart, tituloBase);
      }
    });
    actualizarGraficoDetalle(selectorTabla, selectorClaseImporte, chart, tituloBase);
  }

  asignarEventosDetalle("#tablaVariable", ".importe-variable", chartVariable, "Detalle renta variable");
  asignarEventosDetalle("#tablaFija",     ".importe-fija",     chartFija,     "Detalle renta fija");
  asignarEventosDetalle("#tablaColchon",  ".importe-colchon",  chartColchon,  "Detalle colchón de emergencia");

  actualizarGraficoGlobal();

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
    btnBorrar.classList.add("btn", "btn-borrar");
    tdAcciones.appendChild(btnBorrar);

    tr.appendChild(tdNombre);
    tr.appendChild(tdImporte);
    tr.appendChild(tdAcciones);

    return tr;
  }

  function configurarBloqueDetalle(idBtnAdd, idTabla, tipo, chart, tituloBase, selectorClaseImporte) {
    const btnAdd = document.getElementById(idBtnAdd);
    const tabla = document.getElementById(idTabla);
    const tbody = tabla.querySelector("tbody");

    btnAdd.addEventListener("click", () => {
      if (!puedeAñadirFila(tbody)) {
        alert("Solo puede haber una fila vacía como máximo.");
        return;
      }
      const nuevaFila = crearFilaNueva(tipo);
      tbody.appendChild(nuevaFila);
    });

    tbody.addEventListener("click", (e) => {
      if (e.target.classList.contains("btn-borrar")) {
        const fila = e.target.closest("tr");
        fila.remove();
        actualizarGraficoDetalle("#" + idTabla, selectorClaseImporte, chart, tituloBase);
      }
    });
  }

  configurarBloqueDetalle("addFilaVariable", "tablaVariable", "variable", chartVariable, "Detalle renta variable", ".importe-variable");
  configurarBloqueDetalle("addFilaFija",     "tablaFija",     "fija",     chartFija,     "Detalle renta fija",     ".importe-fija");
  configurarBloqueDetalle("addFilaColchon",  "tablaColchon",  "colchon",  chartColchon,  "Detalle colchón de emergencia", ".importe-colchon");

  // Configurar tablas del carrusel móvil (sincronizar datos con las tablas originales)
  if (carouselExists) {
    // Sincronizar tablas del carrusel con las originales
    const tblCarouselColchon = document.getElementById("tablaColchonCarousel");
    const tblCarouselFija = document.getElementById("tablaFijaCarousel");
    const tblCarouselVariable = document.getElementById("tablaVariableCarousel");

    // Función para copiar filas de una tabla a otra
    function sincronizarTablas() {
      const tblOrigColchon = document.getElementById("tablaColchon");
      const tblOrigFija = document.getElementById("tablaFija");
      const tblOrigVariable = document.getElementById("tablaVariable");

      // Colchón
      tblCarouselColchon.querySelector("tbody").innerHTML = tblOrigColchon.querySelector("tbody").innerHTML;
      // Fija
      tblCarouselFija.querySelector("tbody").innerHTML = tblOrigFija.querySelector("tbody").innerHTML;
      // Variable
      tblCarouselVariable.querySelector("tbody").innerHTML = tblOrigVariable.querySelector("tbody").innerHTML;
    }

    // Sincronizar al inicio
    sincronizarTablas();

    // Observar cambios en las tablas originales y sincronizar
    const observerConfig = { childList: true, subtree: true };
    const observer = new MutationObserver(() => {
      sincronizarTablas();
    });

    document.getElementById("tablaColchon").addEventListener("input", sincronizarTablas);
    document.getElementById("tablaFija").addEventListener("input", sincronizarTablas);
    document.getElementById("tablaVariable").addEventListener("input", sincronizarTablas);

    // Configurar botones de añadir fila en carrusel
    configurarBloqueDetalle("addFilaColchonCarousel", "tablaColchonCarousel", "colchon", chartColchon, "Detalle colchón de emergencia", ".importe-colchon");
    configurarBloqueDetalle("addFilaFijaCarousel",     "tablaFijaCarousel",     "fija",     chartFija,     "Detalle renta fija",     ".importe-fija");
    configurarBloqueDetalle("addFilaVariableCarousel", "tablaVariableCarousel", "variable", chartVariable, "Detalle renta variable", ".importe-variable");

    // Cuando cambian las tablas del carrusel, actualizar también las originales
    tblCarouselColchon.addEventListener("input", (e) => {
      const tbody = tblCarouselColchon.querySelector("tbody");
      document.getElementById("tablaColchon").querySelector("tbody").innerHTML = tbody.innerHTML;
      sincronizarTablas();
      actualizarGraficoDetalle("#tablaColchon", ".importe-colchon", chartColchon, "Detalle colchón de emergencia");
    });

    tblCarouselFija.addEventListener("input", (e) => {
      const tbody = tblCarouselFija.querySelector("tbody");
      document.getElementById("tablaFija").querySelector("tbody").innerHTML = tbody.innerHTML;
      sincronizarTablas();
      actualizarGraficoDetalle("#tablaFija", ".importe-fija", chartFija, "Detalle renta fija");
    });

    tblCarouselVariable.addEventListener("input", (e) => {
      const tbody = tblCarouselVariable.querySelector("tbody");
      document.getElementById("tablaVariable").querySelector("tbody").innerHTML = tbody.innerHTML;
      sincronizarTablas();
      actualizarGraficoDetalle("#tablaVariable", ".importe-variable", chartVariable, "Detalle renta variable");
    });

    // También sincronizar cuando se borran filas
    tblCarouselColchon.addEventListener("click", (e) => {
      if (e.target.classList.contains("btn-borrar")) {
        setTimeout(() => {
          document.getElementById("tablaColchon").querySelector("tbody").innerHTML = tblCarouselColchon.querySelector("tbody").innerHTML;
          actualizarGraficoDetalle("#tablaColchon", ".importe-colchon", chartColchon, "Detalle colchón de emergencia");
        }, 100);
      }
    });

    tblCarouselFija.addEventListener("click", (e) => {
      if (e.target.classList.contains("btn-borrar")) {
        setTimeout(() => {
          document.getElementById("tablaFija").querySelector("tbody").innerHTML = tblCarouselFija.querySelector("tbody").innerHTML;
          actualizarGraficoDetalle("#tablaFija", ".importe-fija", chartFija, "Detalle renta fija");
        }, 100);
      }
    });

    tblCarouselVariable.addEventListener("click", (e) => {
      if (e.target.classList.contains("btn-borrar")) {
        setTimeout(() => {
          document.getElementById("tablaVariable").querySelector("tbody").innerHTML = tblCarouselVariable.querySelector("tbody").innerHTML;
          actualizarGraficoDetalle("#tablaVariable", ".importe-variable", chartVariable, "Detalle renta variable");
        }, 100);
      }
    });
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
