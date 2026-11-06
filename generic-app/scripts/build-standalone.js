#!/usr/bin/env node
/*
 * Builds single-file versions of the app that need no server at all:
 *   dist/bizcore-standalone.html  open from disk, email it, put it on any static host / USB stick
 *   dist/bizcore-embed.html       same app without <html>/<head> wrapper (for hosts that add their own)
 * Data is kept in the browser (localStorage); use Backup & data to move it.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const js = ['core/industries.js', 'core/engine.js', 'core/ai.js', 'public/app.js']
  .map((f) => '/* ---- ' + f + ' ---- */\n' + read(f).replace(/<\/script/gi, '<\\/script')).join('\n');
const head = read('public/head.html').trim();
const css = read('public/app.css');
const body = '<style>\n' + css + '\n</style>\n<div id="app"><p style="padding:24px">Loading BizCore…</p></div>\n<script>\n' + js + '\n</script>\n';
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/bizcore-embed.html'), head + '\n' + body);
fs.writeFileSync(path.join(root, 'dist/bizcore-standalone.html'),
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + head + '\n</head>\n<body>\n' + body + '</body>\n</html>\n');
console.log('Built dist/bizcore-standalone.html and dist/bizcore-embed.html');
