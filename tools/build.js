/* Generador del sitio: arma una página HTML por calculadora a partir de la lista PAGES.
   Uso: node tools/build.js
   Para sumar una calculadora: agregá su función en lib/calc.js y una entrada en PAGES. */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VERSION = "20261009"; // subilo en cada publicación para que los navegadores tomen los cambios
const SITE_URL = ""; // ej. "https://www.tudominio.com.ar" — al completarlo se generan canonical, sitemap.xml y robots.txt
// Datos del responsable del sitio, para las páginas legales. Lo que quede vacío aparece marcado como TODO en la página.
const OWNER = {
  name: "",  // nombre y apellido o razón social
  cuit: "",  // opcional
  email: "", // correo de contacto
  ads: false // true cuando se active Google AdSense: cambia el texto de cookies y publicidad
};
const LEGAL_DATE = "6 de octubre de 2026"; // última actualización de las páginas legales

globalThis.window = {};
for (const lib of ["manifest.js", "calc.js", "plan.js"]) require(path.join(ROOT, "lib", lib));
const BRAND = globalThis.window.__BRAND__;
const DATA = BRAND.data;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attrs = (o) => (o.wide ? " wide" : "") + '"' + (o.showIf ? ` data-show-if="${o.showIf}"` : "") + (o.hidden ? " hidden" : "");

// ---------- Campos de formulario ----------
function num(name, label, unit, value, o = {}) {
  return `<div class="field${attrs(o)}>
          <label for="f-${name}">${label}${unit ? ` <span class="unit">(${unit})</span>` : ""}</label>
          <input id="f-${name}" name="${name}" type="text" inputmode="decimal" autocomplete="off" value="${value}">${o.hint ? `
          <small>${o.hint}</small>` : ""}
        </div>`;
}

function sel(name, label, options, o = {}) {
  return `<div class="field${attrs(o)}>
          <label for="f-${name}">${label}</label>
          <select id="f-${name}" name="${name}">
            ${options.map(([value, text]) => `<option value="${value}"${value === o.value ? " selected" : ""}>${esc(text)}</option>`).join("\n            ")}
          </select>
        </div>`;
}

function chk(name, label, checked, o = {}) {
  return `<div class="field field-check${attrs(o)}>
          <label><input type="checkbox" name="${name}"${checked ? " checked" : ""}> ${label}</label>
        </div>`;
}

const mixes = (...keys) => keys.map((k) => [k, DATA.mixes[k].label]);
const waste = (value, hint) => num("desperdicio", "Desperdicio", "%", value, { hint });

