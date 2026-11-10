/* Descarga de archivos del diseñador (SVG, PNG, DXF, JSON, CSV) y nombre del archivo a partir del nombre del plano. */

export function download(name: string, blob: Blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 4000);
}

/** "Casa de Pedro" → "casa-de-pedro.ext"; sin nombre, "plano.ext". */
export const fileName = (planName: string | undefined, ext: string) =>
  ((planName || "plano").toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, "-").replace(/^-|-$/g, "") || "plano") + "." + ext;
