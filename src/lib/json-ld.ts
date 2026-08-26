// Phase 3H.2B — safe JSON-LD serialization. Every public page embeds
// structured data inside a <script type="application/ld+json"> element
// built from owner-editable database content (profile name, business name,
// bio-derived description, phone, email, address, service/package names
// and descriptions, review text, FAQ text, ...). Plain JSON.stringify()
// does NOT escape a literal "</script>" sequence, so a value containing
// "</script><script>...</script>" text can terminate the JSON-LD script
// element early and inject an executable sibling <script> tag into the
// page — a stored-XSS vector through any editable profile/service/review
// field, not just the profile fields the scanner happened to name.
//
// The ONE shared helper every JSON-LD injection point in this app must go
// through — see the security regression check in Phase 3H.2B's report for
// the full audit of every call site.
//
// Escapes exactly the characters meaningful to an HTML parser scanning for
// "</script>" (<, >, &) plus the two Unicode line-terminator characters
// JS/JSON-embedding contexts are conventionally hardened against (LINE
// SEPARATOR U+2028, PARAGRAPH SEPARATOR U+2029) — built via String.fromCharCode
// rather than typed directly in this file, since those two code points are
// themselves valid ECMAScript LineTerminator characters and must never
// appear as raw bytes in source. Never HTML-entity-escaped ("&lt;"/"&gt;"),
// since the script's content must remain syntactically valid JSON text for
// search engines to parse it as structured data — "<" inside a JSON string
// decodes back to the literal "<" character, so the structured data's
// actual values are completely unchanged; only the serialized bytes that
// would otherwise look like an HTML tag boundary are altered.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .split("<")
    .join("\\u003c")
    .split(">")
    .join("\\u003e")
    .split("&")
    .join("\\u0026")
    .split(LINE_SEPARATOR)
    .join("\\u2028")
    .split(PARAGRAPH_SEPARATOR)
    .join("\\u2029");
}