const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="${d}"/></svg>`;

// ---------- Calculadoras ----------
const PAGES = [
  {
    key: "ladrillos",
    file: "calculadora-ladrillos.html",
    icon: "M3 5h18v14H3z M3 9.7h18 M3 14.3h18 M9 5v4.7 M15 5v4.7 M12 9.7v4.6 M9 14.3V19 M15 14.3V19",
    name: "Ladrillos y mortero",
    card: "Cuántos ladrillos, cemento, cal y arena lleva una pared.",
    title: "Calculadora de ladrillos por m² y mortero | CalcuObra",
    description: "Calculá cuántos ladrillos entran por m² de pared y cuánto cemento, cal y arena lleva el mortero. Ladrillo común, hueco y bloque. Gratis.",
    h1: "Calculadora de ladrillos por m²",
    lead: "Cargá las medidas de la pared y mirá cuántos ladrillos, cemento, cal y arena tenés que comprar.",
    fields: [
      num("largo", "Largo de la pared", "m", "5"),
      num("alto", "Alto de la pared", "m", "2,6"),
      sel("tipo", "Tipo de ladrillo", Object.keys(DATA.bricks).map((k) => [k, DATA.bricks[k].label]).concat([["custom", "Otras medidas…"]]), { wide: true }),
      num("ladLargo", "Largo del ladrillo", "cm", "24", { showIf: "tipo=custom", hidden: true }),
      num("ladAlto", "Alto del ladrillo", "cm", "5", { showIf: "tipo=custom", hidden: true }),
      num("ladEspesor", "Espesor de la pared", "cm", "11,5", { showIf: "tipo=custom", hidden: true, wide: true }),
      num("aberturas", "Aberturas a descontar", "m²", "0", { hint: "Puertas y ventanas" }),
      num("junta", "Junta", "cm", "1,5"),
      sel("mezcla", "Mortero de asiento", mixes("mI", "mE", "mN", "m13"), { wide: true }),
      waste("5")
    ],
    steps: [
      "Medí el largo y el alto de la pared en metros y restá puertas y ventanas.",
      "Elegí el ladrillo que vas a usar y el espesor de la junta.",
      "Copiá el resultado o mandalo por WhatsApp al corralón."
    ],
    article: `
      <h2>Cómo se calcula la cantidad de ladrillos</h2>
      <p>Cada ladrillo ocupa en la pared su cara vista más la junta de mezcla que lo rodea. Por eso la cuenta no se hace solo con la medida del ladrillo, sino sumándole la junta:</p>
      <p><strong>Ladrillos por m² = 1 ÷ [(largo + junta) × (alto + junta)]</strong>, con todas las medidas en metros.</p>
      <p>Un ladrillo común de 24 × 5 cm con junta de 1,5 cm ocupa 0,255 × 0,065 m, así que entran unos 60 por m² en una pared de 15. Si la pared es de 30 (doble), el ladrillo se coloca atravesado y la cantidad sube a unos 120 por m². En un hueco cerámico de 18 × 33 entran alrededor de 15 por m², y en un bloque de hormigón de 19 × 39, unos 12,5.</p>
      <h3>Cuánto mortero lleva</h3>
      <p>El mortero es todo el volumen de la pared que no es ladrillo. La calculadora toma el volumen total (superficie × espesor) y le resta el volumen que ocupan los ladrillos. Después reparte ese volumen en cemento, cal y arena según la mezcla que elijas.</p>
      <p>Los morteros de asiento son los tres tipos del reglamento CIRSOC 501-E, en proporciones de cemento, cal y arena:</p>
      <ul>
        <li><strong>Tipo E (1:¼:3):</strong> resistencia elevada.</li>
        <li><strong>Tipo I (1:½:4):</strong> resistencia intermedia, el más usado en muros portantes.</li>
        <li><strong>Tipo N (1:1:6):</strong> resistencia normal.</li>
        <li><strong>Cementicio (1:3):</strong> sin cal, obligatorio en las juntas que llevan hierro.</li>
      </ul>
      <p>El reglamento no admite morteros que tengan solo cal como ligante, y pide que la arena sea entre 2,25 y 3 veces el volumen de cemento más cal.</p>
      <h3>Ladrillo portante y ladrillo de cerramiento</h3>
      <p>No todos los ladrillos sirven para sostener una losa o un techo. Según el CIRSOC 501-E, un muro portante se hace con ladrillo macizo de 11 cm o más, o con bloque portante (cerámico o de hormigón) de 12 cm o más. El ladrillo hueco común, de tubos horizontales, es de cerramiento: sirve para tabiques y para rellenar una estructura de hormigón, no para cargar peso.</p>
      <h3>Por qué sumar desperdicio</h3>
      <p>Siempre se rompen ladrillos en el traslado y en los cortes de esquinas y aberturas. Un 5 % es lo habitual; si la pared tiene muchos recortes, conviene subirlo a 8 o 10 %.</p>`,
    faqs: [
      ["¿Cuántos ladrillos comunes entran en un m²?", "En una pared de 15 cm entran unos 60 ladrillos comunes por m², y en una pared de 30 cm, unos 120. La cifra exacta cambia según la medida real del ladrillo y el espesor de la junta."],
      ["¿Cuántos ladrillos huecos de 12×18×33 entran por m²?", "Alrededor de 15 por m² con una junta de 1,5 cm. Es la misma cantidad para los de 8 y 18 cm de espesor, porque la cara vista es la misma."],
      ["¿Qué mortero pide el reglamento CIRSOC para una pared portante?", "El CIRSOC 501-E admite tres tipos, en proporciones de cemento, cal y arena: E (1:¼:3), I (1:½:4) y N (1:1:6). No admite morteros solo de cal."],
      ["¿Cuánta mezcla lleva un m² de pared?", "Una pared de 15 de ladrillo común lleva cerca de 0,03 m³ de mortero por m². Una pared de ladrillo hueco de 12 lleva menos de la mitad, porque tiene muchas menos juntas."],
      ["¿Tengo que descontar puertas y ventanas?", "Sí. Sumá la superficie de todas las aberturas en m² y cargala en el campo «Aberturas a descontar». Una puerta estándar ocupa cerca de 1,6 m²."],
      ["¿Las medidas de los ladrillos son siempre iguales?", "No. El ladrillo común es artesanal y varía según la ladrillera. Si el tuyo es distinto, elegí «Otras medidas» y cargá las medidas reales."]
    ]
  },
  {
    key: "hormigon",
    file: "calculadora-hormigon.html",
    icon: "M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5",
    name: "Hormigón",
    card: "Metros cúbicos y bolsas de cemento, arena y piedra.",
    title: "Calculadora de hormigón: m³, cemento y arena | CalcuObra",
    description: "Calculá los m³ de hormigón de una losa, viga o columna y cuántas bolsas de cemento, arena y piedra necesitás. Gratis y sin registrarte.",
    h1: "Calculadora de hormigón",
    lead: "Cargá las medidas y mirá los metros cúbicos y los materiales para prepararlo en obra.",
    fields: [
      sel("forma", "Qué vas a hormigonar", [["losa", "Losa, platea o piso"], ["rect", "Viga, columna o zapata rectangular"], ["circ", "Columna o pilote circular"]], { wide: true }),
      num("largo", "Largo", "m", "4", { showIf: "forma=losa" }),
      num("ancho", "Ancho", "m", "3", { showIf: "forma=losa" }),
      num("espesor", "Espesor", "cm", "12", { showIf: "forma=losa" }),
      num("ladoA", "Lado A", "cm", "20", { showIf: "forma=rect", hidden: true }),
      num("ladoB", "Lado B", "cm", "20", { showIf: "forma=rect", hidden: true }),
      num("altoRect", "Largo o alto", "m", "3", { showIf: "forma=rect", hidden: true }),
      num("diametro", "Diámetro", "cm", "30", { showIf: "forma=circ", hidden: true }),
      num("altoCirc", "Alto", "m", "3", { showIf: "forma=circ", hidden: true }),
      num("cantidad", "Cantidad", "", "1", { showIf: "forma=rect|circ", hidden: true }),
      waste("5"),
      sel("mezcla", "Dosificación", mixes("h133", "h123", "h135"), { wide: true })
    ],
    steps: [
      "Elegí la forma: losa, viga o columna rectangular, o columna circular.",
      "Cargá las medidas y la dosificación que vas a usar.",
      "Obtenés los m³ y las bolsas de cemento, la arena y la piedra."
    ],
    article: `
      <h2>Cómo se calcula el volumen de hormigón</h2>
      <p>El hormigón se compra y se prepara por metro cúbico, así que el primer paso es siempre calcular el volumen de lo que vas a llenar:</p>
      <ul>
        <li><strong>Losa, platea o piso:</strong> largo × ancho × espesor. Una losa de 4 × 3 m y 12 cm de espesor son 4 × 3 × 0,12 = 1,44 m³.</li>
        <li><strong>Viga o columna rectangular:</strong> lado A × lado B × largo. Una columna de 20 × 20 cm y 3 m de alto son 0,12 m³.</li>
        <li><strong>Columna circular:</strong> 3,14 × radio² × alto.</li>
      </ul>
      <h3>Cuánto cemento, arena y piedra lleva un m³</h3>
      <p>La dosificación indica las partes de cada material en volumen. En un hormigón 1:3:3 va una parte de cemento, tres de arena y tres de piedra. Como los materiales se acomodan entre sí al mezclarse, un balde de cada uno no rinde tres baldes de hormigón: la calculadora usa el método de los coeficientes de aporte, que tiene en cuenta ese acomodamiento.</p>
      <p>Para un 1:3:3 el resultado es de unos 310 kg de cemento (unas 12 bolsas y media de 25 kg), 0,66 m³ de arena y 0,66 m³ de piedra por cada m³ de hormigón.</p>
      <h3>Importante en elementos estructurales</h3>
      <p>Las cantidades sirven para presupuestar y comprar. El reglamento CIRSOC 201 especifica el hormigón estructural por su clase de resistencia (H-20, H-25 y así), no por partes en volumen: la resistencia que necesita una losa, una viga o una columna la define el cálculo, y con ella la dosificación. Para los encadenados de una vivienda de mampostería, el CIRSOC 501-E pide como mínimo 13 MPa y 250 kg de cemento por m³. Si el elemento sostiene peso, consultá con el profesional a cargo de la obra.</p>`,
    faqs: [
      ["¿Cuántas bolsas de cemento lleva un m³ de hormigón?", "Depende de la dosificación. Un hormigón 1:3:3 lleva unos 310 kg por m³, que son unas 12 bolsas y media de 25 kg. Uno más cargado, 1:2:3, lleva unos 370 kg, cerca de 15 bolsas."],
      ["¿Cuánto hormigón necesito para una losa?", "Multiplicá largo por ancho por espesor, todo en metros. Una losa de 4 × 3 m con 12 cm de espesor lleva 1,44 m³, más un 5 % de desperdicio."],
      ["¿Cuántos m³ de arena y piedra lleva un m³ de hormigón?", "En un 1:3:3, unos 0,66 m³ de arena y 0,66 m³ de piedra partida. La suma supera 1 m³ porque los materiales se acomodan entre sí al mezclarse."],
      ["¿Conviene hacerlo en obra o pedir hormigón elaborado?", "Para volúmenes chicos suele prepararse en obra. A partir de algunos metros cúbicos, o cuando hay que llenar todo de una vez como en una losa, el elaborado ahorra tiempo y asegura una calidad pareja."],
      ["¿Qué desperdicio tengo que considerar?", "Un 5 % cubre lo que se pierde en el traslado, lo que queda en la hormigonera y las diferencias de encofrado. En excavaciones irregulares conviene subirlo a 10 %."]
    ]
  },
  {
    key: "pintura",
    file: "calculadora-pintura.html",
    icon: "M4 4h13v5H4z M17 6.5h3v5h-8v3 M10.5 14.5h3V21h-3z",
    name: "Pintura",
    card: "Litros de pintura según la superficie y las manos.",
    title: "Calculadora de pintura: litros por m² | CalcuObra",
    description: "Calculá cuántos litros de pintura necesitás para un ambiente según sus medidas, las manos y el rendimiento. Te dice qué envases comprar.",
    h1: "Calculadora de pintura",
    lead: "Cargá las medidas del ambiente y mirá cuántos litros necesitás y qué envases comprar.",
    fields: [
      sel("modo", "Cómo querés medir", [["ambiente", "Con las medidas del ambiente"], ["directo", "Ya sé los m² a pintar"]], { wide: true }),
      num("largo", "Largo", "m", "4", { showIf: "modo=ambiente" }),
      num("ancho", "Ancho", "m", "3", { showIf: "modo=ambiente" }),
      num("alto", "Alto", "m", "2,6", { showIf: "modo=ambiente" }),
      num("puertas", "Puertas", "", "1", { showIf: "modo=ambiente" }),
      num("ventanas", "Ventanas", "", "1", { showIf: "modo=ambiente" }),
      num("superficie", "Superficie", "m²", "30", { showIf: "modo=directo", hidden: true }),
      num("manos", "Manos", "", "2"),
      chk("techo", "Pintar también el cielorraso", false, { showIf: "modo=ambiente" }),
      num("rendimiento", "Rendimiento", "m² por litro", "8", { hint: "Por mano. En obra, 8 m²/L: 1 litro a dos manos cubre unos 4 m²", wide: true })
    ],
    steps: [
      "Medí el largo, el ancho y el alto del ambiente.",
      "Indicá puertas, ventanas y cuántas manos vas a dar.",
      "Mirá los litros totales y la combinación de envases que conviene."
    ],
    article: `
      <h2>Cómo se calcula la pintura</h2>
      <p>La cuenta tiene tres partes: la superficie a pintar, la cantidad de manos y el rendimiento de la pintura.</p>
      <p><strong>Litros = superficie × manos ÷ rendimiento</strong></p>
      <p>La superficie de las paredes es el perímetro del ambiente por la altura. En un cuarto de 4 × 3 m con 2,6 m de alto, el perímetro es 14 m y las paredes suman 36,4 m². A eso se le restan las aberturas: la calculadora descuenta 1,6 m² por puerta y 1,5 m² por ventana. Si pintás el cielorraso, se suma largo × ancho.</p>
      <h3>Qué rendimiento usar</h3>
      <p>El rendimiento se expresa por mano. El que figura en el envase está medido en condiciones ideales; en obra rinde menos, así que la calculadora parte de 8 m² por litro y por mano. Dicho de otra forma: con 1 litro a dos manos se pintan unos 4 m², y 40 m² a dos manos llevan 10 litros. Como referencia:</p>
      <ul>
        <li><strong>Látex interior:</strong> unos 8 m² por litro en obra (el envase suele indicar entre 10 y 12).</li>
        <li><strong>Látex exterior o superficies rugosas:</strong> entre 5 y 7 m² por litro.</li>
        <li><strong>Esmalte sintético:</strong> entre 10 y 14 m² por litro.</li>
      </ul>
      <p>Una pared nueva, porosa o con revoque grueso absorbe más pintura, y un cambio de color fuerte puede necesitar una tercera mano. En esos casos bajá el rendimiento o sumá una mano.</p>
      <h3>Fijador y enduido</h3>
      <p>La calculadora estima solo la pintura de terminación. En paredes nuevas o entizadas conviene dar antes una mano de fijador sellador, que se calcula igual: superficie dividido el rendimiento que indica su envase.</p>`,
    faqs: [
      ["¿Cuántos m² rinde un litro de pintura?", "En obra, un látex interior rinde unos 8 m² por litro y por mano: con 1 litro a dos manos se pintan cerca de 4 m². El envase suele indicar 10 a 12 m², pero eso es en condiciones ideales. En exteriores o superficies rugosas baja a 5 o 7 m² por litro."],
      ["¿Cuánta pintura necesito para una habitación de 4 × 3?", "Con 2,6 m de alto, una puerta y una ventana, las paredes suman unos 33 m². A dos manos y 8 m² por litro son algo más de 8 litros: conviene una lata de 10 litros."],
      ["¿Cuántas manos de pintura hay que dar?", "Dos manos es lo habitual. Si cambiás de un color oscuro a uno claro, o la pared es nueva, puede hacer falta una tercera."],
      ["¿Cuánto rinde una lata de 20 litros?", "A 8 m² por litro, una lata de 20 litros cubre unos 160 m² en una mano, o 80 m² a dos manos."],
      ["¿Tengo que descontar puertas y ventanas?", "Sí, salvo que sean muy pocas y prefieras tener un margen. La calculadora las descuenta automáticamente con medidas estándar."]
    ]
  },
  {
    key: "ceramicos",
    file: "calculadora-ceramicos.html",
    icon: "M4 4h16v16H4z M12 4v16 M4 12h16",
    name: "Cerámicos y pisos",
    card: "Cajas, adhesivo y pastina con el desperdicio incluido.",
    title: "Calculadora de cerámicos y pisos por m² | CalcuObra",
    description: "Calculá cuántas cajas de cerámicos o porcelanato necesitás, con desperdicio incluido, y cuánto adhesivo y pastina comprar. Gratis.",
    h1: "Calculadora de cerámicos y pisos",
    lead: "Cargá las medidas del ambiente y de la pieza y mirá cuántas cajas, adhesivo y pastina comprar.",
    fields: [
      num("largo", "Largo del ambiente", "m", "4"),
      num("ancho", "Ancho del ambiente", "m", "3"),
      num("piezaLargo", "Largo de la pieza", "cm", "60"),
      num("piezaAncho", "Ancho de la pieza", "cm", "60"),
      num("m2caja", "m² por caja", "", "1,44", { hint: "Figura en la caja" }),
      waste("10", "15 % si va en diagonal"),
      sel("llana", "Llana dentada", Object.keys(DATA.tile.adhesive).map((k) => [k, k + " mm"]), { value: "10" }),
      num("junta", "Junta", "mm", "3"),
      num("espesorPieza", "Espesor de la pieza", "mm", "8", { wide: true })
    ],
    steps: [
      "Medí el largo y el ancho del ambiente en metros.",
      "Cargá la medida de la pieza y los m² que trae cada caja.",
      "Mirá las cajas a comprar, el adhesivo y la pastina."
    ],
    article: `
      <h2>Cómo se calculan las cajas de cerámicos</h2>
      <p>Los cerámicos y porcelanatos se venden por caja, y cada caja indica cuántos m² cubre. La cuenta es:</p>
      <p><strong>Cajas = superficie × (1 + desperdicio) ÷ m² por caja</strong>, redondeando siempre para arriba.</p>
      <p>Un ambiente de 4 × 3 m tiene 12 m². Con 10 % de desperdicio hay que comprar 13,2 m², y si la caja trae 1,44 m² son 10 cajas.</p>
      <h3>Cuánto desperdicio sumar</h3>
      <ul>
        <li><strong>Colocación recta:</strong> 10 %.</li>
        <li><strong>Colocación en diagonal o con muchos recortes:</strong> 15 %.</li>
        <li><strong>Piezas grandes en ambientes chicos:</strong> hasta 20 %, porque cada corte desperdicia más material.</li>
      </ul>
      <p>Conviene comprar todo junto y guardar algunas piezas de repuesto: las partidas cambian de tono y de calibre, y conseguir la misma meses después es difícil.</p>
      <h3>Adhesivo y pastina</h3>
      <p>El consumo de adhesivo depende de la llana: cuanto más grande es la pieza, más profundo tiene que ser el diente. Como guía, una llana de 6 mm gasta unos 3 kg por m², una de 8 mm unos 4 kg y una de 10 mm unos 5 kg. Para piezas de 60 × 60 o más se usa llana de 10 o 12 mm y doble encolado.</p>
      <p>La pastina se calcula con la medida de la pieza, el ancho de la junta y el espesor de la pieza: cuanto más chica es la pieza, más metros de junta hay por m² y más pastina se gasta.</p>`,
    faqs: [
      ["¿Cuántas cajas de cerámicos necesito para 20 m²?", "Con 10 % de desperdicio son 22 m². Dividí ese número por los m² que trae la caja y redondeá para arriba: si la caja trae 2 m² son 11 cajas, y si trae 1,44 m² son 16."],
      ["¿Cuánto desperdicio hay que calcular en cerámicos?", "Un 10 % para colocación recta y un 15 % para colocación en diagonal. En ambientes con muchos recortes o con piezas muy grandes conviene sumar un poco más."],
      ["¿Cuánto rinde una bolsa de adhesivo de 30 kg?", "Con llana de 8 mm rinde unos 7 m², y con llana de 10 mm, unos 6 m². El rendimiento real depende de lo pareja que esté la base."],
      ["¿Cuánta pastina necesito?", "Para piezas de 60 × 60 con junta de 3 mm, alrededor de 150 gramos por m². Con piezas chicas, de 20 × 20, el consumo se triplica."],
      ["¿Sirve para revestimientos de pared?", "Sí. En lugar del largo y el ancho del ambiente, cargá el largo y el alto de la pared a revestir."]
    ]
  },
  {
    key: "escaleras",
    file: "calculadora-escaleras.html",
    icon: "M3 20h5v-5h5v-5h5V5h3",
    name: "Escaleras",
    card: "Cantidad de escalones, huella y contrahuella.",
    title: "Calculadora de escaleras: huella y contrahuella | CalcuObra",
    description: "Calculá cuántos escalones lleva tu escalera y la medida de la huella y la contrahuella con la regla de Blondel. Gratis y al instante.",
    h1: "Calculadora de escaleras",
    lead: "Cargá la altura a salvar y mirá cuántos escalones lleva y cuánto miden la huella y la contrahuella.",
    fields: [
      num("altura", "Altura a salvar", "cm", "270", { hint: "De piso terminado a piso terminado", wide: true }),
      num("maxc", "Contrahuella máxima", "cm", "18"),
      num("largoDisp", "Largo disponible", "cm", "", { hint: "Opcional" })
    ],
    steps: [
      "Medí la altura entre el piso de abajo y el de arriba, ya terminados.",
      "Si el espacio es limitado, cargá el largo disponible.",
      "Mirá los escalones, sus medidas y si la escalera resulta cómoda."
    ],
    article: `
      <h2>Cómo se calcula una escalera</h2>
      <p>Una escalera cómoda tiene todos los escalones iguales y una relación equilibrada entre lo que se sube y lo que se avanza en cada paso. La cuenta se hace en tres pasos:</p>
      <ul>
        <li><strong>Cantidad de escalones:</strong> altura a salvar ÷ contrahuella máxima, redondeando para arriba. Para 270 cm y 18 cm de máxima son 15 escalones.</li>
        <li><strong>Contrahuella real:</strong> altura ÷ cantidad de escalones. En el ejemplo, 270 ÷ 15 = 18 cm.</li>
        <li><strong>Huella:</strong> se obtiene con la regla de Blondel.</li>
      </ul>
      <h3>La regla de Blondel</h3>
      <p><strong>2 contrahuellas + 1 huella = entre 60 y 64 cm</strong>, que es el largo de un paso normal. Con una contrahuella de 18 cm, la huella ideal es 63 − 36 = 27 cm.</p>
      <p>La cantidad de huellas es siempre una menos que la de contrahuellas, porque el último escalón es el piso de arriba. Por eso 15 escalones tienen 14 huellas y un desarrollo horizontal de 14 × 27 = 378 cm.</p>
      <h3>Medidas de referencia</h3>
      <p>Para una escalera principal de vivienda se suele pedir una contrahuella de hasta 18 cm y una huella de al menos 26 cm. Cada municipio fija sus propios valores en el código de edificación, así que verificá el de tu localidad antes de construir.</p>
      <p>Si cargás el largo disponible, la calculadora reparte ese largo entre las huellas y te avisa si la escalera queda demasiado empinada.</p>`,
    faqs: [
      ["¿Cuánto debe medir la huella y la contrahuella de una escalera?", "Lo más cómodo es una contrahuella de entre 16 y 18 cm y una huella de entre 26 y 30 cm, de modo que dos contrahuellas más una huella sumen entre 60 y 64 cm."],
      ["¿Cuántos escalones necesito para subir 2,70 m?", "Con una contrahuella de 18 cm son 15 escalones. Con una más baja, de 17 cm, son 16 escalones de 16,9 cm."],
      ["¿Qué es la regla de Blondel?", "Es la fórmula que relaciona la huella y la contrahuella con el largo del paso: 2 contrahuellas + 1 huella = 63 cm, con un margen de 60 a 64 cm."],
      ["¿Cuánto lugar ocupa una escalera?", "El desarrollo horizontal es la huella por la cantidad de huellas. Una escalera recta de 15 escalones con huella de 27 cm ocupa 3,78 m de largo, sin contar descansos."],
      ["¿Por qué hay una huella menos que contrahuellas?", "Porque el último escalón llega directamente al piso superior, que hace de huella. Si hay 15 contrahuellas, hay 14 huellas."]
    ]
  },
  {
    key: "contrapiso",
    file: "calculadora-contrapiso.html",
    icon: "M12 4l9 4.5-9 4.5-9-4.5z M3 13l9 4.5 9-4.5 M3 17l9 4.5 9-4.5",
    name: "Contrapiso y carpeta",
    card: "Volumen y materiales para contrapiso y carpeta.",
    title: "Calculadora de contrapiso y carpeta | CalcuObra",
    description: "Calculá los m³ y los materiales para hacer un contrapiso y su carpeta: cemento, cal, arena y cascote según la superficie y el espesor.",
    h1: "Calculadora de contrapiso y carpeta",
    lead: "Cargá la superficie y los espesores y mirá el volumen y los materiales que necesitás.",
    fields: [
      num("largo", "Largo", "m", "4"),
      num("ancho", "Ancho", "m", "3"),
      num("espesor", "Espesor del contrapiso", "cm", "10"),
      waste("5"),
      sel("mezcla", "Mezcla del contrapiso", mixes("ccas", "h135"), { wide: true }),
      chk("carpeta", "Incluir carpeta de nivelación", true),
      num("espCarpeta", "Espesor de la carpeta", "cm", "2", { showIf: "carpeta=1" })
    ],
    steps: [
      "Medí el largo y el ancho de la superficie en metros.",
      "Indicá el espesor del contrapiso y, si va, el de la carpeta.",
      "Mirá los m³ de cada capa y el total de materiales a comprar."
    ],
    article: `
      <h2>Cómo se calcula un contrapiso</h2>
      <p>El contrapiso es la capa que va sobre el terreno o la losa y da el nivel y la pendiente al piso. Arriba lleva una carpeta fina de cemento y arena, que deja la superficie lisa para colocar el piso.</p>
      <p><strong>Volumen = largo × ancho × espesor</strong>, con el espesor en metros. Un contrapiso de 4 × 3 m y 10 cm de espesor son 4 × 3 × 0,10 = 1,2 m³, y su carpeta de 2 cm, 0,24 m³.</p>
      <h3>Qué espesor usar</h3>
      <ul>
        <li><strong>Contrapiso sobre terreno natural:</strong> entre 10 y 12 cm.</li>
        <li><strong>Contrapiso sobre losa:</strong> entre 5 y 8 cm.</li>
        <li><strong>Carpeta de nivelación:</strong> entre 2 y 3 cm.</li>
      </ul>
      <h3>Qué mezcla lleva</h3>
      <p>El contrapiso tradicional es el hormigón de cascotes, con proporción 1/8:1:4:8 de cemento, cal, arena y cascote de ladrillo. Es económico y aprovecha el escombro de la propia obra. La alternativa es un hormigón pobre 1:3:5 de cemento, arena y piedra, más resistente y recomendable donde va a haber cargas o tránsito de vehículos.</p>
      <p>La carpeta se calcula con mezcla 1:3 de cemento y arena. Si va sobre terreno o en un baño, se le agrega hidrófugo en el agua de amasado según indique el fabricante.</p>`,
    faqs: [
      ["¿Cuántos m³ de contrapiso necesito?", "Multiplicá la superficie por el espesor en metros. Para 20 m² y 10 cm de espesor son 20 × 0,10 = 2 m³, más un 5 % de desperdicio."],
      ["¿Qué espesor debe tener un contrapiso?", "Sobre terreno natural, entre 10 y 12 cm. Sobre losa alcanza con 5 a 8 cm, lo necesario para dar nivel y tapar cañerías."],
      ["¿Cuánto cemento lleva una carpeta?", "Una carpeta de 2 cm con mezcla 1:3 lleva cerca de 10 kg de cemento por m², es decir, una bolsa de 25 kg cada 2,5 m²."],
      ["¿Qué diferencia hay entre contrapiso y carpeta?", "El contrapiso es la capa gruesa que da el nivel. La carpeta es una capa fina de cemento y arena que va arriba y deja la superficie lisa para colocar el piso."],
      ["¿Puedo hacer el contrapiso con piedra en lugar de cascote?", "Sí. Un hormigón pobre 1:3:5 con piedra partida es más resistente que el de cascotes y conviene en cocheras o donde va a haber peso."]
    ]
  }
];

// ---------- Diseñador de planos ----------
const WALL_TYPES = DATA.wallTypes.map((t) => [t.id, t.name]); // el diseñador los reemplaza por los tipos del plano abierto
const PLANNER = {
  file: "disenador-de-planos.html",
  icon: "M3 3h18v18H3z M3 13h8 M11 3v6 M11 13v8 M15 13h6",
  app: true,
  js: ["lib/manifest.js", "lib/calc.js", "lib/plan.js", "lib/cirsoc.js", "lib/sketch.js", "lib/sheets.js", "lib/dxf.js", "lib/schedules.js", "view3d.js", "docs.js", "panel.js", "planner.js"],
  title: "Diseñador de planos con cómputo de materiales | CalcuObra",
  description: "Dibujá el plano de tu casa online, miralo en 3D, anotalo, compará opciones y obtené el cómputo de materiales: ladrillos, cemento, revoques, pisos, techo y pintura.",
  h1: "Diseñador de planos con cómputo de materiales",
  lead: "Dibujá la planta, amueblala, mirala en 3D y llevate la lista de materiales de toda la vivienda, con las medidas y los formatos que se venden en Argentina.",
  fields: [
    num("height", "Alto de pared", "m", "2,6"),
    num("coats", "Manos de pintura", "", "2"),
    sel("system", "Estructura", [["portante", "Muros portantes (CIRSOC 501-E)"], ["independiente", "Independiente de hormigón armado (CIRSOC 201)"]], { value: "portante", wide: true }),
    sel("zone", "Zona sísmica", [["0", "0 — muy reducida"], ["1", "1 — reducida"], ["2", "2 — moderada"], ["3", "3 — elevada"], ["4", "4 — muy elevada"]], { value: "0" }),
    sel("mortar", "Mortero de asiento", mixes("mE", "mI", "mN").map(([k, text]) => [k, text.split(",")[0]]), { value: "mI" }),
    sel("ext", "Muros exteriores, por defecto", WALL_TYPES, { value: "ext-portante18", wide: true }),
    sel("int", "Muros interiores, por defecto", WALL_TYPES, { value: "int-hueco8", wide: true }),
    sel("roof", "Cubierta", Object.keys(DATA.roofs).map((k) => [k, DATA.roofs[k].label]), { value: "chapa", wide: true }),
    num("slab", "Contrapiso", "cm", "10"),
    num("screed", "Carpeta", "cm", "2"),
    chk("ceiling", "Pintar los cielorrasos", true)
  ],
  steps: [
    "Dibujá con Pared (muro por muro) o con Ambiente (un rectángulo de una vez). Los ambientes se detectan solos al cerrarse.",
    "Elegí una puerta o ventana de la biblioteca y tocá la pared donde va. Tocá cualquier elemento para cambiarle la medida, o un ambiente para ponerle nombre.",
    "Elegí ladrillos, cubierta y pisos, mirá el resultado en 3D y copiá, exportá o mandá el cómputo por WhatsApp."
  ],
  article: `
      <h2>Cómo se arma el cómputo a partir del plano</h2>
      <p>El diseñador mide lo que dibujás y aplica las mismas fórmulas que las calculadoras del sitio, pero para toda la vivienda de una vez.</p>
      <ul>
        <li><strong>Muros:</strong> toma el largo de cada pared por la altura y le descuenta puertas y ventanas. Un muro que tiene ambientes de los dos lados se cuenta como interior; el resto, como exterior. Cada clase tiene un tipo de muro por defecto, y a cualquier muro le podés elegir otro tocándolo. Con esa superficie calcula los ladrillos de cada tipo y el mortero de asiento.</li>
        <li><strong>Tipos de muro:</strong> como en los programas BIM, cada tipo es un ladrillo más las capas de revoque de cada cara (azotado hidrófugo, grueso y fino). El plano dibuja el espesor terminado y los revoques salen capa por capa. Si cambiás un tipo, cambian todos los muros que lo usan.</li>
        <li><strong>Ambientes:</strong> cada espacio cerrado por paredes es un ambiente. Su superficie útil se mide entre ejes de muro y se le descuenta el espesor de las paredes.</li>
        <li><strong>Revoques:</strong> grueso a la cal y fino en bolsa sobre las caras interiores; al exterior se suma el azotado hidrófugo.</li>
        <li><strong>Contrapiso, carpeta y pisos:</strong> se calculan sobre la superficie útil. A cada ambiente le podés elegir el piso: cerámico, porcelanato, flotante o cemento alisado, con su adhesivo y sus zócalos.</li>
        <li><strong>Cubierta y cielorraso:</strong> chapa galvanizada, tejas francesas o losa con membrana, con el alero y la pendiente habituales. Con chapa o tejas se suman las placas de yeso del cielorraso.</li>
        <li><strong>Pintura:</strong> suma las caras de pared que dan a un ambiente y, si querés, los cielorrasos.</li>
        <li><strong>Artefactos y electricidad:</strong> cuenta los sanitarios, la cocina y las bocas eléctricas que coloques en el plano.</li>
      </ul>
      <h3>Verificación contra los reglamentos CIRSOC</h3>
      <p>El diseñador revisa el plano contra el CIRSOC 501-E, el reglamento para construcciones de mampostería de hasta tres pisos en zona sísmica 0. Controla que el ladrillo exterior sea portante y tenga el espesor mínimo, la altura de planta, la distancia entre soportes verticales, la longitud de muros resistentes en cada dirección, el ancho y la ubicación de las aberturas y que los muros de arriba apoyen sobre los de abajo. Cada resultado cita el artículo del que sale.</p>
      <p>También arma el análisis de cargas con los pesos y las sobrecargas del CIRSOC 101, estima la tensión media sobre los muros y computa los encadenados con la armadura mínima que fija el reglamento. En zonas sísmicas 1 a 4 avisa que rige el INPRES-CIRSOC 103 Parte III. Es una verificación de apoyo: no reemplaza el proyecto ni la firma de un profesional matriculado.</p>
      <h3>Qué no incluye</h3>
      <p>No incluye las fundaciones, ni las columnas, vigas y losas de una estructura independiente, la tirantería del techo, ni las cañerías y el cableado de las instalaciones: esos rubros dependen del proyecto y del cálculo de un profesional.</p>
      <h3>Vista 3D, medición y archivos</h3>
      <p>Con el botón 3D ves la vivienda levantada, con todas sus plantas apiladas, sus vanos y sus muebles, y la podés girar. Con Recorrer caminás por adentro de la casa a la altura de los ojos, pasando por las puertas; Separar despega las plantas y levanta el techo para ver cada piso; Rayos X vuelve traslúcidos los muros, y Corte rebana la vivienda a la altura que elijas. Si activás la capa Techo, la cubierta aparece en 3D y su contorno en la planta. La línea de corte genera un corte vertical con los muros, los vanos, los entrepisos y el perfil del techo. La herramienta Medir da la distancia entre dos puntos. Si tenés un boceto hecho a mano, Boceto a plano detecta las paredes, las puertas y las ventanas y las pasa en limpio. Si tenés un plano en papel o en foto, cargalo como imagen para calcar, indicá su ancho real y dibujá encima. Desde Exportar guardás el plano como imagen, como dibujo vectorial, como DXF para seguirlo en AutoCAD (en metros, con muros, puertas, ventanas, muebles, instalación eléctrica, textos y cotas generales en capas separadas) o como archivo para seguir editándolo después o en otra computadora.</p>
      <h3>Para arquitectos e interioristas: anotar, comparar y presentar</h3>
      <p>Sobre el plano podés dibujar como en un papel de calco. El lápiz traza a mano alzada, y además hay línea, flecha, rectángulo, elipse, nube de revisión y nota de texto, en siete colores y tres grosores. Cada anotación queda como un objeto: la tocás para moverla, estirarla de sus puntos, cambiarle el color, duplicarla o borrarla. Van en su propia capa, que se oculta con un toque, no entran en el cómputo y salen en la imagen PNG, en el SVG y en el DXF (capa ANOTACIONES).</p>
      <p>Con Duplicar como otra opción guardás hasta seis versiones del mismo proyecto (Opción A, B, C…) dentro de un solo plano: probás otra distribución, otro tamaño de cocina o una ampliación sin perder la anterior. Una tabla compara la superficie útil, los ladrillos y el cemento de cada una. A cada ambiente le podés dar un color para distinguir zonas, y ese color se ve también en la vista 3D.</p>
      <p>Si un mueble no está en la biblioteca, lo armás vos: el Mueble a medida, en Equipamiento → Mis muebles, lleva el nombre, el ancho, el fondo, el alto y la forma (rectangular o redonda) que le pongas, y su nombre queda escrito en el plano. Con Guardar en Mis muebles pasa a tu biblioteca personal, junto con cualquier mueble de la biblioteca general al que le hayas cambiado la medida, y lo volvés a colocar con un toque en cualquier plano. La biblioteca personal queda en este navegador.</p>
      <p>El modo Presentar deja en pantalla solo el plano, a pantalla completa, con lo justo para mostrarlo frente al cliente: mover, dibujar, señalar, escribir una nota, cambiar de opción y pasar a 3D. Lo que marques durante la reunión queda guardado en el plano.</p>
      <h3>Documentación de obra para presentar</h3>
      <p>Desde Exportar, Documentación de obra arma las láminas a escala con su carátula: plantas acotadas a ejes de muro, planta de techos, dos cortes, fachadas, instalación eléctrica, silueta y balance de superficies con FOS y FOT, y planilla de iluminación y ventilación. Cargás los datos del propietario, la nomenclatura catastral, las medidas del terreno y los profesionales, elegís el formato (A3 a A0) y la escala, y las imprimís o las guardás en PDF en tamaño real. Cada municipio tiene su modelo de carátula y sus exigencias, y los planos deben llevar la firma de un profesional matriculado: usalas como base y revisá el reglamento local.</p>
      <h3>Dónde queda guardado el plano</h3>
      <p>El plano se guarda solo en tu navegador, en este dispositivo. No se sube a ningún servidor y no hace falta crear una cuenta. Si borrás los datos del navegador o cambiás de dispositivo, el plano no va a estar.</p>`,
  faqs: [
    ["¿Cómo dibujo una pared con una medida exacta?", "Mientras la dibujás, escribí el largo en metros y apretá Enter. También podés tocarla después con Seleccionar y cambiarle el largo."],
    ["¿Puedo usar un muro distinto en cada pared?", "Sí, de tres maneras. Antes de dibujar, elegís el tipo de los muros nuevos. Después, tocás un muro y le cambiás el suyo. Y arrastrando un recuadro elegís varios muros a la vez (o todos con Ctrl+A) y les ponés el mismo. En el celular o la tablet, activá Elegir varios y tocá los muros uno por uno. Los que no toques usan el tipo por defecto de los ajustes. Si un muro largo cambia de tipo a mitad de camino, lo dividís en dos."],
    ["¿Sirve para una ampliación o una refacción?", "Sí. Tocá cada muro o abertura que ya existe y elegí su fase: existente o existente a demoler (o dibujá lo existente con la fase Existente elegida antes de empezar). Lo nuevo se dibuja como siempre. El cómputo cuenta solo lo que se construye y suma la demolición con el escombro y los contenedores. En Capas › Fases podés ver el plano como queda, como está hoy o con los colores del plano municipal: existente, a demoler en amarillo y a construir en rojo."],
    ["¿Qué es un tipo de muro?", "Es la receta de un muro: qué ladrillo lleva y qué revoques tiene de cada lado. Vienen armados los más comunes (bloque portante de 18, ladrillo común de 30 revocado o visto, hueco de 8 para tabiques) y en el panel Tipos de muro podés duplicarlos y cambiarles el ladrillo o el espesor del azotado y del grueso. Al editar un tipo cambian todos los muros que lo usan, en todas las plantas."],
    ["¿Qué puertas y ventanas trae la biblioteca?", "Puertas de 70, 80 y 90 cm, doble, corrediza, puerta balcón, portón de garage y vano sin puerta; ventanas de 100 a 180 cm, ventiluz y paño fijo. A cada una le podés cambiar el ancho y el alto."],
    ["¿Qué materiales calcula el diseñador?", "Ladrillos y mortero, revoques, contrapiso, carpeta, pisos con adhesivo y zócalos, cielorraso, cubierta y pintura interior, con el total de cemento, cal, arena y cascote. También lista aberturas, artefactos y bocas eléctricas."],
["¿Verifica el plano con los reglamentos CIRSOC?", "Sí. Revisa los muros contra el CIRSOC 501-E (mampostería de hasta tres pisos en zona sísmica 0): ladrillo portante, espesores, alturas, distancia entre soportes, longitud de muros por dirección y aberturas. Usa las cargas del CIRSOC 101 y cita el artículo de cada control. No reemplaza al profesional."],
    ["¿Incluye la estructura?", "Computa los encadenados horizontales y verticales con la armadura mínima del CIRSOC 501-E. Fundaciones, losas, vigas, columnas y tirantería dependen del cálculo estructural y quedan fuera."],
    ["¿Puedo dibujar una casa de dos plantas?", "Sí, hasta cuatro plantas. Al agregar una planta arranca con los muros exteriores de la de abajo, que queda a la vista como guía. El cómputo suma todas: contrapiso grueso solo en planta baja, losa de entrepiso entre plantas y cubierta sobre la última."],
    ["¿Calcula la instalación eléctrica?", "Cuenta las bocas que colocás (tomas, llaves, bocas de luz y tablero) y, si las unís con la herramienta Cablear bocas, estima los metros de caño corrugado y de cable, sumando las bajadas desde el techo. No reemplaza el proyecto eléctrico de un matriculado."],
    ["¿Puedo dibujar el patio, la vereda o una galería?", "Sí, con la herramienta Superficie exterior. Elegís el tipo y el cómputo suma su contrapiso y su piso por separado de los ambientes interiores."],
    ["¿Puedo ver el plano en 3D?", "Sí. El botón 3D levanta las paredes con sus puertas y ventanas y muestra los muebles. Podés girar y acercar la vista, recorrer la casa por adentro caminando, separar las plantas, ver a través de los muros y cortarla a cualquier altura."],
["¿Puedo subir un boceto hecho a mano?", "Sí. Con Boceto a plano subís una foto del dibujo y el diseñador detecta las paredes, las endereza y cierra las esquinas. Indicás el ancho real de la casa y las agrega al plano. También ubica las puertas (dibujadas con su hoja y su arco), las ventanas (doble línea o un rectángulo sobre la pared) y los vanos. Reconoce paredes horizontales y verticales; las que van en diagonal se agregan después a mano."],
    ["¿Puedo calcar un plano que ya tengo?", "Sí. Cargá una foto o imagen del plano, indicá su ancho real en metros y dibujá las paredes encima."],
    ["¿Puedo usarlo desde el celular?", "Sí, funciona en el navegador del celular. Para dibujar una vivienda completa es más cómodo una tablet o una computadora."],
    ["¿Sirve para presentar los planos en la municipalidad?", "Arma las láminas a escala con carátula, plantas acotadas, cortes, fachadas, balance de superficies y planilla de iluminación y ventilación, listas para imprimir o guardar en PDF. Cada municipio tiene su propio modelo y exige la firma de un profesional matriculado, que es quien debe revisarlas y presentarlas."],
    ["¿Puedo abrir el plano en AutoCAD?", "Sí. Desde Exportar descargás un DXF que abre AutoCAD y cualquier programa compatible. Va en metros, con todas las plantas una al lado de la otra y una capa por rubro: muros, puertas, ventanas, muebles, eléctrica, exteriores, techo, textos, cotas y anotaciones."],
    ["¿Puedo cargar un mueble que no está en la biblioteca?", "Sí. En Equipamiento, dentro de Mis muebles, colocá el Mueble a medida y ponele nombre, ancho, fondo, alto y forma. Con Guardar en Mis muebles queda en tu biblioteca personal para usarlo en cualquier plano desde este navegador. También podés guardar ahí un mueble de la biblioteca con otra medida."],
    ["¿Puedo dibujar y escribir notas sobre el plano?", "Sí. En la sección Anotar hay lápiz a mano alzada, línea, flecha, rectángulo, elipse, nube de revisión y nota de texto, con colores y grosores. Cada anotación se puede mover, editar y borrar después, y no altera el cómputo de materiales."],
    ["¿Puedo comparar dos distribuciones de la misma casa?", "Sí. Con Duplicar como otra opción el plano guarda hasta seis versiones (Opción A, B, C…). Cambiás de una a otra con el selector de arriba y una tabla compara superficie útil, ladrillos y cemento. Los ajustes de obra son comunes a todas."],
    ["¿Sirve para mostrarle el proyecto a un cliente?", "Sí. El botón Presentar deja solo el plano a pantalla completa, con herramientas para moverlo, dibujar encima, señalar, anotar, cambiar de opción y verlo en 3D. Para salir, apretá Esc o Salir."],
    ["¿Tengo que registrarme para guardar el plano?", "No. El plano se guarda automáticamente en tu navegador. Para llevarlo a otra computadora, exportalo como archivo y abrilo allá."]
  ]
};

const UI = {
  back: "M15 5l-7 7 7 7",
  select: "M5 3l14 7-6 2-2 6z",
  multi: "M4 4h11v11H4z M9 15v5h11V9h-5",
  pan: "M8 12V6a1.5 1.5 0 013 0v5 M11 11V4.500a1.5 1.5 0 013 0V11 M14 11V6.500a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-.5a6 6 0 01-5-2.700L3.500 14a1.500 1.500 0 012.500-1.600L8 15",
  wall: "M3 5h18v14H3z M3 9.7h18 M3 14.3h18 M9 5v4.7 M15 5v4.7 M12 9.7v4.6 M9 14.3V19 M15 14.3V19",
  room: "M4 5h16v14H4z",
  undo: "M8 5L3 10l5 5 M3 10h10a6 6 0 010 12h-2",
  redo: "M16 5l5 5-5 5 M21 10H11a6 6 0 000 12h2",
  minus: "M5 12h14",
  plus: "M12 5v14 M5 12h14",
  fit: "M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5",
  print: "M7 8V3h10v5 M7 17H4V9h16v8h-3 M7 14h10v7H7z",
  sample: "M3 11l9-7 9 7v9H3z",
  clear: "M5 7h14 M9 7V4h6v3 M7 7l1 13h8l1-13",
  measure: "M3 17L17 3l4 4L7 21z M7 13l2 2 M10 10l2 2 M13 7l2 2",
  "ref-load": "M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15 9.500a1 1 0 100-.010",
  snap: "M6 3v9a6 6 0 0012 0V3h-4v9a2 2 0 01-4 0V3z M6 7h4 M14 7h4",
  export: "M12 15V3 M7 8l5-5 5 5 M4 15v5h16v-5",
  "level-add": "M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M12 15v6 M9 18h6",
  "level-remove": "M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M9 19h6",
  arc: "M4 19A15 15 0 0119 4 M4 19v-3 M4 19h3",
  surface: "M4 4h16v16H4z M4 10h16 M4 15h16 M9 4v6 M15 10v5 M9 15v5",
  wire: "M4 12a8 8 0 0116 0 M4 12h.010 M20 12h.010 M4 12v6 M20 12v6",
  section: "M3 12h5 M11 12h2 M16 12h5 M3 8v8 M21 8v8",
  "sketch-load": "M4 20l1-4L16 5l3 3L8 19z M14 7l3 3 M4 4h5 M4 8h3",
  pen: "M4 20c3-1 3-5 6-5s2 4 5 3 3-6 5-8",
  line: "M5 19L19 5",
  arrow: "M5 19L19 5 M10 5h9v9",
  rect: "M4 6h16v12H4z",
  ellipse: "M12 5a8 7 0 100 14 8 7 0 000-14z",
  cloud: "M7 18a4 4 0 01-.500-8 5 5 0 019.600-1.300A4.500 4.500 0 0117 18z",
  text: "M5 7V4h14v3 M12 4v16 M9 20h6",
  present: "M3 4h18v12H3z M12 16v4 M8 20h8 M10 7.500l5 2.500-5 2.500z",
  "variant-add": "M4 8h11v12H4z M8 8V4h12v12h-5 M9.500 12v4 M7.500 14h4",
  "variant-remove": "M4 8h11v12H4z M8 8V4h12v12h-5 M7.500 14h4",
  exit: "M6 6l12 12 M18 6L6 18"
};

function plannerPage() {
  const p = PLANNER;
  const row = (attr, key, text, kbd) => '<button type="button" class="ws-row" data-' + attr + '="' + key + '"' + (attr === "tool" ? ' aria-pressed="false"' : "") + ">" +
    icon(UI[key]) + "<span>" + text + "</span>" + (kbd ? "<kbd>" + kbd + "</kbd>" : "") + "</button>";
  const tbtn = (action, key, text) => '<button type="button" class="ws-btn" data-action="' + action + '" title="' + text + '" aria-label="' + text + '">' + icon(UI[key]) + "</button>";
  const layer = (key, text) => '<label class="ws-layer"><input type="checkbox" data-layer="' + key + '" checked> ' + text + "</label>";
  p.ld = [
    Object.assign({
      "@context": "https://schema.org", "@type": "WebApplication", name: p.h1, description: p.description,
      applicationCategory: "DesignApplication", operatingSystem: "Any", inLanguage: "es-AR",
      offers: { "@type": "Offer", price: "0", priceCurrency: "ARS" }
    }, SITE_URL ? { url: SITE_URL + "/" + p.file } : {}),
    {
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: p.faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } }))
    }
  ];
  const body = [
    '    <div class="ws" data-planner>',
    '      <div class="ws-top">',
    '        <a class="ws-btn" href="index.html" title="Volver al inicio" aria-label="Volver al inicio">' + icon(UI.back) + "</a>",
    '        <a class="logo" href="index.html">' + LOGO + "<span>" + BRAND.name + "</span></a>",
    '        <div class="ws-name"><input data-title type="text" value="Plano sin título" maxlength="60" aria-label="Nombre del plano"><small>Guardado en este navegador</small></div>',
    '        <select class="ws-level" data-level aria-label="Planta que se está dibujando"><option>Planta baja</option></select>',
    '        <select class="ws-level" data-variant aria-label="Opción de diseño que se está viendo" hidden></select>',
    '        <div class="ws-group ws-views"><button type="button" data-view="2d" aria-pressed="true">2D</button><button type="button" data-view="3d" aria-pressed="false">3D</button></div>',
    '        <div class="ws-group">' + tbtn("undo", "undo", "Deshacer (Ctrl+Z)") + tbtn("redo", "redo", "Rehacer (Ctrl+Y)") + "</div>",
    '        <div class="ws-group">' + tbtn("zoom-out", "minus", "Alejar") + '<output data-zoom>100%</output>' + tbtn("zoom-in", "plus", "Acercar") + tbtn("fit", "fit", "Encuadrar el plano") + "</div>",
    '        <button type="button" class="ws-btn ws-toggle" data-action="snap" aria-pressed="true" title="Imán a la grilla y a las paredes" aria-label="Imán a la grilla y a las paredes">' + icon(UI.snap) + "</button>",
    "        " + tbtn("present", "present", "Presentar: solo el plano, a pantalla completa"),
    '        <details class="ws-menu">',
    '          <summary class="btn btn-sm">' + icon(UI.export) + "<span>Exportar</span></summary>",
    '          <div class="ws-menu-list">',
    '            <button type="button" data-action="docs">Documentación de obra (láminas)</button>',
    '            <button type="button" data-action="schedules">Planillas de carpinterías y locales</button>',
    '            <button type="button" data-action="print">Imprimir o guardar PDF</button>',
    '            <button type="button" data-action="export-png">Imagen PNG</button>',
    '            <button type="button" data-action="export-svg">Dibujo vectorial SVG</button>',
    '            <button type="button" data-action="export-dxf">Dibujo para AutoCAD (DXF)</button>',
    '            <button type="button" data-action="export-json">Archivo del plano</button>',
    '            <button type="button" data-action="open-file">Abrir un archivo…</button>',
    "          </div>",
    "        </details>",
    '        <input type="file" data-file="plan" accept=".json,application/json" hidden>',
    '        <input type="file" data-file="ref" accept="image/*" hidden>',
    '        <input type="file" data-file="sketch" accept="image/*" hidden>',
    "      </div>",
    '      <aside class="ws-side" aria-label="Herramientas">',
    '        <div class="ws-modes">',
    '          <button type="button" class="ws-mode" data-tool="select" aria-pressed="true">' + icon(UI.select) + "<span>Selección</span><kbd>V</kbd></button>",
    '          <button type="button" class="ws-mode" data-tool="pan" aria-pressed="false">' + icon(UI.pan) + "<span>Mano</span><kbd>H</kbd></button>",
    '          <button type="button" class="ws-mode ws-multi" data-action="multi" aria-pressed="false">' + icon(UI.multi) + "<span>Elegir varios</span></button>",
    "        </div>",
    '        <details class="ws-sec" open><summary><b>01</b> Estructura</summary>',
    "          " + row("tool", "wall", "Pared", "W"),
    "          " + row("tool", "room", "Ambiente", "R"),
    "          " + row("tool", "arc", "Pared curva", "A"),
    "          " + row("tool", "surface", "Superficie exterior", "F"),
    "        </details>",
    '        <details class="ws-sec" data-collapse-mobile open><summary><b>02</b> Aberturas</summary>',
    '          <p class="ws-tip">Elegí una y tocá la pared. Atajos: <kbd>D</kbd> puerta · <kbd>N</kbd> ventana · <kbd>P</kbd> vano</p>',
    '          <div class="ws-library" data-library></div>',
    "        </details>",
    '        <details class="ws-sec" data-collapse-mobile open><summary><b>03</b> Equipamiento</summary>',
    '          <p class="ws-tip">Muebles, artefactos y bocas eléctricas con medidas reales. Los artefactos y las bocas se suman al cómputo.</p>',
    "          " + row("tool", "wire", "Cablear bocas", "K"),
    '          <div class="ws-library" data-items></div>',
    "        </details>",
    '        <details class="ws-sec" data-collapse-mobile open><summary><b>04</b> Medir y calcar</summary>',
    "          " + row("tool", "measure", "Medir", "M"),
    "          " + row("tool", "section", "Línea de corte", "S"),
    "          " + row("action", "sketch-load", "Boceto a plano"),
    "          " + row("action", "ref-load", "Imagen para calcar"),
    '          <div class="ws-ref" data-ref-box hidden>',
    '            <label>Ancho real <input data-ref="w" type="text" inputmode="decimal" autocomplete="off"> m</label>',
    '            <label>Opacidad <input data-ref="opacity" type="range" min="0.1" max="1" step="0.1"></label>',
    '            <button type="button" class="btn btn-ghost btn-sm" data-action="ref-clear">Quitar imagen</button>',
    "          </div>",
    "        </details>",
    '        <details class="ws-sec" data-collapse-mobile open><summary><b>05</b> Anotar</summary>',
    '          <p class="ws-tip">Ideas, correcciones y notas para el cliente, dibujadas sobre el plano. No entran en el cómputo.</p>',
    "          " + row("tool", "pen", "Lápiz a mano alzada", "B"),
    "          " + row("tool", "line", "Línea", "L"),
    "          " + row("tool", "arrow", "Flecha"),
    "          " + row("tool", "rect", "Rectángulo"),
    "          " + row("tool", "ellipse", "Elipse"),
    "          " + row("tool", "cloud", "Nube de revisión"),
    "          " + row("tool", "text", "Nota de texto", "T"),
    "        </details>",
    '        <details class="ws-sec" data-collapse-mobile open><summary><b>06</b> Plano</summary>',
    "          " + row("action", "variant-add", "Duplicar como otra opción"),
    "          " + row("action", "variant-remove", "Eliminar esta opción"),
    "          " + row("action", "level-add", "Agregar una planta arriba"),
    "          " + row("action", "level-remove", "Eliminar esta planta"),
    "          " + row("action", "sample", "Abrir plano de ejemplo"),
    "          " + row("action", "clear", "Vaciar todo el plano"),
    "        </details>",
    "      </aside>",
    '      <div class="ws-stage">',
    '        <div class="ws-canvas">',
    '          <svg class="planner-canvas plan-svg" data-canvas role="application" aria-label="Plano de la vivienda"></svg>',
    '          <div class="ws-empty" data-empty hidden>',
    "            <strong>Empezá con un ambiente</strong>",
    "            <p>Apretá <kbd>R</kbd> para un rectángulo o <kbd>W</kbd> para dibujar paredes</p>",
    '            <p class="ws-empty-note" data-empty-note hidden></p>',
    '            <div><button type="button" class="btn" data-tool="room">Dibujar un ambiente</button><button type="button" class="btn btn-ghost" data-action="sample">Abrir plano de ejemplo</button></div>',
    "          </div>",
    '          <div class="ws-3d" data-view3d hidden><p data-view3d-msg></p></div>',
    '          <div class="inspector" data-sketch-bar hidden>',
    '            <strong>Boceto</strong><span data-sketch-count></span>',
    '            <label>Ancho real de la casa <input data-sketch="width" type="text" inputmode="decimal" autocomplete="off" value="10"> m</label>',
    '            <label>Detalle <select data-sketch="detail"><option value="0.08">Bajo</option><option value="0.05" selected>Medio</option><option value="0.03">Alto</option></select></label>',
    '            <button type="button" class="btn" data-action="sketch-apply">Agregar al plano</button>',
    '            <button type="button" class="btn btn-ghost" data-action="sketch-cancel">Cancelar</button>',
    "          </div>",
    '          <div class="inspector" data-inspector hidden></div>',
    '          <div class="ws-present" role="toolbar" aria-label="Presentación">',
    '            <button type="button" data-tool="pan" aria-pressed="false" title="Mover el plano">' + icon(UI.pan) + "<span>Mover</span></button>",
    '            <button type="button" data-tool="pen" aria-pressed="false" title="Dibujar a mano alzada">' + icon(UI.pen) + "<span>Lápiz</span></button>",
    '            <button type="button" data-tool="arrow" aria-pressed="false" title="Señalar con una flecha">' + icon(UI.arrow) + "<span>Flecha</span></button>",
    '            <button type="button" data-tool="cloud" aria-pressed="false" title="Marcar con una nube de revisión">' + icon(UI.cloud) + "<span>Nube</span></button>",
    '            <button type="button" data-tool="text" aria-pressed="false" title="Escribir una nota">' + icon(UI.text) + "<span>Nota</span></button>",
    '            <select data-variant aria-label="Opción de diseño que se está viendo" hidden></select>',
    '            <button type="button" data-view="2d" aria-pressed="true">2D</button><button type="button" data-view="3d" aria-pressed="false">3D</button>',
    '            <button type="button" data-action="fit" title="Encuadrar el plano">' + icon(UI.fit) + "</button>",
    '            <button type="button" class="ws-present-exit" data-action="present-exit" title="Salir de la presentación (Esc)">' + icon(UI.exit) + "<span>Salir</span></button>",
    "          </div>",
    '          <div class="phase-legend" data-phase-legend hidden><span class="ph-old">Existente</span><span class="ph-demo">A demoler</span><span class="ph-new">A construir</span></div>',
    '          <div class="ws-status"><span data-coords>X · Y ·</span><span>imán 0,10 m</span><span class="ws-scale" data-scale></span></div>',
    "        </div>",
    '        <p class="planner-hint" data-hint></p>',
    "      </div>",
    '      <aside class="ws-panel" aria-label="Cómputo y ajustes">',
    '        <details class="ws-sec" data-section-box open hidden><summary>Corte A–A</summary>',
    '          <div data-section></div>',
    '          <button type="button" class="btn btn-ghost btn-sm" data-action="section-clear">Quitar el corte</button>',
    "        </details>",
    '        <details class="ws-sec" data-compare-box open hidden><summary>Comparar opciones</summary>',
    '          <div data-compare></div>',
    '          <p class="ws-tip">Cada opción es una versión completa del plano. El cómputo de abajo corresponde a la que está a la vista, marcada en amarillo.</p>',
    "        </details>",
    '        <details class="ws-sec"><summary>Verificación CIRSOC <span data-checks-count></span></summary>',
    '          <div data-checks></div>',
    "        </details>",
    '        <details class="ws-sec" open><summary>Cómputo de materiales</summary>',
    '          <div class="tool-result" data-result>',
    '            <noscript><p class="result-error">El diseñador necesita JavaScript para funcionar.</p></noscript>',
    "          </div>",
    "        </details>",
    '        <details class="ws-sec" open><summary>Ajustes de obra</summary>',
    '          <p class="ws-tip">Estos valores son para toda la obra. Para cambiar el tipo de un solo muro, tocalo en el plano.</p>',
    '          <form class="tool-form" data-settings novalidate>',
    "          " + p.fields.join("\n          "),
    "          </form>",
    "        </details>",
    '        <details class="ws-sec" data-types-box><summary>Tipos de muro</summary>',
    '          <div class="type-editor" data-types></div>',
    "        </details>",
    '        <details class="ws-sec" open><summary>Capas</summary>',
    '          <label class="phase-view">Fases <select data-phase-view><option value="obra">Cómo queda (lo existente en gris)</option><option value="actual">Estado actual (antes de la obra)</option><option value="municipal">Plano municipal (existente, a demoler y a construir)</option></select></label>',
    "          " + [["names", "Nombres de ambientes"], ["areas", "Superficies de ambientes"], ["dims", "Cotas de paredes"], ["tags", "Códigos de carpintería (P1, V1…)"], ["notes", "Anotaciones"], ["items", "Muebles y artefactos"], ["electric", "Electricidad"], ["below", "Planta de abajo (guía)"], ["roof", "Techo"], ["grid", "Cuadrícula"]].map(([k, text]) => layer(k, text)).join("\n          "),
    "        </details>",
    "      </aside>",
    "    </div>",
    "",
    '    <div class="container">',
    '    <section class="hero">',
    '      <p class="eyebrow">Gratis · En tu navegador · Sin registro</p>',
    "      <h1>" + p.h1 + "</h1>",
    '      <p class="lead">' + p.lead + "</p>",
    "    </section>",
    "",
    AD("debajo del diseñador"),
    "",
    '    <section class="section">',
    "      <h2>Cómo usarlo</h2>",
    '      <ol class="steps">',
    "        " + p.steps.map((s) => "<li><span>" + s + "</span></li>").join("\n        "),
    "      </ol>",
    "    </section>",
    "",
    '    <section class="section prose">' + p.article,
    "    </section>",
    "",
    '    <section class="section faq">',
    "      <h2>Preguntas frecuentes</h2>",
    "      " + p.faqs.map(([q, a]) => "<details><summary>" + esc(q) + "</summary><p>" + esc(a) + "</p></details>").join("\n      "),
    "    </section>",
    "",
    '    <section class="section more">',
    "      <h2>Calculadoras por rubro</h2>",
    "      " + cards(),
    "    </section>",
    "    </div>"
  ].join("\n");
  return layout(p, body);
}

// ---------- Plantilla ----------
const LOGO = icon("M3 5h18v14H3z M3 12h18 M9 5v7 M15 12v7");

function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
}

function layout(p, body) {
  const url = SITE_URL ? SITE_URL + "/" + (p.file === "index.html" ? "" : p.file) : "";
  return `<!doctype html>
