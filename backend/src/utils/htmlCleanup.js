import { createHash } from 'crypto';
import * as cheerio from 'cheerio';

const NOISY_TAGS = [
  'script','style','noscript','iframe','canvas','template','svg',
  'link','meta','source','track','picture','video','audio'
];

const NOISY_SELECTORS = [
  // Page furniture / popups / ads (tune as needed)
  'nav','header','footer',
  '[id*="cookie"]','[class*="cookie"]','[id*="consent"]','[class*="consent"]',
  '[id*="banner"]','[class*="banner"]',
  '[id*="modal"]','[class*="modal"]',
  '[id*="popup"]','[class*="popup"]',
  '[class*="ad-"]','[id*="ad"]','[class*="advert"]','[class*="ads"]'
];

const STRIP_ATTRS = [
  'id','class','style','onclick','onload','onerror','nonce',
  'integrity','crossorigin'
];

function normalizeText(s) {
  return s
    .replace(/\u00A0/g, ' ')              // nbsp -> space
    .replace(/\s+/g, ' ')                 // collapse whitespace
    .replace(/^\s+|\s+$/g, '');           // trim
}

// Optional: normalize obvious timestamps (very opinionated; keep off by default)
function stripObviousDates(s) {
  // Replace common date patterns with a placeholder (ISO, Month name, etc.)
  return s
    // ISO-like dates
    .replace(/\b\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?\b/g, 'DATE')
    // Month day, year
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.? \d{1,2}, \d{4}\b/gi, 'DATE')
    // Year in footers © 2025
    .replace(/©?\s?\b(19|20)\d{2}\b/g, 'YEAR');
}

export function canonicalizeHtmlForHash(rawHtml, { removeDates = false } = {}) {
  const $ = cheerio.load(rawHtml, {
    decodeEntities: true,
    lowerCaseTags: true,
    lowerCaseAttributeNames: true,
    recognizeSelfClosing: true,
    xmlMode: false
  });

  // Remove comments
  $('*')
    .contents()
    .filter((_, el) => el.type === 'comment')
    .remove();

  // Remove noisy tags
  for (const tag of NOISY_TAGS) $(tag).remove();
  // Remove JSON-LD and other data scripts specifically
  $('script[type*="json"]').remove();

  // Remove noisy selectors
  for (const sel of NOISY_SELECTORS) $(sel).remove();

  // Strip unstable attributes
  $('*').each((_, el) => {
    for (const attr of STRIP_ATTRS) $(el).removeAttr(attr);
    // Drop all data-* and aria-* attributes
    Object.keys(el.attribs || {}).forEach((name) => {
      if (name.startsWith('data-') || name.startsWith('aria-')) {
        $(el).removeAttr(name);
      }
    });
  });

  // Get body text only (skip <head>)
  let text = $('body').text() || '';

  text = normalizeText(text);
  if (removeDates) text = stripObviousDates(text);

  return text;
}

export function stableContentHash(rawHtml, opts) {
  const canonical = canonicalizeHtmlForHash(rawHtml, opts);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}