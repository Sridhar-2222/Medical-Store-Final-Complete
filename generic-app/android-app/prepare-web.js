// Copies the web app (../public + ../core) into www/ for the Android build.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const www = path.join(__dirname, 'www');
fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(path.join(www, 'core'), { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'public'))) {
  if (f === 'head.html') continue;
  fs.copyFileSync(path.join(root, 'public', f), path.join(www, f));
}
for (const f of fs.readdirSync(path.join(root, 'core'))) fs.copyFileSync(path.join(root, 'core', f), path.join(www, 'core', f));
console.log('www/ ready');
