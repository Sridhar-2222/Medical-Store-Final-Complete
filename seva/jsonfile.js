// Tiny JSON-file collection used when Supabase is not set up yet.
const fs = require('fs');
const path = require('path');

function jsonFile(file) {
  return {
    read() {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
    },
    write(rows) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(rows, null, 2));
      fs.renameSync(tmp, file);
    },
  };
}

module.exports = { jsonFile };
