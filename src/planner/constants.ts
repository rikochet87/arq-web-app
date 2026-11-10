/* Constantes del diseñador de planos: claves de almacenamiento, grilla, capas, plantillas de vista, colores,
   textos de ayuda de cada herramienta y atajos de teclado. */
export const STORE = "calcuobra.plano.v1";
export const HANDOFF = "calcuobra.importado"; // plano que manda la portada (cad.js) al abrir el diseñador con #importado
export const SHELF = "calcuobra.biblioteca.v1"; // "Mis muebles": queda en el navegador, aparte del plano, y sirve para todos los planos
export const SHELF_MAX = 40;
export const GRID = 10; // cm
export const UNTITLED = "Plano sin título";
export const STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]; // cm, para reglas y escala gráfica
export const LAYERS: Record<string, boolean> = { names: true, areas: true, dims: true, tags: true, grid: true, items: true, electric: true, below: true, roof: false, notes: true };
/* Plantillas de vista (como las de Revit): qué capas se ven y en qué fase, de un toque. Ponen también
   la plantilla de las láminas con el mismo nombre, para que la documentación salga igual. */
export const VIEW_TEMPLATES: Record<string, { layers: Record<string, boolean>; phaseView: string }> = {
  municipal: { layers: { names: true, areas: true, dims: true, tags: false, items: false, electric: false, notes: false, grid: false }, phaseView: "municipal" },
  obra: { layers: { names: true, areas: true, dims: true, tags: true, items: false, electric: true, notes: true, grid: true }, phaseView: "obra" },
  cliente: { layers: { names: true, areas: true, dims: false, tags: false, items: true, electric: false, notes: false, grid: false }, phaseView: "obra" }
};
export const OPTIONS = "ABCDEF";   // variantes del plano: "Opción A", "Opción B"…
export const COLOR_NAMES: Record<string, string> = { "": "Sin color", "#e5484d": "Rojo", "#f08c00": "Naranja", "#2fa84f": "Verde", "#12a5a5": "Turquesa", "#3b82f6": "Azul", "#9b59d0": "Violeta", "#a0785a": "Madera" };
export const HINTS: Record<string, string> = {
  select: "Tocá un muro para cambiarle el ladrillo o el largo. Arrastrá un recuadro para elegir varios; con Shift sumás a la selección y Ctrl+A los toma todos. Para desplazarte usá la Mano (H) o mantené apretada la barra espaciadora.",
  multi: "Tocá cada muro que quieras sumar o quitar, o arrastrá un recuadro para sumar varios. Para desplazarte usá la Mano. Tocá otra vez «Elegir varios» para terminar.",
  pan: "Arrastrá para desplazarte por el plano. Con la rueda del mouse acercás y alejás. Desde cualquier herramienta, la barra espaciadora hace lo mismo.",
  wall: "Elegí abajo el ladrillo de los muros nuevos. Tocá donde empieza la pared y donde termina, o escribí el largo en metros y apretá Enter. Esc corta la cadena.",
  room: "Tocá una esquina del ambiente y después la esquina opuesta.",
  opening: "Tocá una pared para colocar la abertura elegida. Esc para dejar de colocar.",
  item: "Tocá el plano para colocar el objeto elegido. Después lo podés mover, girar y cambiar de medida.",
  measure: "Tocá dos puntos para medir la distancia entre ellos.",
  arc: "Pared curva: tocá el inicio, después el final y por último un punto por donde pasa la curva.",
  surface: "Tocá una esquina de la superficie exterior y después la esquina opuesta. Después elegís si es patio, vereda, galería o balcón.",
  wire: "Tocá una boca eléctrica y después otra para unirlas con un cable. Seguí tocando para encadenar.",
  section: "Tocá dos puntos para trazar la línea de corte. El corte aparece en el panel de la derecha.",
  pen: "Dibujá a mano alzada arrastrando sobre el plano. Elegí color y grosor en la barra de arriba. Las anotaciones no entran en el cómputo.",
  line: "Arrastrá para trazar una línea. Con Shift queda horizontal, vertical o a 45°.",
  arrow: "Arrastrá desde donde nace la flecha hasta lo que querés señalar. Con Shift queda horizontal, vertical o a 45°.",
  rect: "Arrastrá de una esquina a la opuesta. Con Shift sale un cuadrado.",
  ellipse: "Arrastrá de una esquina a la opuesta del recuadro que encierra la elipse. Con Shift sale un círculo.",
  cloud: "Arrastrá un recuadro alrededor de lo que hay que revisar: queda marcado con una nube de revisión.",
  text: "Tocá donde va la nota y escribí el texto en la barra de arriba."
};
export const KEYS: Record<string, [string] | [string, string]> = { v: ["select"], h: ["pan"], w: ["wall"], r: ["room"], d: ["opening", "p80"], n: ["opening", "v120"], p: ["opening", "vano"], m: ["measure"], a: ["arc"], f: ["surface"], k: ["wire"], s: ["section"], b: ["pen"], l: ["line"], t: ["text"] };