<html lang="es-AR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(p.title)}</title>
  <meta name="description" content="${esc(p.description)}">${url ? `
  <link rel="canonical" href="${url}">
  <meta property="og:url" content="${url}">` : ""}
  <meta property="og:type" content="website">
  <meta property="og:locale" content="es_AR">
  <meta property="og:site_name" content="${BRAND.name}">
  <meta property="og:title" content="${esc(p.title)}">
  <meta property="og:description" content="${esc(p.description)}">
  <!-- TODO: og:image (imagen de 1200×630 para cuando se comparte el link) -->
  <!-- TODO: al activar la publicidad, agregar acá el aviso de consentimiento de cookies -->
  <meta name="theme-color" content="#1a1a1a">
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap">
  <link rel="stylesheet" href="styles.css?v=${VERSION}">
  ${(p.ld || []).map(jsonLd).join("\n  ")}${p.importmap ? `\n  <script type="importmap">${JSON.stringify(p.importmap)}</script>` : ""}${(p.js || []).map((src) => `
  <script defer src="${src}?v=${VERSION}"></script>`).join("")}
</head>
<body${p.app ? ' class="app"' : ""}>
  <a class="skip-link" href="#contenido">Saltar al contenido</a>
  ${p.app ? "" : `<header class="site-header">
    <div class="container">
      <a class="logo" href="index.html">${LOGO}${BRAND.name}</a>
      <nav class="site-nav" aria-label="Principal">
        <a class="nav-link" href="${PLANNER.file}">Diseñador de planos</a>
        <a class="nav-link" href="index.html#calculadoras">Calculadoras</a>
        <a class="btn btn-sm" href="${PLANNER.file}">Empezar a dibujar</a>
      </nav>
    </div>
  </header>
  `}<main id="contenido"${p.app ? "" : ' class="container"'}>
