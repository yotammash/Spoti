// Spotify Playlist Analyzer (PKCE) – Hebrew UI
// Full client-side app: login via PKCE, fetch playlist tracks, fetch audio-features, render table, export to Excel.
(() => {
  const CONFIG_KEY = 'sp_cfg_v1';
  const TOKEN_KEY = 'sp_token_v1';

  const els = {
    clientId: document.getElementById('clientId'),
    redirectUri: document.getElementById('redirectUri'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    loginBtn: document.getElementById('loginBtn'),
    authStatus: document.getElementById('authStatus'),
    playlistInput: document.getElementById('playlistInput'),
    fetchBtn: document.getElementById('fetchBtn'),
    clearBtn: document.getElementById('clearBtn'),
    downloadXlsxBtn: document.getElementById('downloadXlsxBtn'),
    resultsInfo: document.getElementById('resultsInfo'),
    resultsTbody: document.querySelector('#resultsTable tbody'),
  };

  // ----- Utilities -----
  const PITCH = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

  function keyToName(k, mode) {
    if (k === -1 || k == null) return '';
    const name = PITCH[k] || '';
    return mode === 1 ? `${name} Major` : `${name} Minor`;
  }

  function roundBPM(n) {
    if (n == null) return '';
    return Math.round(n);
  }

  function saveConfig(cfg) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveToken(tok) {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tok));
  }

  function loadToken() {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function nowSec() { return Math.floor(Date.now() / 1000); }

  function setAuthStatus(ok, msg) {
    els.authStatus.textContent = msg || (ok ? 'מחובר' : 'לא מחובר');
    els.authStatus.classList.toggle('ok', !!ok);
    els.authStatus.classList.toggle('bad', !ok);
  }

  function getDefaultRedirect() {
    // default to current origin path (root of this app)
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    // ensure trailing slash for dashboard compatibility
    if (!url.pathname.endsWith('/')) url.pathname = url.pathname.replace(/[^/]+$/, '');
    return url.toString();
  }

  // ----- PKCE helpers -----
  function generateRandomString(len = 64) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let str = '';
    const arr = new Uint32Array(len);
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) str += charset[arr[i] % charset.length];
    return str;
  }
  async function sha256(plain) {
    const data = new TextEncoder().encode(plain);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(digest);
  }
  function base64url(bytes) {
    let str = btoa(String.fromCharCode(...bytes));
    return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function loginWithSpotify() {
    const cfg = getConfigChecked();
    if (!cfg) return;
    const codeVerifier = generateRandomString(96);
    const bytes = await sha256(codeVerifier);
    const codeChallenge = base64url(bytes);
    localStorage.setItem('sp_code_verifier', codeVerifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      scope: 'playlist-read-private playlist-read-collaborative',
    });
    window.location.assign('https://accounts.spotify.com/authorize?' + params.toString());
  }

  async function exchangeCodeForToken(code) {
    const cfg = loadConfig();
    const codeVerifier = localStorage.getItem('sp_code_verifier');
    if (!cfg || !codeVerifier) {
      setAuthStatus(false, 'שגיאת התחברות: חסר קוד אימות או הגדרות.');
      return null;
    }
    const body = new URLSearchParams({
      client_id: cfg.clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
      code_verifier: codeVerifier
    });

    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!resp.ok) {
      setAuthStatus(false, 'החלפת קוד לטוקן נכשלה.');
      return null;
    }
    const data = await resp.json();
    const tok = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: nowSec() + (data.expires_in || 3600) - 30
    };
    saveToken(tok);
    setAuthStatus(true, 'מחובר');
    return tok;
  }

  async function refreshTokenIfNeeded() {
    let tok = loadToken();
    if (!tok) return null;
    if (tok.expires_at && nowSec() < tok.expires_at) return tok;
    // refresh
    const cfg = loadConfig();
    if (!cfg || !tok.refresh_token) return null;
    const body = new URLSearchParams({
      client_id: cfg.clientId,
      grant_type: 'refresh_token',
      refresh_token: tok.refresh_token
    });
    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    tok = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || tok.refresh_token,
      expires_at: nowSec() + (data.expires_in || 3600) - 30
    };
    saveToken(tok);
    return tok;
  }

  async function getAccessTokenOrLogin() {
    let tok = loadToken();
    if (tok && tok.expires_at && nowSec() < tok.expires_at) return tok.access_token;
    tok = await refreshTokenIfNeeded();
    if (tok) return tok.access_token;
    setAuthStatus(false, 'לא מחובר. התחברו לספוטיפיי.');
    return null;
  }

  // ----- Config handling -----
  function applyConfigToUI(cfg) {
    els.clientId.value = cfg?.clientId || '';
    els.redirectUri.value = cfg?.redirectUri || getDefaultRedirect();
  }

  function getConfigFromUI() {
    return {
      clientId: els.clientId.value.trim(),
      redirectUri: els.redirectUri.value.trim() || getDefaultRedirect(),
    };
  }

  function getConfigChecked() {
    const cfg = getConfigFromUI();
    if (!cfg.clientId) {
      alert('נא למלא Client ID.');
      return null;
    }
    if (!cfg.redirectUri) {
      alert('נא למלא Redirect URI.');
      return null;
    }
    saveConfig(cfg);
    return cfg;
  }

  // ----- Spotify API helpers -----
  async function apiGet(url) {
    const access = await getAccessTokenOrLogin();
    if (!access) throw new Error('No access token');
    const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + access } });
    if (!resp.ok) {
      // try refresh once
      const tok = await refreshTokenIfNeeded();
      if (tok) {
        const resp2 = await fetch(url, { headers: { Authorization: 'Bearer ' + tok.access_token } });
        if (!resp2.ok) {
          const t = await resp2.text();
          throw new Error('Spotify API error: ' + t);
        }
        return resp2.json();
      }
      const t = await resp.text();
      throw new Error('Spotify API error: ' + t);
    }
    return resp.json();
  }

  function extractPlaylistId(raw) {
    if (!raw) return null;
    try {
      if (raw.startsWith('spotify:playlist:')) return raw.split(':')[2];
      const u = new URL(raw);
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts.indexOf('playlist');
      if (idx >= 0 && parts[idx+1]) return parts[idx+1];
      return null;
    } catch {
      return null;
    }
  }

  async function fetchAllPlaylistTracks(playlistId) {
    let url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`;
    const items = [];
    while (url) {
      const data = await apiGet(url);
      for (const it of data.items || []) {
        if (it && it.track && !it.is_local) {
          items.push(it.track);
        }
      }
      url = data.next;
    }
    return items;
  }

  async function fetchAudioFeaturesByIds(ids) {
    const result = new Map();
    const chunk = (arr, n=100) => Array.from({length: Math.ceil(arr.length / n)}, (_, i) => arr.slice(i*n, (i+1)*n));
    for (const part of chunk(ids, 100)) {
      const url = `https://api.spotify.com/v1/audio-features?ids=${encodeURIComponent(part.join(','))}`;
      const data = await apiGet(url);
      for (const f of data.audio_features || []) {
        if (f && f.id) result.set(f.id, f);
      }
    }
    return result;
  }

  function classifyRelease(album_type, total_tracks) {
    // Spotify: album|single|compilation ; EP heuristic
    if (album_type === 'album') return `אלבום${total_tracks ? ` (${total_tracks} שירים)` : ''}`;
    if (album_type === 'single') {
      if (total_tracks && total_tracks > 1) return `EP (${total_tracks} שירים)`;
      return 'סינגל';
    }
    if (album_type === 'compilation') return `אוסף${total_tracks ? ` (${total_tracks} שירים)` : ''}`;
    return album_type || '';
  }

  function renderRows(rows) {
    els.resultsTbody.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(r.artist)}</td>
        <td>${escapeHtml(r.track)}</td>
        <td>${escapeHtml(r.release)}</td>
        <td>${escapeHtml(r.bpm)}</td>
        <td>${escapeHtml(r.key)}</td>
      `;
      frag.appendChild(tr);
    }
    els.resultsTbody.appendChild(frag);
    els.resultsInfo.textContent = rows.length ? `נמצאו ${rows.length} פריטים.` : 'אין נתונים.';
    els.downloadXlsxBtn.disabled = rows.length === 0;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;');
  }

  function exportToExcel(rows) {
    const wsData = rows.map(r => ({
      'שם האומן': r.artist,
      'שם הטראק': r.track,
      'שחרור': r.release,
      'BPM': r.bpm,
      'מפתח': r.key,
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Playlist');
    XLSX.writeFile(wb, 'playlist_bpm_key.xlsx');
  }

  // ----- Event handlers -----
  function attachEvents() {
    els.saveSettingsBtn.addEventListener('click', () => {
      const cfg = getConfigFromUI();
      saveConfig(cfg);
      alert('הגדרות נשמרו.');
    });
    els.loginBtn.addEventListener('click', loginWithSpotify);

    els.fetchBtn.addEventListener('click', async () => {
      try {
        const pid = extractPlaylistId(els.playlistInput.value.trim());
        if (!pid) { alert('קישור פלייליסט לא תקין.'); return; }
        setBusy(true);
        const tracks = await fetchAllPlaylistTracks(pid);
        const ids = [...new Set(tracks.map(t => t.id).filter(Boolean))];
        const featuresMap = await fetchAudioFeaturesByIds(ids);

        const rows = tracks.map(t => {
          const artists = t.artists?.map(a => a?.name).filter(Boolean).join(', ') || '';
          const feat = featuresMap.get(t.id);
          const bpm = feat ? roundBPM(feat.tempo) : '';
          const key = feat ? keyToName(feat.key, feat.mode) : '';
          const albumType = t.album?.album_type || '';
          const total = t.album?.total_tracks || 0;
          const release = classifyRelease(albumType, total);
          return {
            artist: artists,
            track: t.name || '',
            release,
            bpm,
            key
          };
        });
        renderRows(rows);
        window.__rows = rows; // for export
      } catch (e) {
        console.error(e);
        alert('שגיאה בעת משיכת הנתונים: ' + (e?.message || e));
      } finally {
        setBusy(false);
      }
    });

    els.clearBtn.addEventListener('click', () => {
      els.resultsTbody.innerHTML = '';
      els.resultsInfo.textContent = '';
      els.downloadXlsxBtn.disabled = true;
      window.__rows = [];
    });

    els.downloadXlsxBtn.addEventListener('click', () => {
      if (Array.isArray(window.__rows) && window.__rows.length) {
        exportToExcel(window.__rows);
      }
    });
  }

  function setBusy(on) {
    document.body.style.pointerEvents = on ? 'none' : '';
    document.body.style.opacity = on ? '0.75' : '';
  }

  async function handleAuthRedirect() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (error) {
      setAuthStatus(false, 'שגיאת התחברות: ' + error);
      return;
    }
    if (code) {
      await exchangeCodeForToken(code);
      // cleanup query params
      url.searchParams.delete('code');
      url.searchParams.delete('state');
      history.replaceState({}, '', url.toString());
    }
    // final status
    const tok = loadToken();
    if (tok && tok.expires_at && nowSec() < tok.expires_at) setAuthStatus(true, 'מחובר');
    else setAuthStatus(false, 'לא מחובר');
  }

  // ----- Init -----
  function init() {
    const cfg = loadConfig() || { clientId: '', redirectUri: getDefaultRedirect() };
    applyConfigToUI(cfg);
    attachEvents();
    handleAuthRedirect();
    window.__rows = [];
  }

  // start
  init();
})();
