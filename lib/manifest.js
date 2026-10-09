/* CalcuObra — datos de marca y tablas de materiales.
   Todo lo que es "dato de obra" vive acá, separado de las fórmulas (lib/calc.js).
   Los valores son orientativos: salen del método de los coeficientes de aporte
   y de rendimientos típicos de fabricantes. Conviene que los revise alguien del
   rubro antes de darlos por definitivos. */
(function () {
  "use strict";

  window.__BRAND__ = {
    name: "CalcuObra",
    tagline: "Calculadoras de construcción gratis",

    data: {
      // aporte:  fracción del volumen aparente que realmente ocupa lugar en la mezcla.
      // density: kg por m³ aparente (solo ligantes, que se compran por peso).
      // bag:     kg de la bolsa (desde julio de 2025 el cemento se vende en bolsas de 25 kg como máximo).
      materials: {
        cemento: { label: "Cemento", aporte: 0.47, density: 1400, bag: 25 },
        cal: { label: "Cal hidratada", aporte: 0.45, density: 650, bag: 25 },
        arena: { label: "Arena", aporte: 0.63 },
        piedra: { label: "Piedra partida", aporte: 0.51 },
        cascote: { label: "Cascote", aporte: 0.6 }
      },

      // parts: proporción en volumen. water: agua como fracción del volumen aparente.
      mixes: {
        h133: { label: "1:3:3 — uso general (cemento : arena : piedra)", water: 0.09, parts: { cemento: 1, arena: 3, piedra: 3 } },
        h123: { label: "1:2:3 — más cemento (cemento : arena : piedra)", water: 0.09, parts: { cemento: 1, arena: 2, piedra: 3 } },
        h135: { label: "1:3:5 — hormigón pobre (cemento : arena : piedra)", water: 0.09, parts: { cemento: 1, arena: 3, piedra: 5 } },
        // Morteros de asiento del CIRSOC 501-E, Tabla 5.2 (cemento : cal : arena).
        mE: { label: "Tipo E — 1:¼:3, resistencia elevada", water: 0.15, parts: { cemento: 1, cal: 0.25, arena: 3 } },
        mI: { label: "Tipo I — 1:½:4, resistencia intermedia", water: 0.15, parts: { cemento: 1, cal: 0.5, arena: 4 } },
        mN: { label: "Tipo N — 1:1:6, resistencia normal", water: 0.15, parts: { cemento: 1, cal: 1, arena: 6 } },
        // Mezcla de cal reforzada: se usa para revoques. No es un mortero de asiento admitido en muros portantes.
        mcal: { label: "1/4:1:3 — cal reforzada, para revoques (cemento : cal : arena)", water: 0.15, parts: { cemento: 0.25, cal: 1, arena: 3 } },
        m13: { label: "1:3 — cementicio (cemento : arena)", water: 0.15, parts: { cemento: 1, arena: 3 } },
        ccas: { label: "1/8:1:4:8 — de cascotes (cemento : cal : arena : cascote)", water: 0.1, parts: { cemento: 0.125, cal: 1, arena: 4, cascote: 8 } }
      },

      // l × h: cara vista del ladrillo en cm. e: espesor de pared en cm. j: junta habitual en cm.
      // kind: macizo, hueco (bloque cerámico portante), bloque (de hormigón) o cerramiento (hueco no portante). Ver cirsoc.minThick.
      bricks: {
        comun15: { label: "Ladrillo común — pared de 15", l: 24, h: 5, e: 11.5, j: 1.5, kind: "macizo" },
        comun30: { label: "Ladrillo común — pared de 30", l: 11.5, h: 5, e: 24, j: 1.5, kind: "macizo" },
        portante12: { label: "Bloque cerámico portante 12×19×33", l: 33, h: 19, e: 12, j: 1.2, kind: "hueco" },
        portante18: { label: "Bloque cerámico portante 18×19×33", l: 33, h: 19, e: 18, j: 1.2, kind: "hueco" },
        hueco8: { label: "Hueco cerámico no portante 8×18×33", l: 33, h: 18, e: 8, j: 1.5, kind: "cerramiento" },
        hueco12: { label: "Hueco cerámico no portante 12×18×33", l: 33, h: 18, e: 12, j: 1.5, kind: "cerramiento" },
        hueco18: { label: "Hueco cerámico no portante 18×18×33", l: 33, h: 18, e: 18, j: 1.5, kind: "cerramiento" },
        bloque13: { label: "Bloque de hormigón 13×19×39", l: 39, h: 19, e: 13, j: 1, kind: "bloque" },
        bloque19: { label: "Bloque de hormigón 19×19×39", l: 39, h: 19, e: 19, j: 1, kind: "bloque" }
      },

      /* Valores de los reglamentos CIRSOC que usa lib/cirsoc.js. Fuente: textos publicados por el INTI.
         CIRSOC 501-E — Reglamento empírico para construcciones de mampostería de bajo compromiso estructural:
           maxHeight / maxStoreys: art. 1.2.4 · minThick (mm, por tipo de mampuesto): arts. 5.1.1 y 7.2.2
           table71: Tabla 7.1 — espesor máximo del rango (mm), altura máxima de planta (m), distancia máxima entre
                    soportes verticales (m) y si el espesor se admite debajo de otra planta
           minLength: art. 6.3 (fracción de la longitud de la planta) · minWall: art. 6.8.2 (cm)
           maxOpening / minPier: art. 8.4 (cm) · lintelSeat: art. 8.3 (cm)
           mortars: Tabla 5.2 (proporciones) y Tabla 6.3 (tensión admisible, MPa)
           ties: art. 8.1 — altura mínima 12 cm; acá se adopta 15. Barras Ø 6 según espesor, estribos Ø 4,2 cada 20 cm,
                 empalme de 40 cm. width, mix y los kg por metro de barra NO salen del reglamento.
         INPRES-CIRSOC 103 Parte III, art. 3.4.2 — seismic: espesor mínimo de muros resistentes (mm).
         CIRSOC 101-2005 — live: sobrecarga de vivienda (Tabla 4.1, kN/m²) · weights: Tabla 3.1, en kN/m³
           (mampostería con revoque, contrapiso de cal y cascote, mortero y enlucido de cemento y cal) y kN/m² (baldosa).
           roofs.dead suma el material de cubierta de la Tabla 3.1 con supuestos propios (ver abajo).
         Supuestos propios, que NO salen de un reglamento y debe confirmar el profesional:
           slab: peso de la losa de entrepiso (kN/m²) · plaster: espesor de revoque sumado al muro (m)
           ceiling: espesor del cielorraso aplicado (m) · estructura de techo de 0,15 kN/m² dentro de roofs.dead. */
      cirsoc: {
        maxHeight: 10, maxStoreys: 3,
        minThick: { macizo: 110, hueco: 120, bloque: 120 },
        table71: [
          { max: 169, storey: 2.8, support: 4.0, multi: false },
          { max: 240, storey: 3.0, support: 4.5, multi: true },
          { max: 300, storey: 3.5, support: 6.0, multi: true }
        ],
        minLength: 0.6, minWall: 50, maxOpening: 180, minPier: 60, lintelSeat: 20,
        mortars: {
          mE: { type: "E", ratio: "1:¼:3", stress: 0.4 },
          mI: { type: "I", ratio: "1:½:4", stress: 0.4 },
          mN: { type: "N", ratio: "1:1:6", stress: 0.3 }
        },
        ties: { height: 15, width: 15, thinMax: 169, barsThin: 3, barsThick: 4, stirrupGap: 20, splice: 40, mix: "h133", kg6: 0.222, kg42: 0.109 },
        seismic: { thick: 180, thin: 120 },
        live: 2,
        weights: { masonry: { macizo: 17, hueco: 12, cerramiento: 10.5, bloque: 17 }, screedBase: 16, mortar: 19, plaster: 19, tile: 0.28 },
        slab: 3, plaster: 0.03, ceiling: 0.015,
        roofs: {
          losa: { dead: 3 + 18 * 0.08 + 0.1 + 19 * 0.015 },  // losa + contrapiso de pendiente de 8 cm + membrana + cielorraso aplicado
          chapa: { dead: 0.07 + 0.15 + 0.2 },                 // chapa de acero de 0,7 mm + estructura + cielorraso de yeso
          tejas: { dead: 0.65 + 0.15 + 0.2 }                  // teja francesa sobre entablonado + estructura + cielorraso de yeso
        }
      },

      // door / window: m² que se descuentan por cada abertura estándar.
      paint: { door: 1.6, window: 1.5 },

      // adhesive: kg por m² según el diente de la llana (mm). groutDensity: kg por litro de pastina.
      tile: { adhesiveBag: 30, adhesive: { 6: 3, 8: 4, 10: 5, 12: 6.5 }, groutDensity: 1.8 },

      /* Costo estimado de las calculadoras (lib/costs.js).
         prices: precios de referencia en pesos, por la unidad en que se compra. Salen de la base de
           ArqPresupuestos PRO, revisada: se tomó la serie de precios más reciente de esa base y se pasó
           a nuestras unidades (cemento de 50 kg → bolsa de 25 kg, látex de 20 L → litro, etc.).
           price: null = la base no tiene ese material; el usuario carga el suyo.
           Cada usuario puede cambiar cualquier precio desde la calculadora y queda guardado en su navegador.
         hours: horas de [oficial, ayudante] por unidad de trabajo, del análisis de precios de la misma base
           (mampostería 3.1 a 3.4, contrapiso 8.1, carpeta 9.3, piso cerámico 9.1, látex interior 14.2).
           Supuestos propios: la pared de 30 lleva el doble que la de 15; los bloques portantes y de hormigón
           toman las horas del hueco de espesor parecido; la pintura está dada a dos manos y se ajusta en
           proporción a las manos; el cielorraso suma 0,10 h de oficial por m² (indicación del mismo análisis). */
      costs: {
        date: "octubre de 2026",
        prices: {
          cemento: { label: "Cemento", unit: "bolsa de 25 kg", price: 6468.45 },
          cal: { label: "Cal hidratada", unit: "bolsa de 25 kg", price: 9476.3 },
          arena: { label: "Arena", unit: "m³", price: 37303.12 },
          piedra: { label: "Piedra partida", unit: "m³", price: 45320 },
          cascote: { label: "Cascote", unit: "m³", price: 9000 },
          lad_comun: { label: "Ladrillo común", unit: "unidad", price: 153.92 },
          lad_hueco8: { label: "Hueco cerámico 8×18×33", unit: "unidad", price: 665.65 },
          lad_hueco12: { label: "Hueco cerámico 12×18×33", unit: "unidad", price: null },
          lad_hueco18: { label: "Hueco cerámico 18×18×33", unit: "unidad", price: null },
          lad_portante12: { label: "Bloque portante 12×19×33", unit: "unidad", price: 1296.47 },
          lad_portante18: { label: "Bloque portante 18×19×33", unit: "unidad", price: 1563.09 },
          lad_bloque13: { label: "Bloque de hormigón 13×19×39", unit: "unidad", price: null },
          lad_bloque19: { label: "Bloque de hormigón 19×19×39", unit: "unidad", price: 1221.51 },
          lad_propio: { label: "Ladrillo de medida propia", unit: "unidad", price: null },
          ceramico: { label: "Cerámico o porcelanato", unit: "m²", price: 15383.63 },
          adhesivo: { label: "Adhesivo", unit: "bolsa de 30 kg", price: 5366.1 },
          pastina: { label: "Pastina", unit: "kg", price: 3800.76 },
          pintura: { label: "Látex interior", unit: "litro", price: 10280.37 },
          // Del presupuesto del diseñador de planos (misma base). null = sin precio de referencia.
          porcelanato: { label: "Porcelanato", unit: "m²", price: 55594.58 },
          flotante: { label: "Piso flotante 8 mm", unit: "m²", price: 38524.19 },
          zocalo: { label: "Zócalo", unit: "metro", price: null },
          fino_bolsa: { label: "Revoque fino en bolsa", unit: "bolsa de 25 kg", price: null },
          hierro: { label: "Hierro ADN-420", unit: "kg", price: 1380 },
          chapa: { label: "Chapa galvanizada ondulada n.º 25", unit: "m²", price: 11800 },
          correa: { label: "Correa C de chapa", unit: "metro", price: 14333.33 },
          aislacion: { label: "Lana de vidrio 50 mm con aluminio", unit: "m²", price: 1810 },
          membrana: { label: "Membrana asfáltica 4 mm con aluminio", unit: "rollo de 10 m²", price: 98889.28 },
          teja: { label: "Teja francesa", unit: "unidad", price: null },
          placa_yeso: { label: "Placa de yeso 1,20 × 2,40", unit: "placa", price: 18046.42 },
          cable: { label: "Cable unipolar 1,5 mm²", unit: "metro", price: 710.48 },
          cano: { label: "Caño corrugado", unit: "metro", price: null },
          demolicion: { label: "Demolición de mampostería (mano de obra)", unit: "m²", price: null },
          contenedor: { label: "Contenedor de 5 m³", unit: "unidad", price: null },
          oficial: { label: "Oficial", unit: "hora", price: 13122.59 },
          ayudante: { label: "Ayudante", unit: "hora", price: 11161.67 }
        },
        hours: {
          wall: {
            comun15: { price: "lad_comun", h: [0.85, 0.55] },
            comun30: { price: "lad_comun", h: [1.7, 1.1] },
            hueco8: { price: "lad_hueco8", h: [0.45, 0.52] },
            hueco12: { price: "lad_hueco12", h: [0.45, 0.5] },
            hueco18: { price: "lad_hueco18", h: [0.55, 0.72] },
            portante12: { price: "lad_portante12", h: [0.45, 0.5] },
            portante18: { price: "lad_portante18", h: [0.55, 0.72] },
            bloque13: { price: "lad_bloque13", h: [0.45, 0.5] },
            bloque19: { price: "lad_bloque19", h: [0.55, 0.72] }
          },
          slab: [0.36, 0.48], screed: [0.6, 0.3], floor: [1, 0.65], paint: [0.3, 0.15], ceiling: [0.1, 0],
          // Presupuesto del diseñador (análisis 6.1, 6.3, 5.1, 7.1, 10.2, 12.1, 12.5 y 12.6 de la misma base), por m², m o unidad.
          plasterExt: [0.7, 0.5], plasterInt: [0.55, 0.4], roofSheet: [0.6, 0.95], board: [0.8, 0.7], skirting: [0.2, 0.17],
          door: [2, 2], window: [2, 1.5], smallWindow: [0.8, 0.45]
        }
      },

      // Biblioteca de aberturas del diseñador de planos. w × h en cm.
      // symbol: cómo se dibuja en planta (swing, double, sliding, garage, open, window, fixed).
      // sill: altura del antepecho en cm (las puertas van a piso).
      openings: {
        p70: { group: "door", label: "Puerta 70", w: 70, h: 200, symbol: "swing" },
        p80: { group: "door", label: "Puerta 80", w: 80, h: 200, symbol: "swing" },
        p90: { group: "door", label: "Puerta de entrada", w: 90, h: 200, symbol: "swing" },
        pdoble: { group: "door", label: "Puerta doble", w: 140, h: 200, symbol: "double" },
        pcorr: { group: "door", label: "Puerta corrediza", w: 80, h: 200, symbol: "sliding" },
        pbalcon: { group: "door", label: "Puerta balcón", w: 200, h: 200, symbol: "sliding" },
        porton: { group: "door", label: "Portón de garage", w: 240, h: 210, symbol: "garage" },
        vano: { group: "door", label: "Vano sin puerta", w: 90, h: 200, symbol: "open" },
        vlux: { group: "window", label: "Ventiluz", w: 60, h: 40, sill: 170, symbol: "window" },
        v100: { group: "window", label: "Ventana 100", w: 100, h: 110, sill: 90, symbol: "window" },
        v120: { group: "window", label: "Ventana 120", w: 120, h: 110, sill: 90, symbol: "window" },
        v150: { group: "window", label: "Ventana 150", w: 150, h: 110, sill: 90, symbol: "window" },
        v180: { group: "window", label: "Ventana 180", w: 180, h: 110, sill: 90, symbol: "window" },
        vfijo: { group: "window", label: "Paño fijo", w: 100, h: 150, sill: 60, symbol: "fixed" }
      },
      openingGroups: { door: "Puertas", window: "Ventanas" },
      roomTypes: ["Living", "Comedor", "Living comedor", "Cocina", "Dormitorio", "Baño", "Lavadero", "Pasillo", "Garage", "Galería", "Estudio"],

      /* Muebles, artefactos y bocas eléctricas del diseñador. w × d en cm (ancho × fondo), medidas habituales en Argentina.
         draw: primitivas en coordenadas 0–1 del rectángulo del objeto:
               ["r", x, y, ancho, alto] rectángulo · ["e", cx, cy, rx, ry] elipse · ["l", x1, y1, x2, y2] línea.
         bill: rubro del cómputo donde se cuenta. Los muebles no llevan bill: no son materiales de obra.
         tall: altura en cm para la vista 3D (75 si no se indica).
         mount: altura de montaje de la boca en cm, para estimar la bajada del caño desde el techo. */
      items: {
        propio: { group: "propios", label: "Mueble a medida", w: 100, d: 60, tall: 75, custom: true }, // nombre, medidas y forma los pone cada uno
        sofa3: { group: "living", label: "Sofá 3 cuerpos", w: 200, d: 90, draw: [["r", 0, 0, 1, 1], ["r", 0, 0, 1, 0.25], ["r", 0, 0.25, 0.1, 0.75], ["r", 0.9, 0.25, 0.1, 0.75], ["l", 0.37, 0.25, 0.37, 1], ["l", 0.63, 0.25, 0.63, 1]] },
        sofa2: { group: "living", label: "Sofá 2 cuerpos", w: 150, d: 90, draw: [["r", 0, 0, 1, 1], ["r", 0, 0, 1, 0.25], ["r", 0, 0.25, 0.12, 0.75], ["r", 0.88, 0.25, 0.12, 0.75], ["l", 0.5, 0.25, 0.5, 1]] },
        sillon: { group: "living", label: "Sillón", w: 85, d: 85, draw: [["r", 0, 0, 1, 1], ["r", 0, 0, 1, 0.25], ["r", 0, 0.25, 0.16, 0.75], ["r", 0.84, 0.25, 0.16, 0.75]] },
        ratona: { group: "living", label: "Mesa ratona", w: 100, d: 60, tall: 40 },
        rack: { group: "living", label: "Rack de TV", w: 150, d: 45, draw: [["r", 0, 0, 1, 1], ["l", 0.1, 0.5, 0.9, 0.5]] },
        mesa6: { group: "living", label: "Mesa para 6", w: 180, d: 170, draw: [["r", 0.06, 0.24, 0.88, 0.52], ["r", 0.12, 0.05, 0.16, 0.16], ["r", 0.42, 0.05, 0.16, 0.16], ["r", 0.72, 0.05, 0.16, 0.16], ["r", 0.12, 0.79, 0.16, 0.16], ["r", 0.42, 0.79, 0.16, 0.16], ["r", 0.72, 0.79, 0.16, 0.16]] },
        mesa4: { group: "living", label: "Mesa para 4", w: 130, d: 150, draw: [["r", 0.08, 0.25, 0.84, 0.5], ["r", 0.18, 0.04, 0.2, 0.18], ["r", 0.62, 0.04, 0.2, 0.18], ["r", 0.18, 0.78, 0.2, 0.18], ["r", 0.62, 0.78, 0.2, 0.18]] },

        cama2: { group: "dormitorio", label: "Cama 2 plazas", w: 140, d: 190, tall: 50, draw: [["r", 0, 0, 1, 1], ["r", 0.08, 0.04, 0.38, 0.14], ["r", 0.54, 0.04, 0.38, 0.14], ["l", 0, 0.26, 1, 0.26]] },
        camaQueen: { group: "dormitorio", label: "Cama queen", w: 160, d: 200, tall: 50, draw: [["r", 0, 0, 1, 1], ["r", 0.08, 0.04, 0.38, 0.14], ["r", 0.54, 0.04, 0.38, 0.14], ["l", 0, 0.26, 1, 0.26]] },
        cama1: { group: "dormitorio", label: "Cama 1 plaza", w: 80, d: 190, tall: 50, draw: [["r", 0, 0, 1, 1], ["r", 0.15, 0.04, 0.7, 0.14], ["l", 0, 0.26, 1, 0.26]] },
        mesaLuz: { group: "dormitorio", label: "Mesa de luz", w: 45, d: 40 },
        placard: { group: "dormitorio", label: "Placard", w: 180, d: 60, tall: 240, draw: [["r", 0, 0, 1, 1], ["l", 0, 0, 1, 1], ["l", 0, 1, 1, 0]] },
        escritorio: { group: "dormitorio", label: "Escritorio", w: 120, d: 60 },

        mesada: { group: "cocina", label: "Mesada con pileta", w: 180, d: 60, tall: 90, bill: "Artefactos", draw: [["r", 0, 0, 1, 1], ["r", 0.1, 0.2, 0.3, 0.6], ["e", 0.25, 0.5, 0.03, 0.08]] },
        cocina: { group: "cocina", label: "Cocina 4 hornallas", w: 56, d: 60, tall: 90, bill: "Artefactos", draw: [["r", 0, 0, 1, 1], ["e", 0.28, 0.3, 0.13, 0.12], ["e", 0.72, 0.3, 0.13, 0.12], ["e", 0.28, 0.7, 0.13, 0.12], ["e", 0.72, 0.7, 0.13, 0.12]] },
        heladera: { group: "cocina", label: "Heladera", w: 70, d: 70, tall: 180, draw: [["r", 0, 0, 1, 1], ["l", 0, 0.85, 1, 0.85]] },
        bajoMesada: { group: "cocina", label: "Bajo mesada", w: 120, d: 60, tall: 90 },
        lavarropas: { group: "cocina", label: "Lavarropas", w: 60, d: 60, tall: 85, draw: [["r", 0, 0, 1, 1], ["e", 0.5, 0.5, 0.3, 0.3]] },
        piletaLavar: { group: "cocina", label: "Pileta de lavar", w: 60, d: 50, bill: "Artefactos", draw: [["r", 0, 0, 1, 1], ["r", 0.12, 0.15, 0.76, 0.7]] },
        termotanque: { group: "cocina", label: "Termotanque", w: 45, d: 45, tall: 150, bill: "Artefactos", draw: [["e", 0.5, 0.5, 0.5, 0.5], ["e", 0.5, 0.5, 0.2, 0.2]] },

        inodoro: { group: "bano", label: "Inodoro", w: 38, d: 65, tall: 40, bill: "Artefactos", draw: [["r", 0.05, 0, 0.9, 0.28], ["e", 0.5, 0.63, 0.42, 0.36]] },
        bidet: { group: "bano", label: "Bidet", w: 37, d: 57, tall: 40, bill: "Artefactos", draw: [["e", 0.5, 0.5, 0.48, 0.5], ["e", 0.5, 0.3, 0.08, 0.05]] },
        lavatorio: { group: "bano", label: "Lavatorio", w: 55, d: 45, bill: "Artefactos", draw: [["r", 0, 0, 1, 1], ["e", 0.5, 0.55, 0.32, 0.3]] },
        vanitory: { group: "bano", label: "Vanitory", w: 80, d: 45, bill: "Artefactos", draw: [["r", 0, 0, 1, 1], ["e", 0.5, 0.55, 0.25, 0.3]] },
        banera: { group: "bano", label: "Bañera", w: 150, d: 70, tall: 50, bill: "Artefactos", draw: [["r", 0, 0, 1, 1], ["r", 0.05, 0.1, 0.9, 0.8], ["e", 0.88, 0.5, 0.03, 0.06]] },
        ducha: { group: "bano", label: "Receptáculo de ducha", w: 80, d: 80, tall: 8, bill: "Artefactos", draw: [["r", 0, 0, 1, 1], ["l", 0, 0, 1, 1], ["l", 0, 1, 1, 0], ["e", 0.5, 0.5, 0.08, 0.08]] },

        escalera: { group: "exterior", label: "Escalera recta", w: 90, d: 270, tall: 130, shape: "stair" },
        parrilla: { group: "exterior", label: "Parrilla", w: 120, d: 70, draw: [["r", 0, 0, 1, 1], ["r", 0.1, 0.15, 0.8, 0.7], ["l", 0.3, 0.15, 0.3, 0.85], ["l", 0.5, 0.15, 0.5, 0.85], ["l", 0.7, 0.15, 0.7, 0.85]] },
        auto: { group: "exterior", label: "Auto", w: 180, d: 450, tall: 150, draw: [["r", 0, 0, 1, 1], ["r", 0.1, 0.2, 0.8, 0.18], ["r", 0.1, 0.7, 0.8, 0.14]] },
        arbol: { group: "exterior", label: "Árbol", w: 200, d: 200, tall: 350, draw: [["e", 0.5, 0.5, 0.5, 0.5], ["e", 0.5, 0.5, 0.06, 0.06]] },
        pileta: { group: "exterior", label: "Pileta", w: 300, d: 600, tall: 5, draw: [["r", 0, 0, 1, 1], ["r", 0.05, 0.03, 0.9, 0.94]] },

        toma: { group: "electricidad", label: "Tomacorriente", w: 24, d: 24, mount: 30, bill: "Instalación eléctrica", draw: [["e", 0.5, 0.5, 0.5, 0.5], ["l", 0.5, 0, 0.5, 1]] },
        llave: { group: "electricidad", label: "Llave de luz", w: 24, d: 24, mount: 110, bill: "Instalación eléctrica", draw: [["e", 0.5, 0.5, 0.28, 0.28], ["l", 0.7, 0.3, 1, 0]] },
        bocaTecho: { group: "electricidad", label: "Boca de techo", w: 24, d: 24, mount: 1000, bill: "Instalación eléctrica", draw: [["e", 0.5, 0.5, 0.5, 0.5], ["l", 0.15, 0.15, 0.85, 0.85], ["l", 0.15, 0.85, 0.85, 0.15]] },
        aplique: { group: "electricidad", label: "Boca de pared", w: 24, d: 24, mount: 200, bill: "Instalación eléctrica", draw: [["e", 0.5, 0.5, 0.5, 0.5], ["l", 0, 0.5, 1, 0.5]] },
        tomaAire: { group: "electricidad", label: "Toma para aire", w: 24, d: 24, mount: 220, bill: "Instalación eléctrica", draw: [["e", 0.5, 0.5, 0.5, 0.5], ["l", 0.5, 0, 0.5, 1], ["l", 0, 0.5, 1, 0.5]] },
        tablero: { group: "electricidad", label: "Tablero eléctrico", w: 40, d: 12, mount: 150, bill: "Instalación eléctrica", draw: [["r", 0, 0, 1, 1], ["l", 0, 0, 1, 1]] }
      },
      itemGroups: { propios: "Mis muebles", living: "Living y comedor", dormitorio: "Dormitorio", cocina: "Cocina y lavadero", bano: "Baño", exterior: "Exterior y escalera", electricidad: "Electricidad" },

      // Pisos por ambiente. waste: % de desperdicio. adhesive: kg de adhesivo por m².
      floors: {
        ceramico: { label: "Cerámico", waste: 10, adhesive: 4 },
        porcelanato: { label: "Porcelanato", waste: 10, adhesive: 6 },
        flotante: { label: "Piso flotante", waste: 7 },
        alisado: { label: "Cemento alisado" },
        sin: { label: "Sin piso" }
      },

      // Superficies exteriores. slab: cm de contrapiso. tiled: lleva piso.
      surfaces: {
        patio: { label: "Patio", slab: 8, tiled: true },
        vereda: { label: "Vereda", slab: 8, tiled: true },
        galeria: { label: "Galería", slab: 10, tiled: true },
        balcon: { label: "Balcón o terraza", tiled: true },
        cochera: { label: "Entrada de auto", slab: 12 },
        cesped: { label: "Césped" }
      },

      // Cubiertas. slope: pendiente habitual en %.
      roofs: {
        none: { label: "No calcular" },
        losa: { label: "Losa con membrana", slope: 2 },
        chapa: { label: "Chapa galvanizada", slope: 10 },
        tejas: { label: "Tejas francesas", slope: 35 }
      },

      /* Terminaciones, con los formatos que se venden en Argentina.
         coarse / splash: espesor en cm del revoque grueso y del azotado hidrófugo.
         fine: kg por m² de revoque fino en bolsa. board: m² de una placa de yeso de 1,20 × 2,40 m.
         upperSlab: cm de contrapiso sobre la losa en plantas altas. storeyGap: cm de entrepiso entre plantas (vista 3D).
         debrisSwell: esponjamiento del escombro de demolición. container: m³ de un contenedor (volquete).
         membrane: m² de un rollo de membrana asfáltica. eave: alero en cm. sheetWidth: ancho útil de la chapa en cm. */
      /* Tipos de muro (como los "tipos" de Revit): un núcleo de ladrillo más las capas de terminación de cada cara.
         Cada plano copia esta lista y la puede editar: cambiar un tipo cambia todos los muros que lo usan.
         ext: cara que da afuera en un muro exterior. int: cara que da a un ambiente.
         azotado y grueso: espesor en cm (0 = no lleva). fino: true si lleva revoque fino (espesor en finishes.fineThick). */
      wallTypes: [
        { id: "ext-portante18", name: "Exterior · bloque portante 18", brick: "portante18", ext: { azotado: 0.5, grueso: 1.5, fino: true }, int: { azotado: 0, grueso: 1.5, fino: true } },
        { id: "ext-comun30", name: "Exterior · ladrillo común 30", brick: "comun30", ext: { azotado: 0.5, grueso: 1.5, fino: true }, int: { azotado: 0, grueso: 1.5, fino: true } },
        { id: "ext-visto30", name: "Exterior · ladrillo común 30 visto", brick: "comun30", ext: { azotado: 0, grueso: 0, fino: false }, int: { azotado: 0, grueso: 1.5, fino: true } },
        { id: "ext-bloque19", name: "Exterior · bloque de hormigón 19", brick: "bloque19", ext: { azotado: 0.5, grueso: 1.5, fino: true }, int: { azotado: 0, grueso: 1.5, fino: true } },
        { id: "int-hueco8", name: "Interior · hueco 8", brick: "hueco8", ext: { azotado: 0.5, grueso: 1.5, fino: true }, int: { azotado: 0, grueso: 1.5, fino: true } },
        { id: "int-hueco12", name: "Interior · hueco 12", brick: "hueco12", ext: { azotado: 0.5, grueso: 1.5, fino: true }, int: { azotado: 0, grueso: 1.5, fino: true } },
        { id: "int-comun15", name: "Interior · ladrillo común 15", brick: "comun15", ext: { azotado: 0.5, grueso: 1.5, fino: true }, int: { azotado: 0, grueso: 1.5, fino: true } }
      ],

      finishes: { fineThick: 0.3, debrisSwell: 1.3, container: 5, upperSlab: 5, storeyGap: 20, coarse: 1.5, splash: 0.5, fine: 3, fineBag: 25, board: 2.88, membrane: 10, tilesPerM2: 15, screwsPerM2: 6, eave: 40, sheetWidth: 100 },

      // Regla de Blondel: 2 contrahuellas + 1 huella, en cm.
      stairs: { blondel: 63, blondelMin: 60, blondelMax: 64, maxRiser: 18, minTread: 26 }
    }
  };
})();
