/* CalcuObra — catálogo de rubros con su análisis de precios, para el presupuesto de obra (lib/apu.js). Solo datos.
   Cada rubro dice qué lleva UNA unidad de trabajo: comps = [[ítem, cantidad], …]. El ítem es una clave de
   data.costs.prices (material o categoría de mano de obra, en su unidad de compra) o "r:código" (otro rubro).
   direct: rubro sin análisis; se le carga el precio de materiales y de mano de obra de una vez (subcontrato o global).

   Sin precios: los carga cada usuario (ver data.costs.prices en manifest.js).

   Fuente de cantidades y horas: los análisis de precios de la base ArqPresupuestos PRO, pasados a las unidades de compra
   del sitio (cemento y cal en bolsas de 25 kg, adhesivo en bolsas de 30 kg, placa de yeso de 2,88 m²). Cambios propios:
     · encadenados (B3 y B4): la base los da "por ml" con 300 kg de cemento, que es la dosis de 1 m³; van por m³;
     · ladrillos huecos: la base usa piezas de 18 × 25 (21 por m²); acá son de 18 × 33, como en el resto del sitio (16 por m²);
     · pared de ladrillo común de 30: el doble que la de 15;
     · pilares de luz: la mampostería, el revoque y la pintura van como rubros (C1, F1 y N1) en vez de repetir sus materiales;
     · se sacaron las líneas "desperdicios %" y "total ítem", que eran importes y no cantidades. */
