(() => {
  'use strict';

  const config = window.WEB2APK_CONFIG || {};
  const encoder = new TextEncoder();
  const TOKEN_STORAGE_KEY = 'web2apk.github.token.v1';
  const QUEUE_DB_NAME = 'web2apk-offline-builds';
  const QUEUE_STORE = 'queue';
  let token = '';
  let user = null;
  let queueDbPromise = null;
  let flushingQueue = false;
  let authPromise = null;
  let authResolve = null;
  let authReject = null;

  const $ = selector => document.querySelector(selector);
  const repoPath = () => `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}`;

  class GitHubError extends Error {
    constructor(message, status = 0, details = null) {
      super(message);
      this.name = 'GitHubError';
      this.status = status;
      this.details = details;
    }
  }

  async function request(path, options = {}) {
    if (!token) throw new GitHubError('يجب ربط GitHub أولاً', 401);
    const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
    const headers = new Headers(options.headers || {});
    headers.set('Accept', options.accept || 'application/vnd.github+json');
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-GitHub-Api-Version', config.apiVersion || '2026-03-10');
    if (options.json !== undefined) {
      headers.set('Content-Type', 'application/json');
      options.body = JSON.stringify(options.json);
    }
    let response;
    try {
      response = await fetch(url, { ...options, headers, cache: 'no-store' });
    } catch (error) {
      const host = (() => { try { return new URL(url).host; } catch (_) { return 'api.github.com'; } })();
      throw new GitHubError(`تعذر الاتصال بـ ${host}. أوقف مانع التتبع لهذا الموقع وتحقق من السماح بطلبات GitHub API.`, 0, error);
    }
    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = body.message || JSON.stringify(body);
      } catch (_) { detail = await response.text().catch(() => ''); }
      const friendly = response.status === 401
        ? 'Token غير صالح أو انتهت صلاحيته.'
        : response.status === 403
          ? 'لا يملك Token الصلاحيات المطلوبة للمستودع أو GitHub Actions.'
          : response.status === 404
            ? 'المستودع أو Workflow غير موجود، أو Token لا يستطيع الوصول إليه.'
            : `أعاد GitHub الخطأ ${response.status}: ${detail}`;
      throw new GitHubError(friendly, response.status, detail);
    }
    if (options.raw) return response;
    if (response.status === 204) return null;
    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('json') ? response.json() : response.text();
  }

  function setConnected(connected) {
    const button = $('#githubConnect');
    if (!button) return;
    button.classList.toggle('connected', connected);
    const label = button.querySelector('span');
    if (label) label.textContent = connected ? (user?.login || 'متصل') : 'ربط GitHub';
    button.title = connected ? `متصل بالحساب ${user?.login || ''} — اضغط لقطع الاتصال` : 'ربط مستودع GitHub الخاص';
  }

  function closeAuth() {
    $('#githubAuthModal')?.classList.add('hidden');
    const field = $('#githubToken');
    if (field) field.value = '';
  }

  async function connectWithToken(value, remember = false) {
    const nextToken = String(value || '').trim();
    if (!/^(github_pat_|ghp_|gho_|ghu_)[A-Za-z0-9_]+$/.test(nextToken)) {
      throw new GitHubError('صيغة Token غير صحيحة. استخدم Fine-grained Personal Access Token.');
    }
    token = nextToken;
    try {
      user = await request('/user');
      const repository = await request(repoPath());
      if (!repository.private) console.warn('Builder repository is public; private is recommended.');
      await request(`${repoPath()}/actions/workflows/${encodeURIComponent(config.workflow)}`);
      if (remember) localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
      setConnected(true);
      setTimeout(() => flushQueuedBuilds().catch(error => console.warn('Queue flush failed:', error)), 0);
      return user;
    } catch (error) {
      token = '';
      user = null;
      if (remember && !(error instanceof GitHubError && error.status === 0)) localStorage.removeItem(TOKEN_STORAGE_KEY);
      setConnected(false);
      throw error;
    }
  }

  function ensureAuth() {
    if (token && user) return Promise.resolve(user);
    if (authPromise) return authPromise;
    $('#authError')?.classList.add('hidden');
    $('#githubAuthModal')?.classList.remove('hidden');
    setTimeout(() => $('#githubToken')?.focus(), 100);
    authPromise = new Promise((resolve, reject) => { authResolve = resolve; authReject = reject; });
    return authPromise.finally(() => {
      authPromise = null;
      authResolve = null;
      authReject = null;
    });
  }

  function disconnect() {
    token = '';
    user = null;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setConnected(false);
  }

  async function restoreStoredToken() {
    const saved = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!saved || !navigator.onLine) return;
    try {
      await connectWithToken(saved, true);
    } catch (error) {
      console.warn('Saved GitHub session could not be restored:', error.message);
      if (!(error instanceof GitHubError && error.status === 0)) localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }

  function bindAuthUi() {
    $('#githubConnect')?.addEventListener('click', async () => {
      if (token) {
        if (confirm('هل تريد قطع اتصال GitHub وحذف المفتاح المحفوظ من هذا المتصفح؟')) disconnect();
        return;
      }
      ensureAuth().catch(() => {});
    });
    $('#authClose')?.addEventListener('click', () => {
      closeAuth();
      authReject?.(new GitHubError('تم إلغاء ربط GitHub'));
    });
    $('#authSubmit')?.addEventListener('click', async () => {
      const button = $('#authSubmit');
      const errorBox = $('#authError');
      button.disabled = true;
      errorBox.classList.add('hidden');
      try {
        const result = await connectWithToken($('#githubToken').value, $('#githubRemember')?.checked !== false);
        closeAuth();
        authResolve?.(result);
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.classList.remove('hidden');
      } finally { button.disabled = false; }
    });
    $('#githubToken')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') $('#authSubmit')?.click();
    });
  }

  // Minimal standards-compliant ZIP writer (store method) to avoid external CDN dependencies.
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function zipDate(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  function write16(view, offset, value) { view.setUint16(offset, value, true); }
  function write32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }
  function joinBytes(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
  }

  async function createZip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    const stamp = zipDate();
    for (const entry of entries) {
      const name = encoder.encode(entry.name.replace(/^\/+/, ''));
      const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(await entry.data.arrayBuffer());
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      write32(lv, 0, 0x04034b50); write16(lv, 4, 20); write16(lv, 6, 0x0800); write16(lv, 8, 0);
      write16(lv, 10, stamp.time); write16(lv, 12, stamp.date); write32(lv, 14, crc);
      write32(lv, 18, data.length); write32(lv, 22, data.length); write16(lv, 26, name.length); write16(lv, 28, 0);
      local.set(name, 30);
      locals.push(local, data);

      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      write32(cv, 0, 0x02014b50); write16(cv, 4, 0x0314); write16(cv, 6, 20); write16(cv, 8, 0x0800);
      write16(cv, 10, 0); write16(cv, 12, stamp.time); write16(cv, 14, stamp.date); write32(cv, 16, crc);
      write32(cv, 20, data.length); write32(cv, 24, data.length); write16(cv, 28, name.length);
      write16(cv, 30, 0); write16(cv, 32, 0); write16(cv, 34, 0); write16(cv, 36, 0); write32(cv, 38, 0); write32(cv, 42, offset);
      central.set(name, 46);
      centrals.push(central);
      offset += local.length + data.length;
    }
    const centralBytes = joinBytes(centrals);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    write32(ev, 0, 0x06054b50); write16(ev, 4, 0); write16(ev, 6, 0); write16(ev, 8, entries.length);
    write16(ev, 10, entries.length); write32(ev, 12, centralBytes.length); write32(ev, 16, offset); write16(ev, 20, 0);
    return new Blob([...locals, centralBytes, end], { type: 'application/zip' });
  }

  function extension(file) {
    const match = String(file?.name || '').toLowerCase().match(/\.(png|jpe?g|webp)$/);
    return match ? (match[1] === 'jpeg' ? '.jpg' : `.${match[1]}`) : '.png';
  }

  function asBool(value) { return String(value).toLowerCase() === 'true'; }
  function projectStore() {
    try { return JSON.parse(localStorage.getItem('web2apk.projects') || '{}'); } catch (_) { return {}; }
  }

  async function buildBundle(formData, priorProject) {
    const sourceType = formData.get('sourceType');
    const sourceFile = formData.get('sourceZip');
    const icon = formData.get('icon');
    const splash = formData.get('splash');
    const appName = formData.get('appName');
    const packageName = formData.get('packageName');
    const projectId = priorProject?.id || crypto.randomUUID();
    const projectToken = priorProject?.token || crypto.randomUUID();
    const buildId = crypto.randomUUID();
    const iconName = icon instanceof File && icon.size ? `icon${extension(icon)}` : null;
    const splashName = splash instanceof File && splash.size ? `splash${extension(splash)}` : null;
    const permissions = JSON.parse(formData.get('permissions') || '[]');
    const permissionMap = {
      camera:['android.permission.CAMERA'], microphone:['android.permission.RECORD_AUDIO'],
      location:['android.permission.ACCESS_COARSE_LOCATION','android.permission.ACCESS_FINE_LOCATION'],
      notifications:['android.permission.POST_NOTIFICATIONS'],
      bluetooth:['android.permission.BLUETOOTH_SCAN','android.permission.BLUETOOTH_CONNECT'],
      contacts:['android.permission.READ_CONTACTS'], phone:['android.permission.CALL_PHONE'],
      vibrate:['android.permission.VIBRATE'], mediaImages:['android.permission.READ_MEDIA_IMAGES'],
      mediaVideo:['android.permission.READ_MEDIA_VIDEO'], mediaAudio:['android.permission.READ_MEDIA_AUDIO']
    };
    const androidPermissions = new Set(['android.permission.INTERNET','android.permission.ACCESS_NETWORK_STATE']);
    permissions.forEach(key => (permissionMap[key] || []).forEach(value => androidPermissions.add(value)));
    const jobConfig = {
      schemaVersion: 2, runtime: 'github-pages', buildId, projectId,
      source: { type: sourceType, url: sourceType === 'url' ? formData.get('url') : '', zip: sourceType === 'zip' ? 'source.zip' : null },
      app: {
        name: appName, packageName, versionName: formData.get('versionName'), versionCode: Number(formData.get('versionCode')),
        minSdk: 29, compileSdk: 36, targetSdk: Number(formData.get('targetSdk')), orientation: formData.get('orientation')
      },
      design: {
        primaryColor: formData.get('primaryColor'), backgroundColor: formData.get('backgroundColor'),
        statusBarColor: formData.get('statusBarColor'), icon: iconName, splash: splashName
      },
      features: {
        permissions: [...androidPermissions], allowCleartext: asBool(formData.get('allowCleartext')),
        allowFileNetwork: asBool(formData.get('allowFileNetwork')), externalLinks: asBool(formData.get('externalLinks')),
        webViewZoom: asBool(formData.get('webViewZoom')), desktopMode: asBool(formData.get('desktopMode'))
      },
      signing: { keyAlias: 'web2apk', strategy: 'github-secret-vault' }
    };
    const entries = [{ name: 'config.json', data: encoder.encode(JSON.stringify(jobConfig, null, 2)) }];
    if (sourceType === 'zip') entries.push({ name: 'source.zip', data: sourceFile });
    if (iconName) entries.push({ name: iconName, data: icon });
    if (splashName) entries.push({ name: splashName, data: splash });
    const bundle = await createZip(entries);
    if (bundle.size > (config.maxBundleMb || 95) * 1024 * 1024) {
      throw new GitHubError(`حزمة البناء أكبر من ${config.maxBundleMb || 95}MB. قلل حجم ZIP أو الصور.`);
    }
    return { bundle, jobConfig, buildId, projectId, projectToken, appName, packageName };
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new GitHubError('تعذر قراءة حزمة البناء داخل المتصفح.'));
      reader.onload = () => resolve(String(reader.result).split(',', 2)[1] || '');
      reader.readAsDataURL(blob);
    });
  }

  async function uploadBundleBlob(bundle) {
    // uploads.github.com rejects browser CORS preflights. Git Blobs uses
    // api.github.com, supports CORS, and accepts binary content as Base64.
    const content = await blobToBase64(bundle);
    return request(`${repoPath()}/git/blobs`, {
      method: 'POST',
      json: { content, encoding: 'base64' }
    });
  }

  function saveJob(job) {
    const jobs = JSON.parse(localStorage.getItem('web2apk.pages.jobs') || '{}');
    jobs[job.id] = job;
    const keys = Object.keys(jobs).sort((a, b) => (jobs[b].createdAt || 0) - (jobs[a].createdAt || 0));
    keys.slice(20).forEach(key => delete jobs[key]);
    localStorage.setItem('web2apk.pages.jobs', JSON.stringify(jobs));
  }

  function loadJob(id) {
    try { return JSON.parse(localStorage.getItem('web2apk.pages.jobs') || '{}')[id] || null; } catch (_) { return null; }
  }

  function openQueueDb() {
    if (queueDbPromise) return queueDbPromise;
    queueDbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new GitHubError('هذا المتصفح لا يدعم حفظ عمليات البناء بلا إنترنت.'));
      const request = indexedDB.open(QUEUE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(QUEUE_STORE)) database.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new GitHubError('تعذر فتح التخزين المحلي لطلبات البناء.'));
    });
    return queueDbPromise;
  }

  async function queueOperation(mode, action) {
    const database = await openQueueDb();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(QUEUE_STORE, mode);
      const store = transaction.objectStore(QUEUE_STORE);
      const request = action(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new GitHubError('تعذر حفظ عملية البناء محلياً. قد تكون مساحة الجهاز ممتلئة.'));
    });
  }

  const queuePut = item => queueOperation('readwrite', store => store.put(item));
  const queueGet = id => queueOperation('readonly', store => store.get(id));
  const queueDelete = id => queueOperation('readwrite', store => store.delete(id));
  const queueAll = () => queueOperation('readonly', store => store.getAll());

  function rememberProject(built) {
    const projects = projectStore();
    projects[built.packageName] = { id: built.projectId, token: built.projectToken, savedAt: Date.now() };
    localStorage.setItem('web2apk.projects', JSON.stringify(projects));
  }

  function buildPayload(record, progress, stage) {
    return {
      ...record, progress, stage, accessToken: '', links: {},
      createdAt: Math.floor(record.createdAt / 1000), updatedAt: Math.floor(Date.now() / 1000)
    };
  }

  async function queueBuiltApp(built, reason = 'offline') {
    const record = {
      id: built.buildId, projectId: built.projectId, projectToken: built.projectToken,
      appName: built.appName, packageName: built.packageName, runId: null,
      createdAt: Date.now(), status: 'offline_queued', offlineReason: reason
    };
    await queuePut({ id: built.buildId, built, queuedAt: Date.now() });
    saveJob(record);
    rememberProject(built);
    window.dispatchEvent(new CustomEvent('web2apk:queue-change', { detail: { id: record.id, status: record.status } }));
    return buildPayload(record, 6, 'تم حفظ المشروع على جهازك — سيُرسل تلقائياً عند عودة الإنترنت');
  }

  async function submitBuiltApp(built) {
    const blob = await uploadBundleBlob(built.bundle);

    // Exact GitHub Repository Dispatch endpoint:
    // POST /repos/{owner}/{repo}/dispatches
    await request(`${repoPath()}/dispatches`, {
      method: 'POST',
      json: {
        event_type: 'web2apk_build',
        client_payload: {
          build_id: built.buildId,
          job_blob_sha: blob.sha
        }
      },
      raw: true
    });

    const record = {
      id: built.buildId, projectId: built.projectId, projectToken: built.projectToken,
      appName: built.appName, packageName: built.packageName, runId: null,
      jobBlobSha: blob.sha, createdAt: Date.now(), status: 'queued'
    };
    saveJob(record);
    rememberProject(built);
    await queueDelete(built.buildId).catch(() => {});
    window.dispatchEvent(new CustomEvent('web2apk:queue-change', { detail: { id: record.id, status: record.status } }));
    return buildPayload(record, 9, 'تم رفع الحزمة إلى GitHub وتشغيل Repository Dispatch');
  }

  async function createBuild(formData, priorProject) {
    const built = await buildBundle(formData, priorProject);
    if (!navigator.onLine) return queueBuiltApp(built, 'offline');
    await ensureAuth();
    try {
      return await submitBuiltApp(built);
    } catch (error) {
      if (error instanceof GitHubError && error.status === 0) return queueBuiltApp(built, 'network-error');
      throw error;
    }
  }

  async function flushQueuedBuilds() {
    if (flushingQueue || !navigator.onLine || !token || !user) return;
    flushingQueue = true;
    try {
      const items = await queueAll();
      for (const item of items) {
        try {
          await submitBuiltApp(item.built);
        } catch (error) {
          if (error instanceof GitHubError && error.status === 0) break;
          console.warn(`Queued build ${item.id} could not be submitted:`, error);
        }
      }
    } finally {
      flushingQueue = false;
    }
  }

  async function findRun(buildId) {
    const result = await request(`${repoPath()}/actions/workflows/${encodeURIComponent(config.workflow)}/runs?event=repository_dispatch&per_page=30`);
    return (result.workflow_runs || []).find(run => String(run.display_title || '').includes(buildId)) || null;
  }

  async function runStage(run) {
    if (run.status === 'queued' || run.status === 'waiting' || run.status === 'pending') return { progress: 14, stage: 'الطلب في قائمة انتظار GitHub Actions' };
    if (run.status !== 'in_progress') return { progress: 96, stage: 'انتهت خطوات GitHub Actions' };
    try {
      const result = await request(`${repoPath()}/actions/runs/${run.id}/jobs`);
      const steps = result.jobs?.[0]?.steps || [];
      const current = steps.find(step => step.status === 'in_progress')?.name || '';
      const completed = steps.filter(step => step.status === 'completed').length;
      const total = Math.max(steps.length, 1);
      let progress = Math.max(20, Math.min(94, Math.round(18 + completed / total * 76)));
      let stage = current ? `GitHub Actions: ${current}` : 'جارٍ تجهيز بيئة البناء';
      if (/Prepare Android/i.test(current)) { progress = 38; stage = 'جارٍ فحص الموقع وتجهيز مشروع Android'; }
      if (/keystore/i.test(current)) { progress = 49; stage = 'جارٍ تجهيز مفتاح توقيع المشروع'; }
      if (/Build signed/i.test(current)) { progress = 68; stage = 'جارٍ تجميع وتوقيع APK وAAB'; }
      if (/Verify/i.test(current)) { progress = 86; stage = 'جارٍ التحقق من توقيع APK'; }
      if (/Publish/i.test(current)) { progress = 94; stage = 'جارٍ نشر روابط التنزيل الخاصة'; }
      return { progress, stage };
    } catch (_) { return { progress: 50, stage: 'GitHub Actions يبني التطبيق الآن' }; }
  }

  function assetLink(asset) {
    if (!asset) return null;
    const direct = /\.(?:apk|aab)$/i.test(asset.name);
    return { url: asset.url, browserUrl: asset.browser_download_url, name: asset.name, size: asset.size, direct };
  }

  async function completedBuild(record, run) {
    const release = await request(`${repoPath()}/releases/tags/build-${encodeURIComponent(record.id)}`);
    const assets = release.assets || [];
    const apk = assets.find(asset => asset.name.endsWith('.apk'));
    const aab = assets.find(asset => asset.name.endsWith('.aab'));
    const signing = assets.find(asset => asset.name === 'signing-backup.zip');
    const log = assets.find(asset => asset.name === 'build.log');
    record.status = 'completed'; record.releaseId = release.id; saveJob(record);
    return {
      ...record, status: 'completed', progress: 100, stage: 'اكتمل البناء والتوقيع بنجاح',
      error: null, accessToken: '', updatedAt: Math.floor(Date.now() / 1000),
      links: { apk: assetLink(apk), aab: assetLink(aab), signing: assetLink(signing), log: assetLink(log), run: run.html_url }
    };
  }

  async function getBuild(id) {
    let record = loadJob(id);
    if (!record) throw new GitHubError('لم نجد بيانات عملية البناء على هذا الجهاز.');

    if (record.status === 'offline_queued') {
      if (!navigator.onLine) {
        return buildPayload(record, 6, 'المشروع محفوظ محلياً — في انتظار عودة الإنترنت');
      }
      if (!token || !user) {
        return buildPayload(record, 7, 'عاد الإنترنت — اربط GitHub لإرسال عملية البناء المحفوظة');
      }
      await flushQueuedBuilds();
      record = loadJob(id) || record;
      if (record.status === 'offline_queued') return buildPayload(record, 7, 'جارٍ إرسال عملية البناء المحفوظة');
    }

    if (!navigator.onLine) {
      return buildPayload(record, Math.max(10, record.progress || 10), 'الواجهة تعمل بلا إنترنت — سنستأنف متابعة GitHub عند الاتصال');
    }
    await ensureAuth();
    let run = record.runId ? await request(`${repoPath()}/actions/runs/${record.runId}`) : await findRun(id);
    if (!run) return { ...record, status: 'queued', progress: 12, stage: 'ننتظر ظهور Workflow في GitHub Actions', links: {}, accessToken: '' };
    if (!record.runId) { record.runId = run.id; saveJob(record); }
    if (run.status === 'completed') {
      if (run.conclusion === 'success') return completedBuild(record, run);
      record.status = 'failed'; saveJob(record);
      return {
        ...record, status: 'failed', progress: 0, stage: 'فشل بناء التطبيق',
        error: `انتهى GitHub Actions بالحالة: ${run.conclusion || 'failed'}. افتح سجل Workflow لمعرفة الخطوة المتسببة.`,
        accessToken: '', links: { run: run.html_url }, updatedAt: Math.floor(Date.now() / 1000)
      };
    }
    const stage = await runStage(run);
    return { ...record, status: run.status === 'in_progress' ? 'building' : 'queued', ...stage, accessToken: '', links: { run: run.html_url }, updatedAt: Math.floor(Date.now() / 1000) };
  }

  async function downloadAsset(link) {
    if (!link?.url) throw new GitHubError('ملف التنزيل غير متاح');
    await ensureAuth();
    const response = await request(link.url, { accept: 'application/octet-stream', raw: true });
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl; anchor.download = link.name || 'download'; anchor.style.display = 'none';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  function bindDownload(anchor, link) {
    if (!anchor || !link) return;
    if (link.direct && link.browserUrl) {
      // Let GitHub's Content-Disposition response enter the browser download list.
      // No fetch to api.github.com is made when the user taps APK/AAB.
      anchor.href = link.browserUrl;
      anchor.download = link.name || '';
      anchor.rel = 'noreferrer';
      anchor.onclick = null;
      return;
    }
    anchor.href = '#';
    anchor.onclick = async event => {
      event.preventDefault();
      const original = anchor.firstChild?.textContent || anchor.textContent;
      anchor.classList.add('downloading');
      try { await downloadAsset(link); }
      catch (error) { alert(error.message); }
      finally { anchor.classList.remove('downloading'); if (anchor.firstChild) anchor.firstChild.textContent = original; }
    };
  }

  async function health() {
    if (String(config.owner).startsWith('__')) return { ok: false, configured: false, message: 'لم يتم ضبط اسم مالك مستودع GitHub في runtime-config.js.' };
    return { ok: true, configured: true, connected: Boolean(token), owner: config.owner, repository: config.repository };
  }

  bindAuthUi();
  restoreStoredToken();
  window.addEventListener('online', async () => {
    if ((!token || !user) && localStorage.getItem(TOKEN_STORAGE_KEY)) await restoreStoredToken();
    flushQueuedBuilds().catch(error => console.warn('Queue flush failed:', error));
  });
  window.Web2APKPages = Object.freeze({
    config, ensureAuth, connectWithToken, disconnect, createBuild, getBuild, bindDownload, downloadAsset, health,
    flushQueuedBuilds, queueAll,
    isConnected: () => Boolean(token && user), getUser: () => user
  });
})();
