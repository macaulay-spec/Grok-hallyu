import fs from 'node:fs';
import path from 'node:path';

function patchFile(filePath, replacers) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const { from, to } of replacers) {
    if (content.includes(from)) {
      content = content.replace(from, to);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[patch-cors] Patched ${filePath}`);
  }
}

// 1. Patch @expo/cli CorsMiddleware.js
const corsMiddlewarePath = path.resolve('node_modules/@expo/cli/build/src/start/server/middleware/CorsMiddleware.js');
patchFile(corsMiddlewarePath, [
  {
    from: `            if (!isSameOrigin && !allowedHostnames.includes(hostname)) {
                next(new Error(\`Unauthorized request from \${req.headers.origin}. \` + "This may happen because of a conflicting browser extension to intercept HTTP requests. " + "Please try again without browser extensions or using incognito mode."));
                return;
            }`,
    to: `            // Allow preview origins in dev / cloud environments
            res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
            res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, DELETE, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "*");
            if (req.method === "OPTIONS") {
                res.statusCode = 204;
                res.end();
                return;
            }`,
  },
]);

// 2. Patch @react-native-community/cli-server-api securityHeadersMiddleware.js
const secHeadersPath = path.resolve('node_modules/@react-native-community/cli-server-api/build/securityHeadersMiddleware.js');
patchFile(secHeadersPath, [
  {
    from: `  if (typeof req.headers.origin === 'string' && !req.headers.origin.match(/^https?:\\/\\/localhost:/) && !req.headers.origin.startsWith('devtools://devtools')) {
    next(new Error('Unauthorized request from ' + req.headers.origin + '. This may happen because of a conflicting browser extension. Please try to disable it and try again.'));
    return;
  }`,
    to: `  if (typeof req.headers.origin === 'string') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
  }`,
  },
]);