(function () {
  "use strict";

  const D = window.__BRAND__.data;
  const item = function (label, unit) { return { label: label, unit: unit, price: null }; };

  // Materiales y categorías de mano de obra que se suman a los que ya usan las calculadoras.
  Object.assign(D.costs.prices, {
    oficial_esp: item("Oficial especializado", "hora"),
    medio_oficial: item("Medio oficial", "hora"),
    alambre: item("Alambre negro de atar", "kg"),
    clavos: item("Clavos punta París 2\"", "kg"),
    madera_enc: item("Madera para encofrado", "m²"),
    hidrofugo: item("Hidrófugo", "kg"),
    asfaltica: item("Pintura asfáltica", "kg"),
    autoperf: item("Tornillo autoperforante con arandela", "unidad"),
    cumbrera: item("Cumbrera de chapa galvanizada", "metro"),
    babeta: item("Chapa lisa galvanizada para babetas", "kg"),
    perfil_yeso: item("Perfiles para cielorraso de placa de yeso", "metro"),
    fijaciones: item("Tornillos y tarugos para cielorraso (por m²)", "unidad"),
    alambre16: item("Alambre n.º 16", "kg"),
    ferrite: item("Ferrite (colorante)", "kg"),
    latex_ext: item("Látex exterior", "litro"),
    fijador: item("Fijador o imprimación", "litro"),
    rodillo: item("Rodillo de lana", "unidad"),
    lija: item("Lija", "unidad"),
    esmalte: item("Esmalte sintético", "litro"),
    aguarras: item("Aguarrás", "litro"),
    antioxido: item("Antióxido", "litro"),
    fondo_madera: item("Fondo para madera", "litro"),
    barniz: item("Barniz para madera", "litro"),
    vidrio: item("Vidrio doble transparente", "m²"),
    masilla: item("Masilla", "kg"),
    gas_codo: item("Codo epoxi 1/2\" para gas", "unidad"),
    gas_llave: item("Llave de paso 3/4\" para gas", "unidad"),
    gas_cano: item("Caño epoxi 3/4\" para gas", "barra de 6,40 m"),
    brea: item("Brea en terrón", "kg"),
    lena: item("Leña", "kg"),
    alambre_galv: item("Alambre galvanizado n.º 9", "metro"),
    poste: item("Poste de eucalipto 2\" × 2\"", "metro"),
    poste_esq: item("Poste esquinero de eucalipto 4\" × 4\"", "unidad"),
    puerta_chapa: item("Puerta exterior de chapa", "unidad"),
    puerta_placa: item("Puerta placa interior", "unidad"),
    ventana_100: item("Ventana 1,00 × 1,20 de dos hojas", "unidad"),
    ventana_60: item("Ventana 0,60 × 1,20 con reja", "unidad"),
    ventiluz: item("Ventiluz 0,60 × 0,60 con reja", "unidad"),
    puerta_gas: item("Puerta de gabinete de gas 0,60 × 0,45", "unidad")
  });

  const OF = "oficial", AY = "ayudante", BAG = 25, GLUE = 30, BOARD = 2.88;
  const cem = (kg) => ["cemento", kg / BAG], cal = (kg) => ["cal", kg / BAG];
  // Hormigón armado por m³: la misma dosis en todos, cambian el hierro y las horas.
  const concrete = (of, ay, iron, wire, extra) => [[OF, of], [AY, ay], cem(300), ["piedra", 0.61], ["arena", 0.61], ["hierro", iron], ["alambre", wire]].concat(extra || []);
  const wall = (of, ay, brick, n, c, k, sand) => [[OF, of], [AY, ay], [brick, n], cem(c), cal(k), ["arena", sand]];
  const fitting = (of, ay, piece, c, k, sand) => [[OF, of], [AY, ay], [piece, 1], cem(c), cal(k), ["arena", sand]];
  const R = function (code, cat, name, unit, comps) { return { code: code, cat: cat, name: name, unit: unit, comps: comps || [], direct: !comps }; };

  D.rubros = [
    R("A1", "Movimiento de suelos", "Excavación para fundaciones", "m³", [[AY, 3.4]]),
    R("A2", "Movimiento de suelos", "Excavación para bases", "m³", [[AY, 3.4]]),

    R("B1", "Estructura", "Bases y fustes de hormigón armado", "m³", concrete(8.16, 11.3, 55, 0.29)),
    R("B2", "Estructura", "Pilotines de hormigón armado", "m³", concrete(6.15, 11.3, 45, 0.45)),
    R("B3", "Estructura", "Encadenado de fundación", "m³", concrete(11.16, 8, 52, 0.25)),
    R("B4", "Estructura", "Encadenado superior", "m³", concrete(25, 12.56, 50, 0.4, [["clavos", 1], ["madera_enc", 2.5]])),
    R("B5", "Estructura", "Refuerzo de antepecho en mampostería", "m", [[OF, 0.1], [AY, 0.1], cem(3.5), ["arena", 0.06], ["hierro", 2.24]]),
    R("B6", "Estructura", "Pilar de luz simple", "unidad", [[OF, 1.64], [AY, 1.71], ["r:C1", 3], ["r:F1", 3.24], ["r:N1", 3.24], cem(32.5), ["piedra", 0.06], ["arena", 0.06], ["hierro", 7.9], ["alambre", 0.2]]),
    R("B7", "Estructura", "Pilar de luz doble", "unidad", [[OF, 2.94], [AY, 3.08], ["r:C1", 3.3], ["r:F1", 3.61], ["r:N1", 3.61], cem(55.3), ["piedra", 0.11], ["arena", 0.11], ["hierro", 8.4], ["alambre", 0.2]]),

    R("C1", "Mamposterías", "Pared de ladrillo común de 15", "m²", wall(0.85, 0.55, "lad_comun", 62, 4.2, 7.05, 0.05)),
    R("C2", "Mamposterías", "Pared de ladrillo común de 30", "m²", wall(1.7, 1.1, "lad_comun", 124, 8.4, 14.1, 0.1)),
    R("C3", "Mamposterías", "Pared de ladrillo hueco de 8", "m²", wall(0.45, 0.52, "lad_hueco8", 16, 1.8, 1.5, 0.01)),
    R("C4", "Mamposterías", "Pared de ladrillo hueco de 12", "m²", wall(0.45, 0.5, "lad_hueco12", 16, 1.8, 1.6, 0.01)),
    R("C5", "Mamposterías", "Pared de ladrillo hueco de 18", "m²", wall(0.55, 0.72, "lad_hueco18", 16, 2.7, 2.4, 0.02)),

    R("D1", "Capa aisladora", "Capa aisladora horizontal y vertical", "m²", [[OF, 0.4], [AY, 0.15], cem(11), ["hidrofugo", 0.26], ["arena", 0.03], ["asfaltica", 0.45]]),

    R("E1", "Cubierta", "Techo de chapa ondulada sobre correas", "m²", [[OF, 0.6], [AY, 0.95], ["correa", 1.05], ["chapa", 1.1], ["autoperf", 5]]),
    R("E2", "Cubierta", "Cumbrera de chapa", "m", [[OF, 0.2], [AY, 0.2], ["cumbrera", 1]]),
    R("E3", "Cubierta", "Babetas de chapa", "m", [[OF, 1], ["babeta", 1.98]]),

    R("F1", "Revoques", "Revoque exterior grueso con azotado hidrófugo", "m²", [[OF, 0.7], [AY, 0.5], cem(3.3), cal(2.1), ["arena", 0.02], ["hidrofugo", 0.2]]),
    R("F2", "Revoques", "Azotado interior bajo revestimiento", "m²", [[OF, 0.6], [AY, 0.45], cem(3.3), cal(2.1), ["arena", 0.02], ["hidrofugo", 0.2]]),
    R("F3", "Revoques", "Revoque interior grueso a la cal", "m²", [[OF, 0.55], [AY, 0.4], cem(1.7), cal(2.1), ["arena", 0.01]]),

    R("G1", "Cielorrasos", "Cielorraso de placa de yeso con lana de vidrio", "m²", [[OF, 0.8], [AY, 0.7], ["placa_yeso", 1.05 / BOARD], ["perfil_yeso", 2], ["fijaciones", 1], ["alambre16", 0.05], ["aislacion", 1.1]]),

    R("H1", "Contrapisos", "Contrapiso sobre terreno de 12 cm", "m²", [[OF, 0.36], [AY, 0.48], cem(5.4), ["arena", 0.05], cal(9.36), ["cascote", 0.08]]),

    R("I1", "Pisos", "Piso cerámico", "m²", [[OF, 1], [AY, 0.65], ["ceramico", 1.05], ["pastina", 0.2], ["adhesivo", 2.28 / GLUE]]),
    R("I2", "Pisos", "Carpeta de cemento con hidrófugo", "m²", [[OF, 0.8], [AY, 0.6], cem(15), ["hidrofugo", 0.26], ["ferrite", 0.1], ["arena", 0.03]]),
    R("I3", "Pisos", "Carpeta de cemento rodillado", "m²", [[OF, 0.6], [AY, 0.3], cem(15), ["arena", 0.03]]),

    R("J1", "Zócalos", "Zócalo de cemento alisado", "m", [[OF, 0.25], [AY, 0.1], cem(0.77), ["arena", 0.01]]),
    R("J2", "Zócalos", "Zócalo cerámico", "m", [[OF, 0.2], [AY, 0.17], ["zocalo", 1], ["adhesivo", 2.3 / GLUE], ["pastina", 0.08]]),

    R("K1", "Revestimientos", "Revestimiento cerámico con adhesivo", "m²", [[OF, 1], [AY, 0.7], ["ceramico", 1.05], ["pastina", 0.5], ["adhesivo", 2.3 / GLUE]]),

    R("L1", "Carpinterías", "Colocación de puerta exterior de chapa", "unidad", fitting(2, 2, "puerta_chapa", 6, 6, 0.03)),
    R("L2", "Carpinterías", "Colocación de puerta placa interior", "unidad", fitting(2, 2, "puerta_placa", 6, 6, 0.03)),
    R("L3", "Carpinterías", "Colocación de ventana 1,00 × 1,20", "unidad", fitting(2, 2, "ventana_100", 6, 6, 0.03)),
    R("L4", "Carpinterías", "Colocación de ventana 0,60 × 1,20 con reja", "unidad", fitting(2, 1.5, "ventana_60", 5, 5, 0.02)),
    R("L5", "Carpinterías", "Colocación de ventiluz 0,60 × 0,60", "unidad", fitting(0.8, 0.45, "ventiluz", 1, 1.3, 0.01)),
    R("L6", "Carpinterías", "Colocación de puerta de gabinete de gas", "unidad", fitting(1, 1, "puerta_gas", 3, 3, 0.01)),

    R("M1", "Vidrios", "Vidrio doble transparente colocado", "m²", [[OF, 0.6], [AY, 0.4], ["vidrio", 1.03], ["masilla", 0.09]]),

    R("N1", "Pinturas", "Látex exterior", "m²", [[OF, 0.3], [AY, 0.15], ["latex_ext", 0.3], ["fijador", 0.1], ["rodillo", 0.02], ["lija", 0.2]]),
    R("N2", "Pinturas", "Látex interior en paredes y cielorrasos", "m²", [[OF, 0.3], [AY, 0.15], ["pintura", 0.3], ["rodillo", 0.02], ["fijador", 0.2], ["lija", 0.2]]),
    R("N3", "Pinturas", "Esmalte sintético con antióxido sobre metal", "m²", [[OF, 0.4], ["esmalte", 0.2], ["aguarras", 0.3], ["antioxido", 0.11], ["lija", 0.3]]),
    R("N4", "Pinturas", "Esmalte sintético con fondo sobre madera", "m²", [[OF, 0.4], ["esmalte", 0.28], ["aguarras", 0.14], ["fondo_madera", 0.08], ["lija", 0.06]]),
    R("N5", "Pinturas", "Barniz sobre madera", "m²", [[OF, 0.4], ["barniz", 0.4], ["aguarras", 0.3], ["lija", 0.2]]),

    R("O1", "Instalación de gas", "Instalación de gas para tubo de 10 kg", "unidad", [[OF, 12], [AY, 6], ["gas_codo", 4], ["gas_llave", 1], ["gas_cano", 2.5]]),

    R("P1", "Obras exteriores", "Vereda de cemento rodillado", "m²", [[OF, 0.9], [AY, 0.7], cem(19.5), cal(7.8), ["arena", 0.07], ["cascote", 0.08]]),
    R("P2", "Obras exteriores", "Junta de dilatación", "m", [[AY, 0.25], ["brea", 0.3], ["lena", 0.7]]),
    R("P3", "Obras exteriores", "Cordón de ladrillo común de canto", "m", [[OF, 0.3], [AY, 0.25], cem(0.43), cal(0.41), ["arena", 0.01], ["lad_comun", 9]]),
    R("P4", "Obras exteriores", "Cerco perimetral de dos hilos de alambre", "m", [[OF, 0.2], [AY, 0.2], ["alambre_galv", 1.1], ["brea", 0.03], ["poste", 0.48], ["poste_esq", 0.2], ["asfaltica", 0.05]]),

    R("Q1", "Instalación sanitaria", "Desagües primarios y secundarios", "global"),
    R("Q2", "Instalación sanitaria", "Instalación de agua fría y caliente", "global"),
    R("Q3", "Instalación sanitaria", "Tanque de reserva", "global"),
    R("Q4", "Instalación sanitaria", "Artefactos y accesorios", "global"),
    R("Q5", "Instalación sanitaria", "Griferías", "global"),
    R("R1", "Instalación eléctrica", "Instalación eléctrica", "global")
  ];
})();
