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
  // Canvas
  const ctxGlobal   = document.getElementById("graficoGlobal").getContext("2d");
  const ctxVariable = document.getElementById("graficoVariable").getContext("2d");
  const ctxFija     = document.getElementById("graficoFija").getContext("2d");
  const ctxColchon  = document.getElementById("graficoColchon").getContext("2d");

  // Gráficos
  let chartGlobal   = crearPieChart(ctxGlobal,   [], [], "Patrimonio global");
  let chartVariable = crearPieChart(ctxVariable, [], [], "Detalle renta variable");
  let chartFija     = crearPieChart(ctxFija,     [], [], "Detalle renta fija");
  let chartColchon  = crearPieChart(ctxColchon,  [], [], "Detalle colchón de emergencia");

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
});
