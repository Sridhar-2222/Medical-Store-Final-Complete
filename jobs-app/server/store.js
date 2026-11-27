// Small JSON-file store. One file, written atomically (temp file + rename).
const fs = require('fs');
const path = require('path');

const EMPTY = () => ({
  board: { name: 'Pharmacy Jobs', town: '', about: '', roles: ['Pharmacist', 'Pharmacy assistant', 'Lab technician', 'Nurse', 'Billing / store staff'] },
  users: [],        // { id, phone, pinHash, role: 'candidate'|'employer', createdAt }
  sessions: {},     // token -> userId
  resumes: {},      // userId -> resume
  firms: {},        // userId -> firm card
  jobs: [],         // { id, short, employerId, role, town, salary, details, open, createdAt }
  applications: [], // { id, code, jobId, candidateId, employerId, status, createdAt, shortlistedAt, sharedAt }
  notifications: [],// { id, userId, text, link, read, createdAt }
  files: {},        // fileId -> { owner, kind, mime, name }
  push: {},         // userId -> [subscription]
  vapid: null,
});

function createStore(dir) {
  fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
  const file = path.join(dir, 'jobs.json');
  let db = EMPTY();
  if (fs.existsSync(file)) {
    db = Object.assign(EMPTY(), JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  function save() {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  }
  return { get db() { return db; }, save, uploadsDir: path.join(dir, 'uploads') };
}

module.exports = { createStore };
