// Copies the Fingertip Hotel web app (../web) into www/ for the Android build.
'use strict';
const fs = require('fs');
const path = require('path');
const www = path.join(__dirname, 'www');
fs.rmSync(www, { recursive: true, force: true });
fs.cpSync(path.join(__dirname, '..', 'web'), www, { recursive: true });
console.log('www/ ready (Fingertip Hotel)');
