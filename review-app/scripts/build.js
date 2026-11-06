#!/usr/bin/env node
// Assembles the app:
//   build/www/                 the app (used by the Android project and for web hosting)
//   build/bizcore-review.html  everything in one file (no offline photo reading; opens anywhere)
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'build');
const www = path.join(out, 'www');
const CORE = ['industries.js', 'review.js', 'accounts.js', 'base.js', 'ocr-parse.js', 'ai.js'];
const UI = ['ui.js', 'files.js', 'screens-accounts.js', 'screens-people.js', 'screens-staff.js'];
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(www, 'core'), { recursive: true });
fs.cpSync(path.join(root, 'web'), www, { recursive: true });
CORE.forEach((f) => fs.copyFileSync(path.join(root, 'core', f), path.join(www, 'core', f)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const js = CORE.map((f) => 'core/' + f).concat(UI.map((f) => 'web/' + f)).map((f) => '/* ' + f + ' */\n' + read(f).replace(/<\/script/gi, '<\\/script')).join('\n');
const single = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>Fingertrip.biz AI</title>\n<style>\n' +
  read('web/app.css') + '\n</style>\n</head>\n<body>\n<div id="app"></div>\n<script>\n' + js + '\nApp.start();\n</script>\n</body>\n</html>\n';
fs.writeFileSync(path.join(out, 'bizcore-review.html'), single);
// Same app without the <html>/<head> wrapper, for hosts that add their own (e.g. a claude.ai page)
fs.writeFileSync(path.join(out, 'bizcore-review-embed.html'), single.replace(/^[\s\S]*?<title>/, '<title>').replace(/<\/head>\n<body>\n/, '').replace(/<\/body>\n<\/html>\n$/, ''));
console.log('Built build/www and build/bizcore-review.html');
