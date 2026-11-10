/* Atajos de DOM del diseñador. */

export const $ = <T extends Element = HTMLElement>(sel: string, scope?: ParentNode | null): T | null => (scope || document).querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, scope?: ParentNode | null): T[] => Array.from((scope || document).querySelectorAll<T>(sel));

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escHTML = (s: unknown): string => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESCAPES[c]);
