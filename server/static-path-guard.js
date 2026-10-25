'use strict';
const path = require('node:path');

/** Return true for direct, URL-encoded or traversal-like requests into server/. */
function isBlockedServerStaticPath(rawPath) {
  let decoded = String(rawPath || '/');
  try {
    for (let i = 0; i < 5; i += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    // Malformed escapes should not fall through to a static file server.
    return true;
  }
  const normalized = path.posix.normalize(decoded.replaceAll('\\', '/'));
  return /^\/server(?:\/|$)/i.test(normalized);
}

module.exports = { isBlockedServerStaticPath };
