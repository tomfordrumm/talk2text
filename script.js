document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const tabRecord = document.getElementById('tab-record');
  const tabFile = document.getElementById('tab-file');
  const panelRecord = document.getElementById('panel-record');
  const panelFile = document.getElementById('panel-file');

  const btnRecord = document.getElementById('btn-record');
  const audioPlayer = document.getElementById('audio-player');
  const recordingError = document.getElementById('recording-error');
  const recordTimer = document.getElementById('record-timer');
  const recordPulse = document.getElementById('record-pulse');
  const recordHint = document.getElementById('record-hint');
  const recordWarning = document.getElementById('record-warning');

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const fileNameEl = document.getElementById('file-name');
  const fileErrorEl = document.getElementById('file-error');
  const filePlayer = document.getElementById('file-player');

  const btnRun = document.getElementById('btn-run');
  const resultEl = document.getElementById('result');
  const btnCopy = document.getElementById('btn-copy');
  const btnDownload = document.getElementById('btn-download');

  const btnSettings = document.getElementById('btn-settings');
  const modal = document.getElementById('modal');
  const modalOverlay = modal.querySelector('[data-overlay]');
  const modalTitle = document.getElementById('modal-title');
  const modalSave = document.getElementById('modalSave');
  const modalCancel = document.getElementById('modalCancel');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const toggleApiKey = document.getElementById('toggleApiKey');
  const toggleApiKeyIcon = document.getElementById('toggleApiKeyIcon');
  const rememberChk = document.getElementById('remember');
  const settingsFields = document.getElementById('settingsFields');
  const modelSelect = document.getElementById('modelSelect');
  const responseFormatSelect = document.getElementById('responseFormat');
  const languageSelect = document.getElementById('languageSelect');
  const promptInput = document.getElementById('promptInput');

  // State
  let mediaRecorder = null;
  let chunks = [];
  let recordedFile = null;
  let pickedFile = null;
  let currentStream = null;
  let pendingRunAfterKey = false;
  let timerInterval = null;
  let elapsedSec = 0;

  const MAX_SIZE = 25 * 1024 * 1024;
  const ACCEPT_EXT = ['.wav', '.mp3', '.m4a', '.ogg'];
  const API_KEY_STORAGE = 'openai_api_key';
  const DEFAULT_MODEL = 'gpt-4o-transcribe';
  const DEFAULT_FORMAT = 'text';
  const MIC_PERMISSION_KEY = 'mic_permission_granted';
  const MIC_DEVICE_ID_KEY = 'mic_device_id';

  // Permissions state (best-effort; browsers vary)
  let micPermission = 'unknown'; // 'granted' | 'denied' | 'prompt' | 'unknown'

  // Tabs
  function selectTab(which) {
    const record = which === 'record';
    tabRecord.setAttribute('aria-selected', record ? 'true' : 'false');
    tabFile.setAttribute('aria-selected', record ? 'false' : 'true');
    tabRecord.setAttribute('data-selected', record ? 'true' : 'false');
    tabFile.setAttribute('data-selected', record ? 'false' : 'true');
    panelRecord.classList.toggle('hidden', !record);
    panelFile.classList.toggle('hidden', record);
    panelFile.setAttribute('aria-hidden', record ? 'true' : 'false');

    if (record) {
      // clear file selection
      clearFileSelection();
    } else {
      // stop any recording
      stopRecording();
      resetRecordingPreview();
    }
    updateRunAvailability();
  }
  tabRecord.addEventListener('click', () => selectTab('record'));
  tabFile.addEventListener('click', () => selectTab('file'));

  // Pre-check microphone permission (non-blocking)
  (async function precheckMicPermission() {
    try {
      if ('permissions' in navigator && navigator.permissions?.query) {
        const status = await navigator.permissions.query({ name: 'microphone' });
        micPermission = status.state; // granted | denied | prompt
        status.onchange = () => { micPermission = status.state; };
        if (micPermission === 'granted') {
          try { localStorage.setItem(MIC_PERMISSION_KEY, '1'); } catch {}
        }
      } else {
        // Fallback: remember prior grant in localStorage (Safari)
        micPermission = localStorage.getItem(MIC_PERMISSION_KEY) ? 'granted' : 'unknown';
      }
    } catch {}
  })();

  // Recording
  btnRecord.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording();
      return;
    }
    await startRecording();
  });
  // No re-record button; user taps mic again to overwrite

  async function startRecording() {
    hideRecordingError();
    try {
      // If there is an existing preview, hide it before starting a new take
      if (recordedFile || !audioPlayer.classList.contains('hidden')) {
        resetRecordingPreview();
      }
      if (!window.isSecureContext) {
        return showRecordingError('Нужен HTTPS или localhost для записи.');
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        return showRecordingError('Браузер не поддерживает доступ к микрофону.');
      }
      if (typeof MediaRecorder === 'undefined') {
        return showRecordingError('MediaRecorder не поддерживается в этом браузере.');
      }
      // Prefer previously granted device if available
      let constraints = { audio: true };
      const savedId = localStorage.getItem(MIC_DEVICE_ID_KEY);
      if (savedId) {
        constraints = { audio: { deviceId: { exact: savedId } } };
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        // If deviceId was invalid or not found, retry with generic audio
        if (savedId) {
          try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
          catch (e2) { throw e2; }
        } else {
          throw e;
        }
      }
      currentStream = stream;
      chunks = [];
      recordedFile = null;
      pickedFile = null;
      updateRunAvailability();

      // Mark permission as granted and remember device id when possible
      try {
        const track = stream.getAudioTracks?.()[0];
        const settings = track?.getSettings?.() || {};
        if (settings.deviceId) {
          try { localStorage.setItem(MIC_DEVICE_ID_KEY, settings.deviceId); } catch {}
        }
        try { localStorage.setItem(MIC_PERMISSION_KEY, '1'); } catch {}
      } catch {}

      const mime = getPreferredMimeType();
      try { mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
      catch { mediaRecorder = new MediaRecorder(stream); }

      mediaRecorder.addEventListener('dataavailable', (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      });
      mediaRecorder.addEventListener('stop', () => {
        const type = (chunks[0] && chunks[0].type) || mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });
        const ext = mimeToExt(type);
        recordedFile = new File([blob], `recording.${ext}`, { type });
        showRecordingPreview(URL.createObjectURL(recordedFile));
        chunks = [];
        updateRunAvailability();
      });
      mediaRecorder.start();
      setRecordingUI(true);
    } catch (err) {
      console.error(err);
      showRecordingError('Не удалось начать запись. Проверьте разрешения.');
    }
  }
  function stopRecording() {
    try { if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop(); } catch {}
    try { currentStream?.getTracks().forEach(t => t.stop()); } catch {}
    currentStream = null;
    setRecordingUI(false);
  }
  function showRecordingPreview(url) {
    audioPlayer.classList.remove('hidden');
    audioPlayer.src = url;
    updateRecordWarning();
  }
  function resetRecordingPreview() {
    recordedFile = null;
    audioPlayer.src = '';
    audioPlayer.classList.add('hidden');
    if (recordWarning) recordWarning.classList.add('hidden');
    // Reset hints
    recordHint.textContent = 'Нажмите, чтобы начать запись';
    recordTimer.classList.add('hidden');
    stopTimer();
    // Reset button state
    btnRecord.classList.remove('bg-red-600','hover:bg-red-700');
    btnRecord.classList.add('bg-indigo-600','hover:bg-indigo-700');
    btnRecord.setAttribute('aria-label','Начать запись');
    btnRecord.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    recordPulse.classList.add('hidden');
    updateRunAvailability();
  }
  function showRecordingError(msg) {
    recordingError.textContent = msg;
    recordingError.classList.remove('hidden');
  }
  function hideRecordingError() {
    recordingError.classList.add('hidden');
  }
  function setRecordingUI(isRecording) {
    if (isRecording) {
      btnRecord.classList.remove('bg-indigo-600','hover:bg-indigo-700');
      btnRecord.classList.add('bg-red-600','hover:bg-red-700');
      btnRecord.setAttribute('aria-label','Остановить запись');
      btnRecord.innerHTML = '<i class="fa-solid fa-stop"></i>';
      recordPulse.classList.remove('hidden');
      recordHint.textContent = 'Нажмите, чтобы остановить';
      elapsedSec = 0;
      recordTimer.textContent = '00:00';
      recordTimer.classList.remove('hidden');
      startTimer();
      if (recordWarning) recordWarning.classList.add('hidden');
    } else {
      btnRecord.classList.remove('bg-red-600','hover:bg-red-700');
      btnRecord.classList.add('bg-indigo-600','hover:bg-indigo-700');
      btnRecord.setAttribute('aria-label','Начать запись');
      btnRecord.innerHTML = '<i class="fa-solid fa-microphone"></i>';
      recordPulse.classList.add('hidden');
      recordHint.textContent = 'Нажмите, чтобы начать запись';
      stopTimer();
      updateRecordWarning();
    }
  }
  function updateRecordWarning() {
    const isRec = mediaRecorder && mediaRecorder.state === 'recording';
    if (!recordWarning) return;
    if (recordedFile && !isRec) {
      recordWarning.classList.remove('hidden');
    } else {
      recordWarning.classList.add('hidden');
    }
  }
  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      elapsedSec += 1;
      const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
      const ss = String(elapsedSec % 60).padStart(2, '0');
      recordTimer.textContent = `${mm}:${ss}`;
    }, 1000);
  }
  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // File pick / drop
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('ring-2','ring-indigo-500'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('ring-2','ring-indigo-500'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('ring-2','ring-indigo-500');
    if (!e.dataTransfer?.files?.length) return;
    const file = e.dataTransfer.files[0];
    handlePickedFile(file);
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handlePickedFile(file);
  });

  function handlePickedFile(file) {
    clearFileErrors();
    if (!validateFile(file)) return;
    pickedFile = file;
    recordedFile = null; // override recorded if any
    fileNameEl.textContent = `${file.name} • ${(file.size / (1024*1024)).toFixed(2)} МБ`;
    const url = URL.createObjectURL(file);
    filePlayer.src = url;
    filePlayer.classList.remove('hidden');
    // ensure file tab is visible
    selectTab('file');
    updateRunAvailability();
  }
  function validateFile(file) {
    const name = file.name.toLowerCase();
    const okExt = ACCEPT_EXT.some(ext => name.endsWith(ext));
    if (!okExt) {
      fileErrorEl.textContent = 'Неверный формат. Допустимо: WAV, MP3, M4A, OGG.';
      fileErrorEl.classList.remove('hidden');
      return false;
    }
    if (file.size > MAX_SIZE) {
      fileErrorEl.textContent = 'Файл слишком большой. Максимум 25 МБ.';
      fileErrorEl.classList.remove('hidden');
      return false;
    }
    return true;
  }
  function clearFileSelection() {
    pickedFile = null;
    try { fileInput.value = ''; } catch {}
    filePlayer.src = '';
    filePlayer.classList.add('hidden');
    fileNameEl.textContent = '';
    clearFileErrors();
    // Also ensure recording UI reset when returning back
    resetRecordingPreview();
    updateRunAvailability();
  }
  function clearFileErrors() { fileErrorEl.classList.add('hidden'); fileErrorEl.textContent = ''; }

  // Run transcription
  btnRun.addEventListener('click', async () => {
    const apiKey = localStorage.getItem(API_KEY_STORAGE);
    if (!apiKey) {
      openKeyModal();
      pendingRunAfterKey = true;
      return;
    }
    await runTranscription(apiKey);
  });

  async function runTranscription(apiKey) {
    const source = recordedFile || pickedFile;
    if (!source) {
      // small inline nudge below the appropriate panel
      if (!panelFile.classList.contains('hidden')) {
        fileErrorEl.textContent = 'Выберите звуковой файл или перетащите сюда.';
        fileErrorEl.classList.remove('hidden');
      } else {
        showRecordingError('Запишите аудио перед обработкой.');
      }
      return;
    }
    if (source.size > MAX_SIZE) {
      if (!panelFile.classList.contains('hidden')) {
        fileErrorEl.textContent = 'Файл слишком большой. Максимум 25 МБ.';
        fileErrorEl.classList.remove('hidden');
      } else {
        showRecordingError('Запись слишком длинная (>25 МБ).');
      }
      return;
    }

    setRunLoading(true);
    resultEl.value = '';

    const model = localStorage.getItem('model') || DEFAULT_MODEL;
    let response_format = localStorage.getItem('response_format') || DEFAULT_FORMAT;
    const language = localStorage.getItem('language') || '';
    const prompt = localStorage.getItem('prompt') || '';

    // Adjust unsupported formats for gpt-4o* models
    if (model.startsWith('gpt-4o') && ['srt','vtt','verbose_json'].includes(response_format)) {
      response_format = 'text';
    }

    const form = new FormData();
    form.append('file', source);
    form.append('model', model);
    form.append('response_format', response_format);
    if (language) form.append('language', language);
    if (prompt) form.append('prompt', prompt);

    try {
      const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: form
      });
      if (!resp.ok) {
        let msg = 'Не удалось выполнить запрос.';
        try { const j = await resp.json(); msg = j?.error?.message || msg; } catch {}
        throw new Error(msg);
      }
      let out;
      if (response_format === 'json' || response_format === 'verbose_json') {
        const j = await resp.json();
        out = JSON.stringify(j, null, 2);
      } else {
        out = await resp.text();
      }
      resultEl.value = out;
    } catch (err) {
      console.error(err);
      resultEl.value = `Ошибка: ${err.message}`;
    } finally {
      setRunLoading(false);
    }
  }

  function setRunLoading(loading) {
    if (loading) {
      btnRun.disabled = true;
      btnRun.innerHTML = '<svg class="animate-spin h-5 w-5 inline mr-2" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg> Обработка...';
    } else {
      updateRunAvailability();
      btnRun.textContent = 'Преобразовать в текст';
    }
  }

  // Copy / Download
  btnCopy.addEventListener('click', async () => {
    const icon = btnCopy.querySelector('i');
    const restore = () => { if (icon) icon.className = 'fa-solid fa-copy'; };
    try {
      await navigator.clipboard.writeText(resultEl.value || '');
      if (icon) icon.className = 'fa-solid fa-check';
      setTimeout(restore, 1300);
    } catch {
      if (icon) icon.className = 'fa-solid fa-triangle-exclamation';
      setTimeout(restore, 1300);
    }
  });
  btnDownload.addEventListener('click', () => {
    const rf = localStorage.getItem('response_format') || DEFAULT_FORMAT;
    const ext = rf.startsWith('verbose') ? 'json' : rf;
    const mime = ({ text: 'text/plain', json: 'application/json', srt: 'application/x-subrip', vtt: 'text/vtt' })[ext] || 'text/plain';
    const blob = new Blob([resultEl.value || ''], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // Modal
  btnSettings.addEventListener('click', openSettingsModal);
  modalOverlay.addEventListener('click', closeModal);
  modalCancel.addEventListener('click', closeModal);
  modalSave.addEventListener('click', () => {
    const key = (apiKeyInput.value || '').trim();
    if (!key) { apiKeyInput.focus(); return; }
    if (rememberChk.checked) {
      try { localStorage.setItem(API_KEY_STORAGE, key); } catch {}
    }
    // If settings mode, persist settings
    if (!settingsFields.classList.contains('hidden')) {
      try {
        localStorage.setItem('model', modelSelect.value);
        localStorage.setItem('response_format', responseFormatSelect.value);
        localStorage.setItem('language', languageSelect.value);
        localStorage.setItem('prompt', (promptInput.value || '').trim());
      } catch {}
    }
    closeModal();
    if (pendingRunAfterKey) { pendingRunAfterKey = false; runTranscription(key); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!modal.classList.contains('hidden')) closeModal();
      if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
    }
  });

  function openSettingsModal() {
    modalTitle.textContent = 'Настройки';
    settingsFields.classList.remove('hidden');
    // Prefill
    apiKeyInput.value = localStorage.getItem(API_KEY_STORAGE) || '';
    apiKeyInput.type = 'password';
    syncApiKeyVisibilityUI();
    modelSelect.value = localStorage.getItem('model') || DEFAULT_MODEL;
    syncResponseFormatOptions();
    const savedRF = localStorage.getItem('response_format') || DEFAULT_FORMAT;
    if (responseFormatSelect.querySelector(`option[value="${savedRF}"]`)?.disabled) {
      responseFormatSelect.value = DEFAULT_FORMAT;
    } else {
      responseFormatSelect.value = savedRF;
    }
    languageSelect.value = localStorage.getItem('language') || '';
    promptInput.value = localStorage.getItem('prompt') || '';
    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    setTimeout(() => apiKeyInput.focus(), 0);
  }
  function openKeyModal() {
    modalTitle.textContent = 'OpenAI API Key';
    settingsFields.classList.add('hidden');
    apiKeyInput.value = localStorage.getItem(API_KEY_STORAGE) || '';
    apiKeyInput.type = 'password';
    syncApiKeyVisibilityUI();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    setTimeout(() => apiKeyInput.focus(), 0);
  }
  function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
  }

  // Keep response formats consistent with model
  function syncResponseFormatOptions() {
    const isGpt4o = modelSelect.value.startsWith('gpt-4o');
    [...responseFormatSelect.options].forEach(opt => {
      const val = opt.value;
      const unsupported = ['srt','vtt','verbose_json'];
      opt.disabled = isGpt4o && unsupported.includes(val);
    });
  }
  modelSelect.addEventListener('change', () => {
    syncResponseFormatOptions();
    if (responseFormatSelect.selectedOptions[0]?.disabled) {
      responseFormatSelect.value = DEFAULT_FORMAT;
    }
  });

  // Availability of Run button
  function updateRunAvailability() {
    const hasSource = Boolean(recordedFile || pickedFile);
    btnRun.disabled = !hasSource;
  }
  // Initial state on load
  updateRunAvailability();

  // API key visibility toggle
  function syncApiKeyVisibilityUI() {
    const isPassword = apiKeyInput.type === 'password';
    if (toggleApiKeyIcon) {
      toggleApiKeyIcon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    }
    if (toggleApiKey) {
      toggleApiKey.setAttribute('aria-label', isPassword ? 'Показать ключ' : 'Скрыть ключ');
      toggleApiKey.setAttribute('aria-pressed', (!isPassword).toString());
    }
  }
  if (toggleApiKey) {
    toggleApiKey.addEventListener('click', (e) => {
      e.preventDefault();
      apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
      syncApiKeyVisibilityUI();
      apiKeyInput.focus();
    });
  }

  // Utils
  function getPreferredMimeType() {
    if (typeof MediaRecorder === 'undefined') return null;
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
      'audio/mpeg'
    ];
    for (const t of types) { try { if (MediaRecorder.isTypeSupported(t)) return t; } catch {} }
    return null;
  }
  function mimeToExt(type) {
    if (!type) return 'webm';
    if (type.includes('webm')) return 'webm';
    if (type.includes('ogg')) return 'ogg';
    if (type.includes('mp4')) return 'mp4';
    if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
    return 'webm';
  }
});