${body}
  </main>
  <footer class="site-footer">
    <div class="container">
      <nav aria-label="Legales">
        <a href="index.html">Inicio</a>
        <a href="privacidad.html">Política de privacidad</a>
        <a href="aviso-legal.html">Aviso legal</a>
      </nav>
      <p>Los resultados son estimaciones orientativas para presupuestar y comprar materiales. No reemplazan el cálculo ni la dirección de un profesional matriculado.</p>
      <p>© 2026 ${BRAND.name}</p>
    </div>
  </footer>
</body>
</html>
`;
}

const AD = (label) => `    <!-- PEGÁ ACÁ TU CÓDIGO DE ADSENSE (${label}) -->
    <div class="ad-slot" aria-hidden="true">Publicidad</div>`;

function cards(exceptKey) {
  return `<ul class="cards">
${PAGES.filter((p) => p.key !== exceptKey).map((p) => `        <li><a class="card" href="${p.file}">${icon(p.icon)}<strong>${p.name}</strong><span>${p.card}</span></a></li>`).join("\n")}
      </ul>`;
}

function calculatorPage(p) {
  p.js = ["lib/manifest.js", "lib/calc.js", "lib/costs.js", "main.js"];
  p.ld = [
    Object.assign({
      "@context": "https://schema.org", "@type": "WebApplication", name: p.h1, description: p.description,
      applicationCategory: "UtilitiesApplication", operatingSystem: "Any", inLanguage: "es-AR",
      offers: { "@type": "Offer", price: "0", priceCurrency: "ARS" }
    }, SITE_URL ? { url: SITE_URL + "/" + p.file } : {}),
    {
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: p.faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } }))
    }
  ];
  return layout(p, `    <section class="hero">
      <p class="eyebrow">Calculadora gratis · Sin registro</p>
      <h1>${p.h1}</h1>
      <p class="lead">${p.lead}</p>
      <div class="tool-card" data-state="idle">
        <form class="tool-form" data-calc="${p.key}" novalidate>
        ${p.fields.join("\n        ")}
        </form>
        <div class="tool-result" data-result aria-live="polite">
          <noscript><p class="result-error">Esta calculadora necesita JavaScript para funcionar.</p></noscript>
        </div>
      </div>
      <p class="badge">Gratis y sin registrarte. Los datos y precios que cargás no salen de tu dispositivo.</p>
    </section>

