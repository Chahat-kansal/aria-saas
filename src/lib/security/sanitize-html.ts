import DOMPurify from 'dompurify'

// SEC-HTML-1 — Aria's block renderers inject model-authored HTML directly into the DOM. The
// previous guard was a regex that stripped <script> tags and DOUBLE-QUOTED on* handlers only, so
// all of these passed straight through:
//   <img src=x onerror=alert(1)>        unquoted handler
//   <img src=x onerror='alert(1)'>      single-quoted handler
//   <svg onload=alert(1)>               not a <script> tag
//   <a href="javascript:alert(1)">      not an attribute it looked at
//   <iframe src=...>, <form action=...> not considered at all
//   <script  with no closing tag        the regex needs the pair
//
// Allowlist instead of blocklist: anything not named below is removed, so a tag or attribute nobody
// anticipated fails CLOSED. That is the property the old regex could never have — every blocklist is
// a list of the attacks someone already thought of.
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div', 'small', 'hr', 'a',
]
const ALLOWED_ATTR = ['style', 'class', 'colspan', 'rowspan', 'href', 'target', 'rel']

// `a`/`href` are KEPT rather than dropped. A grep of src/lib/aria found no link emission in block
// content today, but removing the capability would be a downgrade if any block type does emit one,
// and it buys nothing: DOMPurify's default URI policy already rejects javascript: and data: URLs,
// which is the actual risk. Safe schemes only, links still work.

// SEC-HTML-3 — DOMPurify does NOT parse CSS, so allowing `style` at all lets the whole attribute
// value through verbatim. Caught by this batch's own proof run, not by review:
//   <div style="background:url(javascript:alert(1))">  survived the allowlist untouched.
// Modern browsers no longer execute javascript: inside url(), and expression() died with IE, so
// this is hardening rather than a live hole — but "no current browser runs it" is not a guarantee
// worth carrying in a security boundary.
//
// Dropping `style` from the allowlist would have been the easy fix and a real downgrade: Aria's
// blocks use inline styles (the $1,234.00 highlight span among them). Instead the attribute is
// dropped ONLY when its value contains an active-content construct.
const UNSAFE_CSS = /expression\s*\(|javascript:|vbscript:|url\s*\(|@import|behaviou?r\s*:/i

let hookInstalled = false
function installStyleHook() {
  if (hookInstalled || typeof window === 'undefined' || !DOMPurify.isSupported) return
  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'style' && UNSAFE_CSS.test(data.attrValue)) {
      data.keepAttr = false
    }
  })
  hookInstalled = true
}

/**
 * Escape-everything fallback. Used when there is no DOM to parse with — see below.
 * Produces inert text, never markup, so the failure mode is "renders as plain text", not "renders
 * an attacker's tag".
 */
function escapeAll(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Sanitise model-authored HTML for injection via dangerouslySetInnerHTML.
 *
 * SSR NOTE: the three call sites are all 'use client', but Next still PRE-RENDERS client components
 * on the server, where there is no window and DOMPurify cannot parse. Rather than crash or — far
 * worse — silently return the input unchanged, we escape everything for that pass. The markup then
 * renders properly on the client after hydration, and the server-rendered HTML is inert text.
 * DOMPurify.isSupported is the library's own capability check, not a `typeof window` guess.
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return ''
  const input = String(dirty)

  if (typeof window === 'undefined' || !DOMPurify.isSupported) return escapeAll(input)

  installStyleHook()
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    // Redundant next to an allowlist, but explicit: these are the tags whose presence would be a
    // security incident, and naming them makes the intent unmissable to the next reader.
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'link', 'base'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'formaction', 'srcdoc'],
  })
}
