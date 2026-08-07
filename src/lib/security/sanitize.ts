/**
 * @fileoverview XSS Protection — HTML Sanitization & Output Encoding
 *
 * Prevents Cross-Site Scripting by sanitizing all user-generated content
 * before rendering. This is the BACKEND defense layer; React's default
 * escaping is the frontend defense.
 *
 * COVERAGE:
 *   - User profiles (name, bio, store name)
 *   - Chat messages
 *   - Product descriptions
 *   - Reviews
 *   - AI-generated output
 *   - Any user-submitted text field
 *
 * STRATEGY:
 *   1. Allowlist-based HTML sanitization (strip everything not explicitly allowed)
 *   2. Output encoding for different contexts (HTML, attribute, URL, JS)
 *   3. DOMPurify-style tag stripping for server-side rendering
 *
 * OWASP: A03:2021 — Injection
 * OWASP: A07:2021 — Identification and Authentication Failures
 */

// ============================================================
// HTML SANITIZATION — DOMPurify (primary) + regex fallback
// ============================================================

import DOMPurify from 'isomorphic-dompurify';

/**
 * DOMPurify configuration for the default safe allowlist.
 */
const DOMPURIFY_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'code', 'pre', 'span', 'sub', 'sup'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'applet', 'form', 'input', 'style', 'svg', 'math'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
};

/**
 * Dangerous HTML tags that must ALWAYS be stripped.
 * These can execute JavaScript or load external resources.
 * (Used as fallback when DOMPurify is unavailable)
 */
const DANGEROUS_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'applet', 'form',
  'input', 'textarea', 'select', 'button', 'link', 'style',
  'meta', 'base', 'noscript', 'template', 'svg', 'math',
  'xmp', 'plaintext', 'listing',
]);

/**
 * Dangerous HTML attributes that can execute JavaScript.
 */
const DANGEROUS_ATTRS = new Set([
  'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
  'onmousemove', 'onmouseout', 'onkeydown', 'onkeypress', 'onkeyup',
  'onload', 'onerror', 'onabort', 'onblur', 'onchange', 'onfocus',
  'onreset', 'onsubmit', 'onunload', 'onresize', 'onscroll',
  'oncontextmenu', 'oninput', 'oninvalid', 'ondrag', 'ondragend',
  'ondragenter', 'ondragleave', 'ondragover', 'ondragstart', 'ondrop',
  'oncopy', 'oncut', 'onpaste', 'onanimationend', 'onanimationiteration',
  'onanimationstart', 'ontransitionend', 'onwheel', 'onpointerdown',
  'onpointerup', 'onpointermove', 'onpointerover', 'onpointerout',
  'onpointerenter', 'onpointerleave', 'onpointercancel', 'ongotpointercapture',
  'onlostpointercapture', 'ontouchstart', 'ontouchend', 'ontouchmove',
  'ontouchcancel', 'onbeforeunload', 'onhashchange', 'onmessage',
  'onoffline', 'ononline', 'onpagehide', 'onpageshow', 'onpopstate',
  'onstorage', 'onbeforeprint', 'onafterprint',
]);

/**
 * Dangerous URL schemes that can execute JavaScript.
 */
const DANGEROUS_URL_SCHEMES = new Set([
  'javascript', 'vbscript', 'data', 'mhtml',
]);

/**
 * Safe HTML tags that are allowed in rich text.
 * Only these tags will be preserved during sanitization.
 */
const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'p', 'br', 'hr',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'code', 'a', 'span', 'div',
]);

/**
 * Safe HTML attributes that are allowed.
 */
const ALLOWED_ATTRS = new Set([
  'href', 'target', 'rel', 'class', 'id', 'title', 'alt',
  'colspan', 'rowspan', 'align', 'valign',
]);

/**
 * Sanitize HTML content, removing all dangerous tags and attributes.
 * This is the PRIMARY sanitization function for user-generated content.
 *
 * @param input - Raw HTML string from user input
 * @param options - Sanitization options
 * @returns Sanitized HTML string safe for rendering
 */
