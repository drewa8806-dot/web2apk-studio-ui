(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const API = '';
  const pagesRuntime = window.Web2APKPages || null;
  const form = $('#builderForm');
  const panels = $$('.panel');
  const stepButtons = $$('.step');
  const prevButton = $('#prevButton');
  const nextButton = $('#nextButton');
  const wizardActions = $('.wizard-actions');
  const toast = $('#toast');
  let currentStep = 1;
  let maxStep = 1;
  let sourceType = 'url';
  let pollingTimer = null;
  let activeBuild = null;

  function notify(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function setStep(step) {
    currentStep = Math.max(1, Math.min(4, step));
    maxStep = Math.max(maxStep, currentStep);
    panels.forEach(panel => panel.classList.toggle('active', Number(panel.dataset.panel) === currentStep));
    stepButtons.forEach(button => {
      const n = Number(button.dataset.step);
      button.classList.toggle('active', n === currentStep);
      button.classList.toggle('done', n < currentStep);
    });
    prevButton.classList.toggle('hidden', currentStep === 1);
    nextButton.classList.toggle('hidden', currentStep === 4);
    if (currentStep === 4) renderReview();
    window.scrollTo({ top: Math.max(0, $('.studio-layout').offsetTop - 20), behavior: 'smooth' });
  }

  function validateStep(step) {
    if (step === 1) {
      if (sourceType === 'url') {
        const input = $('#url');
        try {
          const parsed = new URL(input.value.trim());
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
        } catch (_) {
          input.focus();
          notify('اكتب رابطاً صحيحاً يبدأ بـ https:// أو http://');
          return false;
        }
      } else if (!$('#sourceZip').files[0]) {
        notify('اختر ملف ZIP أولاً');
        $('#dropZone').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
    }
    if (step === 2) {
      for (const id of ['appName', 'packageName', 'versionName', 'versionCode']) {
        const input = $('#' + id);
        if (!input.checkValidity()) {
          input.reportValidity();
          return false;
        }
      }
      if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test($('#packageName').value.trim())) {
        $('#packageName').focus();
        notify('اسم الحزمة غير صالح؛ استخدم مثال com.company.app');
        return false;
      }
    }
    return true;
  }

  nextButton.addEventListener('click', () => {
    if (validateStep(currentStep)) setStep(currentStep + 1);
  });
  prevButton.addEventListener('click', () => setStep(currentStep - 1));
  stepButtons.forEach(button => button.addEventListener('click', () => {
    const target = Number(button.dataset.step);
    if (target <= maxStep || target < currentStep) {
      if (target < currentStep || validateStep(currentStep)) setStep(target);
    }
  }));

  $$('.source-tab').forEach(tab => tab.addEventListener('click', () => {
    sourceType = tab.dataset.source;
    $('#sourceType').value = sourceType;
    $$('.source-tab').forEach(item => item.classList.toggle('active', item === tab));
    $('#urlSource').classList.toggle('hidden', sourceType !== 'url');
    $('#zipSource').classList.toggle('hidden', sourceType !== 'zip');
  }));

  const zipInput = $('#sourceZip');
  const dropZone = $('#dropZone');
  function describeZip(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      notify('يجب اختيار ملف بصيغة ZIP');
      zipInput.value = '';
      return;
    }
    const maxSourceMb = pagesRuntime?.config?.maxSourceMb || 70;
    if (file.size > maxSourceMb * 1024 * 1024) {
      notify(`حجم ZIP أكبر من ${maxSourceMb}MB`);
      zipInput.value = '';
      return;
    }
    $('#zipFileName').textContent = `${file.name} — ${(file.size / 1024 / 1024).toFixed(1)} MB`;
  }
  zipInput.addEventListener('change', () => describeZip(zipInput.files[0]));
  ['dragenter', 'dragover'].forEach(name => dropZone.addEventListener(name, event => {
    event.preventDefault(); dropZone.classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach(name => dropZone.addEventListener(name, event => {
    event.preventDefault(); dropZone.classList.remove('dragging');
  }));
  dropZone.addEventListener('drop', event => {
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const transfer = new DataTransfer(); transfer.items.add(file); zipInput.files = transfer.files;
    describeZip(file);
  });

  $('#testUrl').addEventListener('click', () => {
    try {
      const parsed = new URL($('#url').value.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      window.open(parsed.href, '_blank', 'noopener,noreferrer');
    } catch (_) { notify('أدخل رابطاً صحيحاً أولاً'); }
  });

  function setPhoneMode(mode) {
    $('#phoneSplashPreview').classList.toggle('hidden', mode !== 'splash');
    $('#phoneIconPreview').classList.toggle('hidden', mode !== 'icon');
    $$('.phone-preview-controls button').forEach(button => button.classList.toggle('active', button.dataset.phoneMode === mode));
  }

  function openPhonePreview(mode) {
    setPhoneMode(mode);
    if (window.matchMedia('(max-width: 1080px)').matches) document.body.classList.add('phone-preview-open');
  }

  function setSplashPreviewBackground(image) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 24; canvas.height = 24;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, 24, 24);
      const data = context.getImageData(0, 0, 24, 24).data;
      const points = [[1,1],[22,1],[1,22],[22,22],[12,1],[12,22]];
      let red = 0, green = 0, blue = 0;
      points.forEach(([x,y]) => { const index = (y * 24 + x) * 4; red += data[index]; green += data[index+1]; blue += data[index+2]; });
      $('#phoneSplashPreview').style.backgroundColor = `rgb(${Math.round(red/points.length)},${Math.round(green/points.length)},${Math.round(blue/points.length)})`;
    } catch (_) { $('#phoneSplashPreview').style.backgroundColor = $('#backgroundColor').value; }
  }

  function applyFullBleedIconPreview(sourceUrl) {
    const image = new Image();
    image.onload = () => {
      try {
        const source = document.createElement('canvas');
        source.width = image.naturalWidth; source.height = image.naturalHeight;
        const sourceContext = source.getContext('2d', { willReadFrequently: true });
        sourceContext.drawImage(image, 0, 0);
        const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
        let left = source.width, top = source.height, right = -1, bottom = -1;
        for (let y = 0; y < source.height; y++) {
          for (let x = 0; x < source.width; x++) {
            if (pixels[(y * source.width + x) * 4 + 3] > 12) {
              left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
            }
          }
        }
        if (right < left) throw new Error('empty image');
        const edgeColors = [];
        const edgeSize = Math.max(2, Math.round(Math.min(right-left, bottom-top) * 0.08));
        for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
          const index = (y * source.width + x) * 4;
          if (pixels[index+3] > 160 && (x-left < edgeSize || right-x < edgeSize || y-top < edgeSize || bottom-y < edgeSize)) {
            edgeColors.push([pixels[index], pixels[index+1], pixels[index+2]]);
          }
        }
        edgeColors.sort((a,b) => (a[0]+a[1]+a[2]) - (b[0]+b[1]+b[2]));
        const edge = edgeColors[Math.floor(edgeColors.length / 2)] || [108,99,255];
        const output = document.createElement('canvas'); output.width = 512; output.height = 512;
        const outputContext = output.getContext('2d');
        outputContext.fillStyle = `rgb(${edge[0]},${edge[1]},${edge[2]})`;
        outputContext.fillRect(0, 0, 512, 512);
        outputContext.drawImage(source, left, top, right-left+1, bottom-top+1, 0, 0, 512, 512);
        const url = output.toDataURL('image/png');
        for (const element of [$('#iconPreview'), $('#tinyIcon'), $('#previewLogo'), $('#launcherIcon')]) {
          element.style.backgroundImage = `url("${url}")`; element.textContent = '';
        }
      } catch (_) {
        for (const element of [$('#iconPreview'), $('#tinyIcon'), $('#previewLogo'), $('#launcherIcon')]) {
          element.style.backgroundImage = `url("${sourceUrl}")`; element.textContent = '';
        }
      }
    };
    image.src = sourceUrl;
  }

  function imagePreview(input, preview, filename) {
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { notify('حجم الصورة أكبر من 10MB'); input.value = ''; return; }
      const url = URL.createObjectURL(file);
      preview.style.backgroundImage = `url("${url}")`;
      preview.textContent = '';
      filename.textContent = file.name;
      if (input.id === 'icon') {
        applyFullBleedIconPreview(url);
        setPhoneMode('icon');
      } else {
        const image = $('#phoneSplashImage');
        image.onload = () => setSplashPreviewBackground(image);
        image.src = url;
        $('#phoneSplashFallback').classList.add('hidden');
        setPhoneMode('splash');
      }
    });
  }
  imagePreview($('#icon'), $('#iconPreview'), $('#iconFileName'));
  imagePreview($('#splash'), $('#splashPreview'), $('#splashFileName'));
  $$('.phone-preview-controls button').forEach(button => button.addEventListener('click', () => setPhoneMode(button.dataset.phoneMode)));
  $('#previewIconButton').addEventListener('click', () => openPhonePreview('icon'));
  $('#previewSplashButton').addEventListener('click', () => openPhonePreview('splash'));
  $('#closePhonePreview').addEventListener('click', () => document.body.classList.remove('phone-preview-open'));

  $('#appName').addEventListener('input', event => {
    const value = event.target.value.trim() || 'تطبيقي';
    $('#previewTitle').textContent = value;
    $('#previewSiteTitle').textContent = value;
    $('#launcherAppName').textContent = value;
    const letter = value[0] || 'W';
    if (!$('#icon').files[0]) {
      $('#iconPreview').textContent = letter;
      $('#tinyIcon').textContent = letter;
      $('#previewLogo').textContent = letter;
      $('#launcherIcon').textContent = letter;
    }
  });

  [['primaryColorPicker','primaryColor'],['backgroundColorPicker','backgroundColor'],['statusBarColorPicker','statusBarColor']].forEach(([pickerId, textId]) => {
    const picker = $('#' + pickerId), text = $('#' + textId);
    picker.addEventListener('input', () => { text.value = picker.value.toUpperCase(); updateColors(); });
    text.addEventListener('input', () => {
      if (/^#[0-9a-f]{6}$/i.test(text.value)) { picker.value = text.value; updateColors(); }
    });
  });
  function updateColors() {
    const primary = $('#primaryColor').value;
    const background = $('#backgroundColor').value;
    const status = $('#statusBarColor').value;
    document.documentElement.style.setProperty('--primary', primary);
    $('#phoneScreen').style.backgroundColor = background;
    $('#previewBar').style.backgroundColor = status;
    $('.android-status').style.backgroundColor = status;
  }

  const permissionNames = {
    camera:'الكاميرا', microphone:'الميكروفون', location:'الموقع', notifications:'الإشعارات',
    bluetooth:'Bluetooth', contacts:'جهات الاتصال', phone:'المكالمات', vibrate:'الاهتزاز',
    mediaImages:'الصور', mediaVideo:'الفيديو', mediaAudio:'الصوت'
  };
  function selectedPermissions() {
    return $$('#permissionsGrid input:checked').map(input => input.value);
  }

  function renderReview() {
    const source = sourceType === 'url' ? ($('#url').value || '—') : ($('#sourceZip').files[0]?.name || '—');
    const permissions = selectedPermissions();
    $('#reviewCard').innerHTML = `
      <div class="review-item"><i>⌁</i><span><b>المصدر</b><small dir="ltr">${escapeHtml(source)}</small></span></div>
      <div class="review-item"><i>✦</i><span><b>اسم التطبيق</b><small>${escapeHtml($('#appName').value)}</small></span></div>
      <div class="review-item"><i>◈</i><span><b>اسم الحزمة</b><small dir="ltr">${escapeHtml($('#packageName').value)}</small></span></div>
      <div class="review-item"><i>✓</i><span><b>دعم أندرويد</b><small dir="ltr">Android 10—17 · target ${escapeHtml($('#targetSdk').value)}</small></span></div>
      <div class="review-item"><i>⌕</i><span><b>عرض WebView</b><small>${$('#desktopMode').checked ? 'وضع الكمبيوتر' : 'وضع الهاتف'} · ${$('#webViewZoom').checked ? 'التكبير مفعّل' : 'التكبير متوقف'}</small></span></div>
      <div class="review-item" style="grid-column:1/-1"><i>⌾</i><span><b>الأذونات المختارة</b><span class="permission-tags">${permissions.length ? permissions.map(p => `<i>${escapeHtml(permissionNames[p])}</i>`).join('') : '<small>الإنترنت فقط</small>'}</span></span></div>`;
  }

  function storedProjects() {
    try { return JSON.parse(localStorage.getItem('web2apk.projects') || '{}'); } catch (_) { return {}; }
  }
  function saveProject(packageName, id, token) {
    const projects = storedProjects();
    projects[packageName] = { id, token, savedAt: Date.now() };
    localStorage.setItem('web2apk.projects', JSON.stringify(projects));
  }

  function setProgress(value, stage) {
    value = Math.max(0, Math.min(100, Number(value) || 0));
    $('#progressBar').style.width = value + '%';
    $('#progressNumber').textContent = value + '%';
    $('#buildStage').textContent = stage || 'جارٍ البناء...';
    const marks = $$('.build-timeline span');
    const activeCount = value < 15 ? 1 : value < 42 ? 2 : value < 88 ? 3 : 4;
    marks.forEach((mark, index) => mark.classList.toggle('active', index < activeCount));
  }

  function showBuildModal(view = 'building') {
    $('#buildModal').classList.remove('hidden');
    $('#buildingView').classList.toggle('hidden', view !== 'building');
    $('#successView').classList.toggle('hidden', view !== 'success');
    $('#failedView').classList.toggle('hidden', view !== 'failed');
  }

  function absoluteLink(link) { return link ? new URL(link, location.href).href : '#'; }

  function configureDownload(anchor, link) {
    if (!link) return;
    if (pagesRuntime && typeof link === 'object') pagesRuntime.bindDownload(anchor, link);
    else anchor.href = absoluteLink(link);
  }

  function handleBuild(build, projectToken) {
    activeBuild = build;
    const remembered = storedProjects()[build.packageName];
    projectToken = projectToken || remembered?.token;
    if (build.status === 'completed') {
      clearTimeout(pollingTimer);
      showBuildModal('success');
      configureDownload($('#downloadApk'), build.links.apk);
      $('#downloadAab').classList.toggle('hidden', !build.links.aab);
      if (build.links.aab) configureDownload($('#downloadAab'), build.links.aab);
      $('#downloadSigning').classList.toggle('hidden', !build.links.signing);
      if (build.links.signing) configureDownload($('#downloadSigning'), build.links.signing);
      localStorage.removeItem('web2apk.activeBuild');
      return;
    }
    if (build.status === 'failed') {
      clearTimeout(pollingTimer);
      showBuildModal('failed');
      $('#failureMessage').textContent = build.error || build.stage || 'حدث خطأ غير متوقع أثناء البناء.';
      const diagnostic = build.links?.log || build.links?.run;
      $('#downloadLog').classList.toggle('hidden', !diagnostic);
      if (build.links?.log) configureDownload($('#downloadLog'), build.links.log);
      else if (build.links?.run) {
        $('#downloadLog').href = build.links.run;
        $('#downloadLog').target = '_blank';
        $('#downloadLog').textContent = 'فتح سجل GitHub Actions';
      }
      localStorage.removeItem('web2apk.activeBuild');
      return;
    }
    showBuildModal('building');
    setProgress(build.progress, build.stage);
    localStorage.setItem('web2apk.activeBuild', JSON.stringify({
      id: build.id, token: pagesRuntime ? '' : build.accessToken, packageName: build.packageName, updatedAt: Date.now()
    }));
    pollingTimer = setTimeout(() => pollBuild(build.id, build.accessToken, projectToken), pagesRuntime ? 6500 : 4500);
  }

  async function pollBuild(id, token, projectToken) {
    try {
      const result = pagesRuntime
        ? await pagesRuntime.getBuild(id)
        : await fetch(`${API}/api/builds/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`, { cache: 'no-store' }).then(response => {
            if (!response.ok) throw new Error('تعذر جلب حالة البناء');
            return response.json();
          });
      handleBuild(result, projectToken);
    } catch (error) {
      $('#buildStage').textContent = error?.status === 401
        ? 'أعد ربط GitHub لمتابعة العملية.'
        : 'انقطع الاتصال مؤقتاً؛ سنحاول مرة أخرى...';
      pollingTimer = setTimeout(() => pollBuild(id, token, projectToken), 9000);
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!validateStep(1) || !validateStep(2)) return;
    if (!$('#agreement').checked) { notify('يرجى تأكيد ملكية المحتوى وضرورة الأذونات'); return; }
    const buildButton = $('#buildButton');
    buildButton.disabled = true;
    showBuildModal('building');
    setProgress(4, pagesRuntime
      ? (navigator.onLine ? 'جارٍ تجهيز الحزمة الخاصة ورفعها إلى GitHub...' : 'جارٍ تجهيز الحزمة وحفظها محلياً على جهازك...')
      : 'جارٍ رفع البيانات إلى الخادم...');

    const data = new FormData();
    const values = {
      sourceType, appName: $('#appName').value.trim(), packageName: $('#packageName').value.trim().toLowerCase(),
      versionName: $('#versionName').value.trim(), versionCode: $('#versionCode').value,
      url: sourceType === 'url' ? $('#url').value.trim() : '', permissions: JSON.stringify(selectedPermissions()),
      orientation: $('#orientation').value, primaryColor: $('#primaryColor').value.toUpperCase(),
      backgroundColor: $('#backgroundColor').value.toUpperCase(), statusBarColor: $('#statusBarColor').value.toUpperCase(),
      targetSdk: $('#targetSdk').value, externalLinks: $('#externalLinks').checked,
      webViewZoom: $('#webViewZoom').checked, desktopMode: $('#desktopMode').checked,
      allowFileNetwork: $('#allowFileNetwork').checked, allowCleartext: $('#allowCleartext').checked
    };
    Object.entries(values).forEach(([key, value]) => data.append(key, String(value)));
    if (sourceType === 'zip') data.append('sourceZip', $('#sourceZip').files[0]);
    if ($('#icon').files[0]) data.append('icon', $('#icon').files[0]);
    if ($('#splash').files[0]) data.append('splash', $('#splash').files[0]);
    const previousProject = storedProjects()[values.packageName];
    if (previousProject) {
      data.append('projectId', previousProject.id);
      data.append('projectToken', previousProject.token);
    }

    try {
      let result;
      if (pagesRuntime) {
        result = await pagesRuntime.createBuild(data, previousProject);
      } else {
        const response = await fetch(`${API}/api/builds`, { method: 'POST', body: data });
        result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.detail || 'تعذر بدء عملية البناء');
      }
      if (result.projectToken) saveProject(result.packageName, result.projectId, result.projectToken);
      handleBuild(result, result.projectToken || previousProject?.token);
    } catch (error) {
      showBuildModal('failed');
      $('#failureMessage').textContent = error.message || 'تعذر الاتصال بـ GitHub.';
    } finally { buildButton.disabled = false; }
  });

  $('#modalClose').addEventListener('click', () => $('#buildModal').classList.add('hidden'));
  $('#retryButton').addEventListener('click', () => $('#buildModal').classList.add('hidden'));
  $('#newBuild').addEventListener('click', () => { $('#buildModal').classList.add('hidden'); location.reload(); });

  async function checkHealth() {
    const notice = $('#serverNotice');
    if (pagesRuntime) {
      const health = await pagesRuntime.health();
      notice.classList.remove('hidden');
      if (!health.configured) {
        notice.textContent = health.message;
      } else if (!navigator.onLine) {
        notice.classList.remove('serverless-badge');
        notice.classList.add('offline-queue-note');
        notice.textContent = 'وضع Offline فعّال: الواجهة والمعاينة والملفات محلية بالكامل. يمكنك تجهيز طلب البناء الآن وسيُحفظ على جهازك حتى عودة الإنترنت.';
      } else {
        notice.classList.remove('offline-queue-note');
        notice.classList.add('serverless-badge');
        notice.textContent = `وضع Serverless فعّال: تُرسل الحزم مباشرةً إلى ${health.owner}/${health.repository} وتُبنى عبر GitHub Actions. الواجهة نفسها متاحة بلا إنترنت.`;
      }
      return;
    }
    try {
      const response = await fetch(`${API}/api/health`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const health = await response.json();
      if (!health.builderConfigured) {
        notice.textContent = 'الخادم يعمل، لكن GitHub Actions غير مضبوط بعد. أضف GITHUB_TOKEN وGITHUB_REPOSITORY قبل إنشاء APK فعلي.';
        notice.classList.remove('hidden');
      }
    } catch (_) {
      notice.textContent = 'تعذر الاتصال بخادم البناء حالياً. تأكد من تشغيل الواجهة الخلفية.';
      notice.classList.remove('hidden');
    }
  }

  function resumeBuild() {
    try {
      const item = JSON.parse(localStorage.getItem('web2apk.activeBuild') || 'null');
      if (!item || Date.now() - item.updatedAt > 24 * 60 * 60 * 1000) return;
      notify('تم العثور على عملية بناء سابقة؛ جارٍ استعادة حالتها');
      showBuildModal('building');
      pollBuild(item.id, item.token, storedProjects()[item.packageName]?.token);
    } catch (_) { localStorage.removeItem('web2apk.activeBuild'); }
  }

  checkHealth();
  window.addEventListener('web2apk:network', checkHealth);
  setTimeout(resumeBuild, 2300);
})();
