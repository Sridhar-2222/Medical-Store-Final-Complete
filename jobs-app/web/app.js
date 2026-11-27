// Jobs page web app (no build step, no framework).
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const view = $('#view');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rupees = (n) => (n ? '₹' + Number(n).toLocaleString('en-IN') : '');
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} },
  };
  let token = store.get('jobs.token');
  let me = null;
  let board = null;
  let boardLink = location.origin + '/j';
  let pushKey = null;

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800);
  }
  async function api(path, { method = 'GET', body, form, admin } = {}) {
    const headers = {};
    if (token) headers.authorization = 'Bearer ' + token;
    if (admin) headers['x-admin-pin'] = admin;
    let payload;
    if (form) payload = form; else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(path, { method, headers, body: payload });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token && !path.startsWith('/api/auth')) { setToken(null); location.hash = '#/login'; }
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }
  function setToken(t) { token = t; store.set('jobs.token', t); me = null; }

  async function loadBoard() {
    const d = await api('/api/board');
    board = d.board; boardLink = d.link; pushKey = d.pushKey;
    $('#brand').textContent = board.name;
    document.title = board.name;
    return d;
  }
  async function loadMe() { if (!token) { me = null; return null; } try { me = await api('/api/me'); } catch (_) { me = null; } return me; }

  function nav() {
    const n = $('#nav');
    if (me) {
      const mine = me.role === 'candidate' ? '#/my' : '#/firm';
      n.innerHTML = `<a href="/j">Jobs</a><a href="${mine}">${me.role === 'candidate' ? 'My page' : 'My firm'}</a>
        <a href="#/alerts">Alerts${me.unread ? `<span class="dot">${me.unread}</span>` : ''}</a>`;
    } else {
      n.innerHTML = `<a href="#/join">Join</a><a href="#/login">Log in</a>`;
    }
  }

  // ---------- voice helper ----------
  function voiceRow(id) {
    if (!JobSpeech.supported()) {
      return `<p class="muted small">Tip: tap the microphone on your keyboard to speak instead of typing.</p>`;
    }
    return `<div class="voice">
      <select id="${id}-lang" aria-label="Language"><option value="en-IN">English</option><option value="te-IN">తెలుగు</option><option value="hi-IN">हिंदी</option></select>
      <button type="button" class="btn mic" id="${id}-mic">🎤 Speak</button></div>`;
  }
  function wireVoice(id, onText) {
    const b = $('#' + id + '-mic'); if (!b) return;
    b.onclick = () => JobSpeech.listen($('#' + id + '-lang').value, onText, (on) => {
      b.classList.toggle('on', on); b.textContent = on ? '● Listening…' : '🎤 Speak';
    });
  }

  // ---------- poster ----------
  let posterName = 'jobs-poster.png';
  async function openPoster(kind, data) {
    const c = $('#posterCanvas');
    try {
      if (kind === 'page') { posterName = 'jobs-page.png'; await Poster.page(c, board, boardLink); }
      else { posterName = `job-${data.job.short}.png`; await Poster.job(c, data.job, data.link, board.name); }
      $('#poster').showModal();
    } catch (e) { toast('Could not make the poster.'); }
  }
  $('#posterClose').onclick = () => $('#poster').close();
  $('#posterSave').onclick = () => {
    const a = document.createElement('a'); a.download = posterName; a.href = $('#posterCanvas').toDataURL('image/png'); a.click();
  };
  $('#posterShare').onclick = () => $('#posterCanvas').toBlob(async (blob) => {
    const file = new File([blob], posterName, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: boardLink }); } catch (_) {}
    } else { $('#posterSave').click(); toast('Image saved. Share it from your gallery.'); }
  }, 'image/png');

  // ---------- views ----------
  function jobCard(j, { open = true, extra = '', actions = '' } = {}) {
    const f = j.firm || {};
    const logo = f.logo ? `<img class="logo" src="${esc(f.logo)}" alt="">` : `<div class="logo">${esc((f.name || '?')[0])}</div>`;
    return `<div class="card"><div class="job">${logo}<div style="flex:1;min-width:0">
      <h3>${esc(j.role)}${j.open === false ? ' <span class="status">Closed</span>' : ''}</h3>
      <div>${esc(j.town)}${j.salary ? ' · <span class="salary">' + rupees(j.salary) + '</span>/month' : ''}</div>
      <div class="muted small">${esc(f.name || '')}${f.type ? ' · ' + esc(f.type) : ''}</div>
      ${j.details && !open ? `<p>${esc(j.details)}</p>` : ''}
      ${open ? `<div class="row"><a class="btn" href="/j/${esc(j.short)}">Open</a>
        <button class="btn ghost" data-poster="${esc(j.short)}">Job poster</button>${actions}</div>` : ''}
      ${extra}
    </div></div></div>`;
  }
  function wirePosterButtons(jobs) {
    view.querySelectorAll('[data-poster]').forEach((b) => b.onclick = async () => {
      const d = await api('/api/jobs/' + b.dataset.poster);
      openPoster('job', d);
    });
  }

  async function boardView() {
    const d = await loadBoard();
    const mine = me ? (me.role === 'candidate' ? '#/my' : '#/firm') : '#/join';
    view.innerHTML = `
      <div class="card"><h1>${esc(board.name)}</h1>
        ${board.about ? `<p>${esc(board.about)}</p>` : ''}
        ${board.town ? `<p class="muted">${esc(board.town)}</p>` : ''}
        <div class="chips">${board.roles.map((r) => `<span class="chip">${esc(r)}</span>`).join('')}</div>
        <div class="row"><a class="btn" href="${mine}">${me ? 'Go to my page' : 'Join free'}</a>
        <button class="btn ghost" id="pagePoster">Make poster</button></div>
      </div>
      <h2>Open jobs (${d.jobs.length})</h2>
      ${d.jobs.length ? d.jobs.map((j) => jobCard(j)).join('') : '<p class="muted">No jobs yet. Employers can join and post one.</p>'}`;
    $('#pagePoster').onclick = () => openPoster('page');
    wirePosterButtons();
  }

  async function jobView(short) {
    await loadBoard();
    let d;
    try { d = await api('/api/jobs/' + encodeURIComponent(short)); }
    catch (e) { view.innerHTML = `<div class="card"><h2>Job not found</h2><a href="/j">See all jobs</a></div>`; return; }
    const j = d.job; const f = j.firm || {};
    let action = '';
    if (!j.open) action = '<p class="note">This job is closed.</p>';
    else if (!me) action = `<a class="btn wide" href="#/join" id="joinApply">Join and apply</a><p class="muted small">Already joined? <a href="#/login">Log in</a></p>`;
    else if (me.role === 'candidate') action = `<button class="btn wide" id="apply">Apply</button>
      <p class="muted small">The employer sees a code, your photo and your resume. Your phone number stays hidden.</p>`;
    view.innerHTML = `${jobCard(j, { open: false })}
      <div class="card"><h3>About the firm</h3><p><b>${esc(f.name)}</b>${f.type ? ' · ' + esc(f.type) : ''} · ${esc(f.town)}</p>
        ${f.about ? `<p>${esc(f.about)}</p>` : ''}<p class="muted small">Contact details are shared only after both sides agree.</p></div>
      <div class="card">${action}<div class="row"><button class="btn ghost" id="jp">Job poster</button><a class="btn ghost" href="/j">All jobs</a></div></div>`;
    $('#jp').onclick = () => openPoster('job', d);
    if ($('#joinApply')) $('#joinApply').onclick = () => { store.set('jobs.return', location.pathname); store.set('jobs.joinAs', 'candidate'); };
    if ($('#apply')) $('#apply').onclick = async () => {
      try {
        const r = await api(`/api/jobs/${j.id}/apply`, { method: 'POST' });
        toast(r.already ? 'You already applied.' : 'Applied. Your code: ' + r.application.code);
        location.hash = '#/my?tab=jobs';
      } catch (e) {
        toast(e.message);
        if (/resume/i.test(e.message)) { store.set('jobs.return', location.pathname); location.hash = '#/my'; }
      }
    };
  }

  function authView(mode) {
    const joinAs = store.get('jobs.joinAs') || 'candidate';
    view.innerHTML = `<div class="card"><h2>${mode === 'join' ? 'Join' : 'Log in'}</h2>
      <form id="f">
        ${mode === 'join' ? `<label>I am</label>
          <select name="role"><option value="candidate" ${joinAs === 'candidate' ? 'selected' : ''}>Looking for a job</option>
          <option value="employer" ${joinAs === 'employer' ? 'selected' : ''}>Giving jobs (pharmacy, hospital, clinic, lab)</option></select>` : ''}
        <label>Phone number</label><input name="phone" inputmode="numeric" autocomplete="tel" maxlength="14" required>
        <label>${mode === 'join' ? 'Make a 4-digit PIN' : 'PIN'}</label><input name="pin" type="password" inputmode="numeric" maxlength="6" required>
        ${mode === 'join' ? `<label>PIN again</label><input name="pin2" type="password" inputmode="numeric" maxlength="6" required>
          <p class="muted small">Your phone number is hidden. It is shared only when you choose to share it.</p>` : ''}
        <div class="row"><button class="btn wide">${mode === 'join' ? 'Join' : 'Log in'}</button></div>
      </form>
      <p class="small">${mode === 'join' ? 'Already joined? <a href="#/login">Log in</a>' : 'New here? <a href="#/join">Join</a>'}</p></div>`;
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      if (mode === 'join' && fd.pin !== fd.pin2) return toast('The two PINs do not match.');
      try {
        const r = await api('/api/auth/' + mode, { method: 'POST', body: fd });
        setToken(r.token); store.set('jobs.joinAs', null);
        await loadMe(); nav();
        const back = store.get('jobs.return'); store.set('jobs.return', null);
        if (r.role === 'candidate' && !me.resume) { if (back) store.set('jobs.return', back); location.hash = '#/my'; }
        else if (back) location.href = back;
        else location.hash = r.role === 'candidate' ? '#/my' : '#/firm';
      } catch (err) { toast(err.message); }
    };
  }

  function tabs(list, active) {
    return `<div class="tabs">${list.map(([k, label]) => `<button data-tab="${k}" class="${k === active ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  }
  function wireTabs(base) {
    view.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { location.hash = base + '?tab=' + b.dataset.tab; });
  }
  const tabOf = () => new URLSearchParams(location.hash.split('?')[1] || '').get('tab');

  // ----- candidate -----
  async function candidateView() {
    await loadBoard(); await loadMe();
    if (!me || me.role !== 'candidate') return (location.hash = '#/login');
    const r = me.resume || {};
    const tab = tabOf() || (me.resume ? 'jobs' : 'resume');
    let body = '';
    if (tab === 'resume') {
      body = `<form id="f" class="card"><h2>Resume</h2>
        <p class="muted small">Say one sentence, for example: “My name is Ravi Kumar, pharmacist, 3 years experience, from Karimnagar, D.Pharm, I speak Telugu and Hindi.”</p>
        ${voiceRow('rv')}
        <div class="job" style="margin-top:12px">${r.photo ? `<img class="photo" src="${esc(r.photo)}" alt="">` : '<div class="photo"></div>'}
          <div style="flex:1"><label>Photo</label><input type="file" name="photo" accept="image/*"></div></div>
        <label>Name</label><input name="name" value="${esc(r.name)}" required maxlength="60">
        <div class="two"><div><label>Role</label><input name="role" list="roles" value="${esc(r.role)}" required maxlength="40"></div>
          <div><label>Years of experience</label><input name="years" type="number" min="0" max="60" inputmode="numeric" value="${esc(r.years ?? '')}"></div></div>
        <datalist id="roles">${board.roles.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
        <div class="two"><div><label>Town</label><input name="town" value="${esc(r.town)}" maxlength="60"></div>
          <div><label>Languages</label><input name="languages" value="${esc(r.languages)}" maxlength="80" placeholder="Telugu, Hindi"></div></div>
        <label>Qualification (one line)</label><input name="qualification" value="${esc(r.qualification)}" maxlength="100">
        <label>Experience certificate (optional, photo or PDF)</label>
        ${r.hasCertificate ? `<p class="small">Saved. <a href="${esc(r.certificate)}" target="_blank" rel="noopener">View</a> ·
          <label style="display:inline;font-weight:400"><input type="checkbox" name="removeCertificate" value="yes" style="width:auto;min-height:0"> Remove</label></p>` : ''}
        <input type="file" name="certificate" accept="image/*,application/pdf">
        <p class="muted small">Employers see the certificate only after they shortlist you. Your phone number is never shown until you share it.</p>
        <div class="row"><button class="btn wide">Save resume</button></div></form>`;
    } else if (tab === 'words') {
      body = `<form id="w" class="card"><h2>My words</h2>
        <p class="muted small">A short note about you, in your own words. Speak or type.</p>
        ${voiceRow('wv')}
        <label>My words</label><textarea name="words" maxlength="600">${esc(r.words)}</textarea>
        <div class="row"><button class="btn wide">Save</button></div></form>`;
    } else {
      const { applications } = await api('/api/candidate/applications');
      body = applications.length ? applications.map((a) => {
        let st = '';
        if (a.status === 'applied') st = '<p class="muted small">Waiting for the employer. You will get an alert if you are shortlisted.</p>';
        if (a.status === 'shortlisted') st = `<p class="note">You are shortlisted. Share your number so the employer can call you. You will also see their number.</p>
          <button class="btn wide" data-share="${esc(a.id)}">Share my number</button>`;
        if (a.status === 'connected') st = `<p>Employer's number: <span class="phone">${esc(a.phone)}</span></p>
          <div class="row"><a class="btn" href="tel:+91${esc(a.phone)}">Call</a><a class="btn ghost" href="https://wa.me/91${esc(a.phone)}" target="_blank" rel="noopener">WhatsApp</a></div>`;
        return jobCard(a.job, { open: false,
          extra: `<p>Your code <span class="code">${esc(a.code)}</span> <span class="status ${a.status}">${label(a.status)}</span></p>${st}` });
      }).join('') : `<div class="card"><p>You have not applied yet.</p><a class="btn" href="/j">See jobs</a></div>`;
    }
    view.innerHTML = tabs([['resume', 'Resume'], ['words', 'My words'], ['jobs', 'My jobs']], tab) + body;
    wireTabs('#/my');

    const f = $('#f');
    if (f) {
      wireVoice('rv', (text) => {
        const p = JobSpeech.parseResume(text, board.roles);
        for (const k of Object.keys(p)) if (f.elements[k]) f.elements[k].value = p[k];
        toast(Object.keys(p).length ? 'Filled from your voice. Check and save.' : 'Could not understand. Please type.');
      });
      f.onsubmit = async (e) => {
        e.preventDefault();
        try {
          await api('/api/candidate/resume', { method: 'PUT', form: new FormData(f) });
          toast('Resume saved.');
          const back = store.get('jobs.return'); store.set('jobs.return', null);
          if (back) location.href = back; else { location.hash = '#/my?tab=words'; }
        } catch (err) { toast(err.message); }
      };
    }
    const w = $('#w');
    if (w) {
      wireVoice('wv', (text) => { const t = w.elements.words; t.value = (t.value ? t.value + ' ' : '') + text; });
      w.onsubmit = async (e) => {
        e.preventDefault();
        if (!me.resume) return toast('Save your resume first.');
        try { await api('/api/candidate/resume', { method: 'PUT', form: new FormData(w) }); toast('Saved.'); }
        catch (err) { toast(err.message); }
      };
    }
    view.querySelectorAll('[data-share]').forEach((b) => b.onclick = async () => {
      if (!confirm('Share your phone number with this employer? You will see their number too.')) return;
      try { await api(`/api/applications/${b.dataset.share}/share`, { method: 'POST' }); toast('Number shared.'); route(); }
      catch (err) { toast(err.message); }
    });
  }
  const label = (s) => ({ applied: 'Applied', shortlisted: 'Shortlisted', connected: 'Numbers shared' }[s] || s);

  // ----- employer -----
  async function employerView() {
    await loadBoard(); await loadMe();
    if (!me || me.role !== 'employer') return (location.hash = '#/login');
    const f = me.firm || {};
    const tab = tabOf() || (me.firm ? 'apps' : 'card');
    let body = '';
    if (tab === 'card') {
      const types = ['Pharmacy / medical store', 'Hospital', 'Clinic', 'Lab', 'Distributor', 'Other'];
      body = `<form id="f" class="card"><h2>Firm card</h2>
        <div class="job">${f.logo ? `<img class="logo" src="${esc(f.logo)}" alt="">` : '<div class="logo">+</div>'}
          <div style="flex:1"><label>Logo (optional)</label><input type="file" name="logo" accept="image/*"></div></div>
        <label>Firm name</label><input name="name" value="${esc(f.name)}" required maxlength="80">
        <div class="two"><div><label>Type</label><select name="type">${types.map((t) => `<option ${t === f.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div><label>Town</label><input name="town" value="${esc(f.town)}" required maxlength="60"></div></div>
        <label>About (one line)</label><input name="about" value="${esc(f.about)}" maxlength="160">
        <p class="muted small">No phone or contact is shown on your card. Your number is shared only with a candidate you shortlist who shares theirs.</p>
        <div class="row"><button class="btn wide">Save firm card</button></div></form>`;
    } else if (tab === 'post') {
      const { jobs } = await api('/api/employer/jobs');
      body = `<form id="p" class="card"><h2>Post a job</h2>
        <p class="muted small">Say it, for example: “Pharmacist in Karimnagar, 18000 salary, morning shift.”</p>
        ${voiceRow('jv')}
        <div class="two"><div><label>Role</label><input name="role" list="roles" required maxlength="40"></div>
          <div><label>Town</label><input name="town" value="${esc(f.town)}" required maxlength="60"></div></div>
        <datalist id="roles">${board.roles.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
        <label>Salary per month (₹)</label><input name="salary" inputmode="numeric" maxlength="7">
        <label>Details (optional)</label><textarea name="details" maxlength="300"></textarea>
        <div class="row"><button class="btn wide">Post job</button></div></form>
        <h2>My jobs</h2>
        ${jobs.length ? jobs.map((j) => jobCard(j, {
          actions: `<button class="btn ghost" data-toggle="${esc(j.id)}" data-open="${j.open}">${j.open ? 'Close' : 'Reopen'}</button>`,
          extra: `<p class="muted small">${j.applications} application(s)</p>` })).join('') : '<p class="muted">No jobs posted yet.</p>'}`;
    } else {
      const { applications } = await api('/api/employer/applications');
      body = applications.length ? applications.map((a) => {
        const photo = a.photo ? `<img class="photo" src="${esc(a.photo)}" alt="">` : '<div class="photo"></div>';
        let st = '';
        if (a.status === 'applied') st = `<button class="btn wide" data-short="${esc(a.id)}">Shortlist</button>`;
        if (a.status === 'shortlisted') st = '<p class="note">Shortlisted. Waiting for the candidate to share their number.</p>';
        if (a.status === 'connected') st = `<p>Candidate's number: <span class="phone">${esc(a.phone)}</span></p>
          <div class="row"><a class="btn" href="tel:+91${esc(a.phone)}">Call</a><a class="btn ghost" href="https://wa.me/91${esc(a.phone)}" target="_blank" rel="noopener">WhatsApp</a></div>`;
        const cert = a.certificate ? `<a href="${esc(a.certificate)}" target="_blank" rel="noopener">View experience certificate</a>`
          : a.hasCertificate ? '<span class="muted small">Experience certificate: shown after you shortlist.</span>' : '';
        return `<div class="card"><div class="job">${photo}<div style="flex:1;min-width:0">
          <h3><span class="code">${esc(a.code)}</span> ${a.name ? esc(a.name) : ''}</h3>
          <div class="muted small">For: ${esc(a.job.role)} · ${esc(a.job.town)} · <span class="status ${a.status}">${label(a.status)}</span></div>
          <p>${esc(a.role)}${a.years ? ' · ' + esc(a.years) + ' yrs' : ''}${a.town ? ' · ' + esc(a.town) : ''}</p>
          ${a.qualification ? `<div class="small">${esc(a.qualification)}</div>` : ''}
          ${a.languages ? `<div class="small muted">Speaks: ${esc(a.languages)}</div>` : ''}
          ${a.words ? `<p><i>“${esc(a.words)}”</i></p>` : ''}
          <div>${cert}</div>${st}</div></div></div>`;
      }).join('') : '<div class="card"><p>No applications yet. Post a job and share its poster.</p></div>';
    }
    view.innerHTML = tabs([['card', 'Firm card'], ['post', 'Post job'], ['apps', 'Applications']], tab) + body;
    wireTabs('#/firm');
    wirePosterButtons();

    const fc = $('#f');
    if (fc) fc.onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/api/employer/firm', { method: 'PUT', form: new FormData(fc) }); toast('Firm card saved.'); location.hash = '#/firm?tab=post'; }
      catch (err) { toast(err.message); }
    };
    const p = $('#p');
    if (p) {
      wireVoice('jv', (text) => {
        const j = JobSpeech.parseJob(text, board.roles);
        for (const k of ['role', 'town', 'salary', 'details']) if (j[k]) p.elements[k].value = j[k];
        toast('Filled from your voice. Check and post.');
      });
      p.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const d = await api('/api/jobs', { method: 'POST', body: Object.fromEntries(new FormData(p)) });
          toast('Job posted.');
          await openPoster('job', d);
          route();
        } catch (err) { toast(err.message); }
      };
    }
    view.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = async () => {
      await api(`/api/jobs/${b.dataset.toggle}/close`, { method: 'POST', body: { open: b.dataset.open !== 'true' } }); route();
    });
    view.querySelectorAll('[data-short]').forEach((b) => b.onclick = async () => {
      try { await api(`/api/applications/${b.dataset.short}/shortlist`, { method: 'POST' }); toast('Shortlisted. The candidate gets an alert.'); route(); }
      catch (err) { toast(err.message); }
    });
  }

  // ----- alerts -----
  async function alertsView() {
    await loadBoard(); await loadMe();
    if (!me) return (location.hash = '#/login');
    const { notifications } = await api('/api/notifications');
    const canPush = pushKey && 'serviceWorker' in navigator && 'PushManager' in window;
    const on = canPush && Notification.permission === 'granted';
    view.innerHTML = `<div class="card"><h2>Alerts</h2>
      ${canPush && !on ? '<button class="btn wide" id="push">Turn on phone alerts</button><p class="muted small">Get a phone notification when there is news on your jobs.</p>' : ''}
      ${on ? '<p class="muted small">Phone alerts are on.</p>' : ''}
      </div>
      ${notifications.length ? notifications.map((n) => `<div class="card"><a href="${esc(n.link)}">${n.read ? '' : '<b>New · </b>'}${esc(n.text)}</a>
        <div class="muted small">${new Date(n.createdAt).toLocaleString('en-IN')}</div></div>`).join('') : '<p class="muted">No alerts yet.</p>'}
      <div class="row"><button class="btn ghost" id="logout">Log out</button></div>`;
    if (notifications.some((n) => !n.read)) { await api('/api/notifications/read', { method: 'POST' }); me.unread = 0; nav(); }
    if ($('#push')) $('#push').onclick = enablePush;
    $('#logout').onclick = async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) {} setToken(null); location.href = '/j'; };
  }
  async function enablePush() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return toast('Alerts were not allowed.');
      const reg = await navigator.serviceWorker.ready;
      const raw = atob(pushKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (pushKey.length % 4)) % 4));
      const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
      toast('Phone alerts are on.'); route();
    } catch (e) { toast('Could not turn on alerts on this phone.'); }
  }

  // ----- admin -----
  async function adminView() {
    await loadBoard();
    const pin = (() => { try { return sessionStorage.getItem('jobs.admin'); } catch (_) { return null; } })();
    const ask = () => {
      view.innerHTML = `<form id="a" class="card"><h2>Admin</h2><label>Admin PIN</label><input name="pin" type="password" inputmode="numeric" required>
        <div class="row"><button class="btn wide">Open</button></div></form>`;
      $('#a').onsubmit = (e) => { e.preventDefault(); try { sessionStorage.setItem('jobs.admin', e.target.pin.value); } catch (_) {} adminView(); };
    };
    if (!pin) return ask();
    let d;
    try { d = await api('/api/admin/overview', { admin: pin }); }
    catch (e) { try { sessionStorage.removeItem('jobs.admin'); } catch (_) {} toast(e.message); return ask(); }
    const c = d.counts;
    view.innerHTML = `<div class="card"><h2>Overview</h2><div class="stats">
        <div class="stat"><b>${c.candidates}</b>Candidates</div><div class="stat"><b>${c.employers}</b>Employers</div><div class="stat"><b>${c.openJobs}</b>Open jobs</div>
        <div class="stat"><b>${c.applications}</b>Applied</div><div class="stat"><b>${c.shortlisted}</b>Shortlisted</div><div class="stat"><b>${c.connected}</b>Numbers shared</div></div></div>
      <form id="b" class="card"><h2>Page</h2>
        <label>Page name</label><input name="name" value="${esc(d.board.name)}" required maxlength="60">
        <label>Town / area</label><input name="town" value="${esc(d.board.town)}" maxlength="60">
        <label>About (one line)</label><input name="about" value="${esc(d.board.about)}" maxlength="200">
        <label>Roles (comma separated)</label><textarea name="roles">${esc(d.board.roles.join(', '))}</textarea>
        <div class="row"><button class="btn">Save page</button><button type="button" class="btn ghost" id="pp">Make poster</button></div></form>
      <div class="card small muted">Privacy settings on the server: employer sees candidate name before shortlisting:
        <b>${d.settings.nameBeforeShortlist ? 'yes' : 'no'}</b> · certificate before shortlisting: <b>${d.settings.certBeforeShortlist ? 'yes' : 'no'}</b>.</div>`;
    $('#b').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/api/admin/board', { method: 'PUT', admin: pin, body: Object.fromEntries(new FormData(e.target)) }); toast('Saved.'); adminView(); }
      catch (err) { toast(err.message); }
    };
    $('#pp').onclick = () => openPoster('page');
  }

  // ---------- router ----------
  async function route() {
    try {
      if (!me && token) await loadMe();
      nav();
      const h = location.hash.split('?')[0];
      const jm = location.pathname.match(/^\/j\/([\w-]+)/);
      if (h === '#/join') return authView('join');
      if (h === '#/login') return authView('login');
      if (h === '#/my') return await candidateView();
      if (h === '#/firm') return await employerView();
      if (h === '#/alerts') return await alertsView();
      if (location.pathname === '/admin') return await adminView();
      if (jm) return await jobView(jm[1]);
      return await boardView();
    } catch (e) {
      view.innerHTML = `<div class="card"><p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">Try again</button></div>`;
    } finally { nav(); }
  }
  window.addEventListener('hashchange', route);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  setInterval(async () => { if (token && document.visibilityState === 'visible') { const u = me && me.unread; await loadMe(); if (me && me.unread !== u) nav(); } }, 30000);
  route();
})();
