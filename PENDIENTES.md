# Pendientes

## Render con IA (opción C)

Idea para más adelante, como función opcional y paga (con créditos), al estilo de mnml.ai o Veras.

- **Cómo sería:** se toma la imagen del render actual y un mapa de profundidad de la misma vista, y se los manda a un modelo de imagen por API. El modelo devuelve una foto realista que respeta la geometría.
- **Modelos posibles:**
  - con control de profundidad, como los de Replicate para remodelar interiores;
  - de edición de imagen, como FLUX Kontext, Nano Banana o Qwen Image Edit.
- **Costo y tiempo de referencia (octubre 2026):** entre 0,02 y 0,08 USD por imagen, y entre 15 y 20 segundos cada una.
- **Qué hace falta:**
  - Una función en Vercel que guarde la clave de la API: nunca va en el navegador.
  - Límites de uso o créditos por usuario, para controlar el gasto.
  - Que sea opcional y avisado. La imagen sale del dispositivo, y hoy la página dice que los archivos no se suben a ningún lado.
  - Atar la geometría (profundidad, bordes y poca libertad) para que la IA no mueva ventanas ni cambie proporciones.

## Render: siguientes pasos posibles

- Botón "Render final" con path tracing en el navegador (three-gpu-pathtracer, MIT). Hay que confirmar que es compatible con three.js r185.
- Panorama 360° exportado desde la vista 3D, con un visor web (Photo Sphere Viewer o Marzipano).
- Luces interiores para renders al atardecer y de noche.
