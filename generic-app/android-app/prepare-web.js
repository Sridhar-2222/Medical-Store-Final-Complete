// Copies the app into www/ for the Android build.
// Source: review-app/build/www (BizCore Review 2.x). Run "node scripts/build.js" in review-app first;
// this script does it for you.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const reviewApp = path.join(__dirname, '..', '..', 'review-app');
execFileSync(process.execPath, [path.join(reviewApp, 'scripts', 'build.js')], { stdio: 'inherit' });
const src = path.join(reviewApp, 'build', 'www');
const www = path.join(__dirname, 'www');
fs.rmSync(www, { recursive: true, force: true });
fs.cpSync(src, www, { recursive: true });
console.log('www/ ready (BizCore Review)');