export function sanitizeHTML(
  input: string,
  options: {
    /** Allow specific safe tags (default: basic formatting) */
    allowedTags?: Set<string>;
    /** Allow specific safe attributes (default: href, target, rel) */
    allowedAttrs?: Set<string>;
    /** Maximum length (default: 10000) */
    maxLength?: number;
  } = {}
): string {
  if (!input || typeof input !== 'string') return '';

  const maxLen = options.maxLength ?? 10000;
  const trimmedInput = input.length > maxLen ? input.substring(0, maxLen) : input;

  // PRIMARY: Use DOMPurify for robust XSS protection
  // DOMPurify handles all known XSS bypass vectors including malformed HTML,
  // mXSS, DOM clobbering, and namespace attacks that regex cannot catch.
  try {
    const config = { ...DOMPURIFY_CONFIG };
    if (options.allowedTags) {
      config.ALLOWED_TAGS = Array.from(options.allowedTags);
    }
    if (options.allowedAttrs) {
      config.ALLOWED_ATTR = Array.from(options.allowedAttrs);
    }
    return DOMPurify.sanitize(trimmedInput, config).trim();
  } catch {
    // FALLBACK: If DOMPurify fails (should never happen), use regex sanitizer
    // This is less robust but prevents a total sanitization failure
  }

  // Regex-based fallback (see original implementation below)
  let sanitized = trimmedInput;

  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Remove dangerous tags and their content
  for (const tag of DANGEROUS_TAGS) {
    // Remove opening tags with attributes
    const openRegex = new RegExp(`<${tag}[^>]*>`, 'gi');
    sanitized = sanitized.replace(openRegex, '');
    // Remove closing tags
    const closeRegex = new RegExp(`</${tag}>`, 'gi');
    sanitized = sanitized.replace(closeRegex, '');
  }

  // Remove all event handler attributes
  for (const attr of DANGEROUS_ATTRS) {
    const attrRegex = new RegExp(`\\s${attr}\\s*=\\s*["'][^"']*["']`, 'gi');
    sanitized = sanitized.replace(attrRegex, '');
    // Also handle unquoted attribute values
    const unquotedRegex = new RegExp(`\\s${attr}\\s*=\\s*[^\\s>]+`, 'gi');
    sanitized = sanitized.replace(unquotedRegex, '');
  }

  // Remove style attributes (can contain CSS-based attacks)
  sanitized = sanitized.replace(/\sstyle\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\sstyle\s*=\s*[^\s>]+/gi, '');

  // Sanitize href attributes (remove javascript: URLs)
  sanitized = sanitized.replace(
    /href\s*=\s*["']([^"']*)["']/gi,
    (match, url: string) => {
      const trimmedUrl = url.trim().toLowerCase();
      const isDangerous = Array.from(DANGEROUS_URL_SCHEMES).some(
        scheme => trimmedUrl.startsWith(`${scheme}:`)
      );
      if (isDangerous) return '';
      return match;
    }
  );

  // Remove disallowed tags (replace with their content)
  sanitized = sanitized.replace(/<(\w+)([^>]*)>/gi, (match, tagName: string, attrs: string) => {
    const tag = tagName.toLowerCase().replace('/', '');

    // Allow closing tags for allowed tags
    if (match.startsWith('</')) {
      return allowedTags.has(tag) ? match : '';
    }

    // Remove disallowed opening tags
    if (!allowedTags.has(tag)) {
      return '';
    }

    // Filter attributes on allowed tags
    const filteredAttrs = filterAttributes(attrs, allowedAttrs);
    return filteredAttrs ? `<${tag} ${filteredAttrs}>` : `<${tag}>`;
  });

  // Add rel="noopener noreferrer" to all links
  sanitized = sanitized.replace(
    /<a\s/gi,
    '<a rel="noopener noreferrer" '
  );

  return sanitized.trim();
}

/**
 * Filter attributes on an HTML tag, keeping only allowed ones.
 */
function filterAttributes(attrs: string, allowedAttrs: Set<string>): string {
  const attrRegex = /(\w+)\s*=\s*["']([^"']*)["']/gi;
  const kept: string[] = [];

  let match;
  while ((match = attrRegex.exec(attrs)) !== null) {
    const [, name, value] = match;
    if (name && allowedAttrs.has(name.toLowerCase())) {
      // Sanitize attribute value
      const safeValue = encodeAttributeValue(value!);
      kept.push(`${name}="${safeValue}"`);
    }
  }

  return kept.join(' ');
}

