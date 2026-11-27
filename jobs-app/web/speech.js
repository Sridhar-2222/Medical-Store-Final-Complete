// Voice filling: turn one spoken sentence into resume or job fields.
// Works in the browser (window.JobSpeech) and in Node tests (module.exports).
(function (root) {
  const QUALS = [
    [/\bpharm\.?\s?d\b/i, 'Pharm.D'], [/\bm\.?\s?pharm(acy)?\b/i, 'M.Pharm'], [/\bb\.?\s?pharm(acy)?\b/i, 'B.Pharm'],
    [/\bd\.?\s?pharm(acy)?\b/i, 'D.Pharm'], [/\bdmlt\b/i, 'DMLT'], [/\bbmlt\b/i, 'BMLT'], [/\bb\.?\s?sc\.?\s?nursing\b/i, 'B.Sc Nursing'],
    [/\bgnm\b/i, 'GNM'], [/\banm\b/i, 'ANM'], [/\bm\.?\s?sc\b/i, 'M.Sc'], [/\bb\.?\s?sc\b/i, 'B.Sc'], [/\bb\.?\s?com\b/i, 'B.Com'],
    [/\b(degree|graduate)\b/i, 'Degree'], [/\b(inter|intermediate|12th)\b/i, 'Intermediate'], [/\b(ssc|10th|tenth)\b/i, 'SSC'],
  ];
  const LANGS = ['Telugu', 'Hindi', 'English', 'Urdu', 'Tamil', 'Kannada', 'Marathi', 'Malayalam', 'Odia', 'Bengali'];
  const STOP = new Set(['a', 'an', 'the', 'my', 'and', 'with', 'for', 'of', 'pharmacy', 'hospital', 'clinic', 'lab', 'medical', 'store',
    'experience', 'years', 'year', 'salary', 'job', 'need', 'needed', 'wanted', 'required', 'month', 'per']);
  const NUMWORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    fifteen: 15, twenty: 20, thirty: 30 };

  const title = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  const words2num = (t) => t.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty)\b/gi,
    (w) => String(NUMWORDS[w.toLowerCase()]));

  function findRole(text, roles) {
    const t = text.toLowerCase();
    // Longest role name first so "Pharmacy assistant" wins over "Pharmacist"-like overlaps.
    const sorted = [...(roles || [])].sort((a, b) => b.length - a.length);
    for (const r of sorted) {
      const base = r.toLowerCase().split('/')[0].trim();
      if (base && t.includes(base)) return r;
    }
    // Fall back to the first word of a role ("nurse" in "staff nurse").
    for (const r of sorted) {
      const first = r.toLowerCase().split(/[\s/]+/)[0];
      if (first.length > 3 && new RegExp('\\b' + first + '\\b').test(t)) return r;
    }
    return '';
  }

  function findTown(text) {
    const m = text.match(/\b(?:from|in|at|near|live in|living in|based in)\s+([a-z][a-z.\-]+(?:\s[a-z][a-z.\-]+)?)/i);
    if (!m) return '';
    const parts = m[1].split(/\s+/).filter((w) => !STOP.has(w.toLowerCase()) && !/\d/.test(w));
    // keep only the first word unless the second looks like part of a name (e.g. "Nizamabad Town")
    return parts.length ? title(parts[0].replace(/[.\-]+$/, '')) : '';
  }

  function parseResume(raw, roles) {
    const text = words2num(String(raw || '')).replace(/\s+/g, ' ').trim();
    const out = {};
    let m = text.match(/\b(?:my name is|name is|this is|i am|i'm|naa peru|na peru|mera naam)\s+(?!a\b|an\b)([a-z]+(?:\s[a-z]+)?)/i);
    if (m) {
      const ws = m[1].split(' ').filter((w) => !STOP.has(w.toLowerCase()) && !findRole(w, roles));
      if (ws.length) out.name = title(ws.join(' '));
    }
    const role = findRole(text, roles);
    if (role) out.role = role;
    m = text.match(/(\d{1,2})\s*(?:\+\s*)?(?:years?|yrs?|yr)\b/i);
    if (m) out.years = parseInt(m[1], 10);
    const town = findTown(text);
    if (town) out.town = town;
    for (const [re, q] of QUALS) { if (re.test(text)) { out.qualification = q; break; } }
    const langs = LANGS.filter((l) => new RegExp('\\b' + l + '\\b', 'i').test(text));
    if (langs.length) out.languages = langs.join(', ');
    return out;
  }

  function parseJob(raw, roles) {
    let text = words2num(String(raw || '')).replace(/\s+/g, ' ').trim();
    const out = {};
    const role = findRole(text, roles);
    if (role) out.role = role;
    let m = text.match(/(\d{1,3})\s*(?:k|thousand)\b/i);
    if (m) out.salary = parseInt(m[1], 10) * 1000;
    else {
      m = text.replace(/(\d),(\d{3})/g, '$1$2').match(/(?:₹|rs\.?|rupees\s*)?\b(\d{4,6})\b/i);
      if (m) out.salary = parseInt(m[1], 10);
    }
    const town = findTown(text);
    if (town) out.town = town;
    out.details = text;
    return out;
  }

  // Start listening; calls onText(finalText) once, onState(listening:boolean).
  function listen(lang, onText, onState) {
    const SR = root.SpeechRecognition || root.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.lang = lang || 'en-IN';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join(' '));
    r.onend = () => onState(false);
    r.onerror = () => onState(false);
    r.start();
    onState(true);
    return r;
  }

  const api = { parseResume, parseJob, listen, supported: () => !!(root.SpeechRecognition || root.webkitSpeechRecognition) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JobSpeech = api;
})(typeof window !== 'undefined' ? window : globalThis);
