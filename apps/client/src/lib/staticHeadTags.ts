/**
 * One `index.html` answers every address, so its `data-rh` tags are fallbacks for readers that run
 * no JavaScript (social previews). On React 19 `react-helmet-async` only appends a page's own tags
 * (`SeoHead`) and replaces nothing, so the fallbacks are removed before the app mounts: otherwise
 * every page carries two descriptions and two og:titles, the generic one first.
 */
export function removeStaticHeadTags(doc: Document = document): void {
  doc.head.querySelectorAll('[data-rh="true"]').forEach((tag) => tag.remove());
}