// ============================================================
// OUTPUT ENCODING
// ============================================================

/**
 * Encode a string for safe insertion into HTML text content.
 * Prevents XSS by escaping HTML special characters.
 */
export function encodeHTML(input: string): string {
  if (!input || typeof input !== 'string') return '';

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Encode a string for safe insertion into an HTML attribute value.
 */
export function encodeAttributeValue(input: string): string {
  if (!input || typeof input !== 'string') return '';

  return input
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Encode a string for safe insertion into a URL.
 * Validates that the URL is not a dangerous scheme.
 */
export function sanitizeURL(input: string): string {
  if (!input || typeof input !== 'string') return '';

  const trimmed = input.trim().toLowerCase();

  // Block dangerous URL schemes
  for (const scheme of DANGEROUS_URL_SCHEMES) {
    if (trimmed.startsWith(`${scheme}:`)) {
      return '';
    }
  }

  // Validate URL format
  try {
    const url = new URL(input);
    // Only allow http: and https: schemes
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }
    return url.href;
  } catch {
    // Not a valid URL — return empty
    return '';
  }
}

/**
 * Encode a string for safe insertion into JavaScript.
 * Use when embedding dynamic data in script tags.
 */
export function encodeJavaScript(input: string): string {
  if (!input || typeof input !== 'string') return '';

  return input
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/</g, '\\x3c')
    .replace(/>/g, '\\x3e')
    .replace(/\/script/gi, '\\/script')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// ============================================================
// FIELD-LEVEL SANITIZERS
// ============================================================

/**
 * Sanitize a plain text field (no HTML allowed).
 * Use for: names, titles, addresses, etc.
 */
export function sanitizePlainText(input: string, maxLength: number = 200): string {
  if (!input || typeof input !== 'string') return '';

  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
    .replace(/<[^>]*>/g, '') // Strip all HTML tags
    .trim()
    .substring(0, maxLength);
}

/**
 * Sanitize a rich text field (limited HTML allowed).
 * Use for: product descriptions, chat messages, reviews.
 */
export function sanitizeRichText(input: string, maxLength: number = 10000): string {
  return sanitizeHTML(input, { maxLength });
}

/**
 * Sanitize a chat message.
 * Strip all HTML — chat messages are plain text only.
 */
export function sanitizeChatMessage(input: string, maxLength: number = 2000): string {
  return sanitizePlainText(input, maxLength);
}

/**
 * Sanitize AI-generated output before rendering.
 * AI output is UNTRUSTED — it may contain prompt injection payloads
 * that try to render as HTML or JavaScript.
 */
export function sanitizeAIOutput(input: string, maxLength: number = 10000): string {
  // First, strip all HTML
  const stripped = sanitizePlainText(input, maxLength);

  // Then, encode any remaining special characters
  return encodeHTML(stripped);
}

/**
 * Sanitize a user profile name.
 * Only alphanumeric, spaces, and common punctuation allowed.
 */
export function sanitizeProfileName(input: string, maxLength: number = 100): string {
  if (!input || typeof input !== 'string') return '';

  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\s\-'.]/g, '') // Only alphanumeric, spaces, hyphens, apostrophes, periods
    .trim()
    .substring(0, maxLength);
}

/**
 * Sanitize a product description.
 * Allow basic formatting but strip dangerous content.
 */
export function sanitizeProductDescription(input: string, maxLength: number = 5000): string {
  return sanitizeHTML(input, {
    maxLength,
    allowedTags: new Set([
      'b', 'strong', 'i', 'em', 'u', 's', 'p', 'br', 'hr',
      'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'a', 'span',
    ]),
    allowedAttrs: new Set(['href', 'target', 'rel', 'class']),
  });
}

/**
 * Sanitize a search query.
 * Remove all special characters except basic search operators.
 */
export function sanitizeSearchQuery(input: string, maxLength: number = 200): string {
  if (!input || typeof input !== 'string') return '';

  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[;'"\\]/g, '') // Remove SQL injection characters
    .trim()
    .substring(0, maxLength);
}