${AD("debajo de la calculadora")}

    <section class="section">
      <h2>Cómo usarla</h2>
      <ol class="steps">
        ${p.steps.map((s) => `<li><span>${s}</span></li>`).join("\n        ")}
      </ol>
    </section>

    <section class="section prose">${p.article}
    </section>

${AD("en medio del contenido")}

    <section class="section faq">
      <h2>Preguntas frecuentes</h2>
      ${p.faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n      ")}
    </section>

    <section class="section more">
      <h2>Más calculadoras</h2>
      ${cards(p.key)}
    </section>`);
}

function homePage() {
  const p = {
    file: "index.html",
    title: "Planos y calculadoras de construcción gratis | CalcuObra",
    description: "Dibujá el plano de tu casa y obtené el cómputo de materiales al instante. Más calculadoras de ladrillos, hormigón, pintura y pisos. Gratis.",
    ld: [Object.assign({ "@context": "https://schema.org", "@type": "WebSite", name: BRAND.name, inLanguage: "es-AR" }, SITE_URL ? { url: SITE_URL + "/" } : {})]
  };
  const preview = BRAND.plan.staticSVG(BRAND.plan.sample());
  const body = [
    '    <section class="hero hero-home">',
    "      <div>",
    '        <p class="eyebrow">Gratis · En tu navegador · Sin registro</p>',
    "        <h1>Dibujá tu casa y sabé cuánto material lleva</h1>",
    '        <p class="lead">Un diseñador de planos que calcula ladrillos, cemento, contrapiso, pisos y pintura mientras dibujás. Con las medidas y los envases que se consiguen en Argentina.</p>',
    '        <div class="hero-cta">',
    '          <a class="btn btn-lg" href="' + PLANNER.file + '">Empezar a dibujar</a>',
    '          <a class="btn btn-ghost btn-lg" href="' + PLANNER.file + '#ejemplo">Abrir plano de ejemplo</a>',
    "        </div>",
    "      </div>",
    '      <a class="hero-preview" href="' + PLANNER.file + '#ejemplo" aria-label="Abrir el plano de ejemplo en el diseñador">',
    "        " + preview.svg,
    '        <span class="hero-stats">' + preview.model.main.map((m) => "<span><b>" + m.value + "</b> " + m.unit.replace("unidades", "ladrillos").replace(/^bolsas.*/, "bolsas de cemento") + "</span>").join("") + "</span>",
    "      </a>",
    "    </section>",
    "",
    '    <section class="section">',
    "      <h2>Del plano a la lista de compras</h2>",
    '      <ol class="steps">',
    "        <li><span><strong>Dibujá la planta.</strong> Pared por pared, un ambiente entero de una vez, o subiendo la foto de un boceto hecho a mano.</span></li>",
    "        <li><span><strong>Sumá puertas y ventanas.</strong> Elegilas de la biblioteca y tocá la pared donde van.</span></li>",
    "        <li><span><strong>Llevate el cómputo.</strong> Ladrillos, cemento, cal, arena, pisos y pintura, listos para mandar al corralón.</span></li>",
    "      </ol>",
    "    </section>",
    "",
    '    <section class="section" id="calculadoras">',
    "      <h2>Calculadoras de construcción</h2>",
    '      <p class="lead">Para resolver un rubro puntual sin dibujar nada: cargá las medidas y tenés el resultado al instante.</p>',
    "      " + cards(),
    "    </section>",
    "",
    AD("portada"),
    "",
    '    <section class="section prose">',
    "      <h2>Para qué sirve</h2>",
    "      <p>Comprar de menos frena la obra y obliga a pagar otro flete. Comprar de más es plata inmovilizada y material que se echa a perder. CalcuObra hace la cuenta que normalmente se hace a mano o a ojo, con las medidas y los envases que se consiguen en Argentina: bolsas de cemento y de cal de 25 kg, ladrillos comunes, huecos cerámicos y bloques.</p>",
    "      <p>Cada herramienta explica la fórmula que usa, para que puedas revisar el resultado y ajustarlo a tu obra. Los valores son orientativos y sirven para presupuestar: lo que hace a la seguridad de la estructura lo define siempre un profesional.</p>",
    "    </section>"
  ].join("\n");
  return layout(p, body);
}

function legalPage(file, title, body) {
  return layout({ file, title: title + " | " + BRAND.name, description: title + " de " + BRAND.name + "." }, `    <section class="hero prose">
      <h1>${title}</h1>
${body}
    </section>`);
}

const todo = (text) => `<span class="todo">TODO</span> ${text}`;
const ownerName = OWNER.name ? esc(OWNER.name) : todo("Nombre y apellido o razón social del responsable del sitio.");
const ownerMail = OWNER.email ? `<a href="mailto:${esc(OWNER.email)}">${esc(OWNER.email)}</a>` : todo("Correo de contacto.");

const PRIVACY = `      <p>Última actualización: ${LEGAL_DATE}.</p>
      <p>Esta política explica qué pasa con tus datos cuando usás ${BRAND.name}. La versión corta: no hay registro ni cuentas, y lo que cargás en las calculadoras y en el diseñador de planos queda en tu dispositivo.</p>
      <h2>Responsable</h2>
      <p>${ownerName}</p>
      <p>Contacto: ${ownerMail}</p>
      <h2>Lo que cargás en el sitio</h2>
      <ul>
        <li><strong>Calculadoras:</strong> las medidas que escribís se procesan en tu navegador. No se envían ni se guardan en ningún servidor.</li>
        <li><strong>Diseñador de planos:</strong> el plano se guarda automáticamente en el almacenamiento local de tu navegador, para que lo encuentres al volver. Queda en ese dispositivo y en ese navegador: nosotros no lo recibimos ni podemos verlo.</li>
        <li><strong>Fotos e imágenes:</strong> la imagen que subís para calcar y la foto de «Boceto a plano» se leen y se procesan en tu dispositivo. No se suben a ningún servidor. La imagen para calcar se guarda junto con el plano, en tu navegador.</li>
        <li><strong>Archivos exportados:</strong> los PNG, SVG, DXF, PDF y archivos de plano que descargás se generan en tu dispositivo.</li>
      </ul>
      <p>Para borrar el plano guardado, borrá los datos de este sitio desde la configuración de tu navegador.</p>
      <h2>Compartir resultados</h2>
      <p>Si tocás «Enviar por WhatsApp», se abre WhatsApp con el texto del cómputo ya escrito. El envío lo hacés vos desde tu cuenta y queda sujeto a la política de privacidad de WhatsApp. «Copiar» solo deja el texto en tu portapapeles.</p>
      <h2>Datos técnicos y servicios de terceros</h2>
      <ul>
        <li><strong>Alojamiento:</strong> como cualquier sitio web, el servidor que entrega las páginas recibe tu dirección IP, el tipo de navegador y la página pedida, y puede guardarlos en registros técnicos por seguridad y para resolver fallas.</li>
        <li><strong>Tipografías:</strong> el sitio usa una fuente servida por Google Fonts. Al cargar la página, tu navegador se conecta con los servidores de Google, que reciben tu dirección IP. Se rige por la <a href="https://policies.google.com/privacy?hl=es-419" rel="noopener">política de privacidad de Google</a>.</li>
      </ul>
      <h2>Cookies y publicidad</h2>
${OWNER.ads ? `      <p>Este sitio muestra publicidad de Google AdSense. Google y sus socios usan cookies para mostrar anuncios basados en tus visitas anteriores a este y a otros sitios web.</p>
      <ul>
        <li>Podés desactivar la publicidad personalizada desde la <a href="https://adssettings.google.com/" rel="noopener">configuración de anuncios de Google</a>.</li>
        <li>Podés desactivar las cookies de otros proveedores de publicidad personalizada en <a href="https://www.aboutads.info/choices/" rel="noopener">aboutads.info</a>.</li>
        <li>Más información sobre <a href="https://policies.google.com/technologies/partner-sites?hl=es-419" rel="noopener">cómo usa Google los datos de los sitios que utilizan sus servicios</a>.</li>
      </ul>
      <p>También podés bloquear o borrar las cookies desde la configuración de tu navegador. Las calculadoras y el diseñador siguen funcionando sin ellas.</p>` : `      <p>Hoy ${BRAND.name} no usa cookies propias, no muestra publicidad y no tiene herramientas de estadísticas de visitas.</p>
      <p>Si más adelante se incorpora publicidad o medición de visitas, esta página se va a actualizar antes de activarlas, con el detalle de los servicios, las cookies que instalan y la forma de rechazarlas.</p>`}
      <h2>Tus derechos</h2>
      <p>La Ley 25.326 de Protección de los Datos Personales te da derecho a acceder a tus datos, y a pedir que se rectifiquen, actualicen o supriman. Para ejercerlo, escribí al correo de contacto.</p>
      <p>El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto, conforme lo establecido en el artículo 14, inciso 3 de la Ley 25.326.</p>
      <p>La Agencia de Acceso a la Información Pública, en su carácter de órgano de control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.</p>
      <h2>Menores de edad</h2>
      <p>El sitio no está dirigido a menores de edad y no les pide datos personales.</p>
      <h2>Cambios en esta política</h2>
      <p>Si esta política cambia, la versión nueva se publica en esta misma página con su fecha de actualización.</p>`;

const LEGAL = `      <p>Última actualización: ${LEGAL_DATE}.</p>
      <h2>Titular del sitio</h2>
      <p>${ownerName}${OWNER.cuit ? `<br>CUIT ${esc(OWNER.cuit)}` : ""}</p>
      <p>Contacto: ${ownerMail}</p>
      <h2>Qué es ${BRAND.name}</h2>
      <p>${BRAND.name} ofrece calculadoras de materiales de construcción y un diseñador de planos con cómputo, de uso gratuito y sin registro. Usar el sitio implica aceptar estas condiciones.</p>
      <h2>Uso de las calculadoras y del cómputo</h2>
      <p>Los resultados son estimaciones orientativas, pensadas para presupuestar y comprar materiales. Dependen de las medidas reales de los materiales, de la mano de obra y de las condiciones de cada obra, y no reemplazan el cálculo, el proyecto ni la dirección de obra de un profesional matriculado.</p>
      <p>Los rendimientos, dosificaciones y porcentajes de desperdicio son valores habituales de referencia. Antes de comprar, verificalos con la ficha técnica del fabricante y con quien dirija la obra.</p>
      <h2>Verificaciones reglamentarias del diseñador</h2>
      <p>El diseñador compara el plano con algunos requisitos de los reglamentos CIRSOC 501-E y CIRSOC 101, y avisa cuando corresponde considerar el INPRES-CIRSOC 103. Son controles simplificados y automáticos: no constituyen un cálculo estructural, no cubren todos los requisitos de esos reglamentos ni las exigencias de cada municipio, y no habilitan a construir.</p>
      <p>El cómputo de la instalación eléctrica cuenta bocas y estima caños y cables. No es un proyecto eléctrico ni verifica el cumplimiento de la reglamentación de la Asociación Electrotécnica Argentina.</p>
      <p>Toda obra requiere la intervención de profesionales matriculados y los permisos que exija la autoridad local.</p>
      <h2>Responsabilidad</h2>
      <p>El sitio se ofrece tal como está, sin garantía de exactitud, de disponibilidad continua ni de aptitud para un fin determinado. En la medida en que la ley lo permita, el titular no responde por daños o gastos derivados de decisiones tomadas a partir de los resultados sin la verificación profesional correspondiente.</p>
      <p>Los planos se guardan en tu navegador y pueden perderse si borrás sus datos, cambiás de dispositivo o usás una ventana privada. Exportá el archivo del plano para conservar una copia.</p>
      <h2>Propiedad intelectual</h2>
      <p>Los textos, el diseño y el código propio de ${BRAND.name} pertenecen a su titular. Podés usar el sitio libremente para tus obras y presupuestos; no está permitido copiarlo o republicarlo como propio.</p>
      <p>Los planos que dibujás y los cómputos que obtenés son tuyos: podés usarlos, imprimirlos y compartirlos sin pedir permiso.</p>
      <p>La vista 3D usa la biblioteca three.js, distribuida bajo licencia MIT.</p>
      <h2>Enlaces y servicios de terceros</h2>
      <p>El sitio puede incluir enlaces, anuncios o servicios de terceros. El titular no controla su contenido ni responde por él.</p>
      <h2>Privacidad</h2>
      <p>El tratamiento de datos se explica en la <a href="privacidad.html">política de privacidad</a>.</p>
      <h2>Cambios y ley aplicable</h2>
      <p>Estas condiciones pueden actualizarse; la versión vigente es la publicada en esta página. Se rigen por las leyes de la República Argentina.</p>`;

if (!OWNER.name || !OWNER.email) console.log("  (faltan datos en OWNER: las páginas legales quedan con marcas TODO)");

// ---------- Escritura ----------
function write(file, content) {
  fs.writeFileSync(path.join(ROOT, file), content.replace(/\r\n/g, "\n"), "utf8");
  console.log("  " + file);
}

console.log("Generando sitio…");
write("index.html", homePage());
write(PLANNER.file, plannerPage());
PAGES.forEach((p) => write(p.file, calculatorPage(p)));
write("privacidad.html", legalPage("privacidad.html", "Política de privacidad", PRIVACY));
write("aviso-legal.html", legalPage("aviso-legal.html", "Aviso legal", LEGAL));

if (SITE_URL) {
  const files = ["", PLANNER.file, ...PAGES.map((p) => p.file)];
  write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${files.map((f) => `  <url><loc>${SITE_URL}/${f}</loc></url>`).join("\n")}
</urlset>
`);
  write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
} else {
  console.log("  (sin SITE_URL: no se generan canonical, sitemap.xml ni robots.txt)");
}
