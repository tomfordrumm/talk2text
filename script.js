document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const tabRecord = document.getElementById("tab-record");
  const tabFile = document.getElementById("tab-file");
  const panelRecord = document.getElementById("panel-record");
  const panelFile = document.getElementById("panel-file");

  const btnRecord = document.getElementById("btn-record");
  const audioPlayer = document.getElementById("audio-player");
  const recordingError = document.getElementById("recording-error");
  const recordTimer = document.getElementById("record-timer");
  const recordPulse = document.getElementById("record-pulse");
  const recordHint = document.getElementById("record-hint");
  const recordWarning = document.getElementById("record-warning");

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const fileNameEl = document.getElementById("file-name");
  const fileErrorEl = document.getElementById("file-error");
  const filePlayer = document.getElementById("file-player");

  const btnRun = document.getElementById("btn-run");
  const resultEl = document.getElementById("result");
  const btnCopy = document.getElementById("btn-copy");
  const btnDownload = document.getElementById("btn-download");

  const btnSettings = document.getElementById("btn-settings");
  const modal = document.getElementById("modal");
  const modalOverlay = modal.querySelector("[data-overlay]");
  const modalTitle = document.getElementById("modal-title");
  const modalSave = document.getElementById("modalSave");
  const modalCancel = document.getElementById("modalCancel");
  // Registration modal elements
  const registerModal = document.getElementById("registerModal");
  const registerOverlay = registerModal?.querySelector("[data-overlay]");
  const regEmail = document.getElementById("regEmail");
  const regPassword = document.getElementById("regPassword");
  const regPassword2 = document.getElementById("regPassword2");
  const regError = document.getElementById("registerError");
  const regCancel = document.getElementById("regCancel");
  const regSubmit = document.getElementById("regSubmit");
  // Login modal elements
  const loginModal = document.getElementById("loginModal");
  const loginOverlay = loginModal?.querySelector("[data-overlay]");
  const loginEmail = document.getElementById("loginEmail");
  const loginPassword = document.getElementById("loginPassword");
  const loginError = document.getElementById("loginError");
  const loginCancel = document.getElementById("loginCancel");
  const loginSubmit = document.getElementById("loginSubmit");
  const useOwnKeyToggle = document.getElementById("useOwnKey");
  const ownKeySection = document.getElementById("ownKeySection");
  const authSection = document.getElementById("authSection");
  const authLoggedOut = document.getElementById("authLoggedOut");
  const authLoggedIn = document.getElementById("authLoggedIn");
  const userEmailEl = document.getElementById("userEmail");
  const userSecondsEl = document.getElementById("userSeconds");
  const btnLogout = document.getElementById("btn-logout");
  const btnRegister = document.getElementById("btn-register");
  const btnLogin = document.getElementById("btn-login");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const toggleApiKey = document.getElementById("toggleApiKey");
  const toggleApiKeyIcon = document.getElementById("toggleApiKeyIcon");
  const rememberChk = document.getElementById("remember");
  const settingsFields = document.getElementById("settingsFields");
  const modelSelect = document.getElementById("modelSelect");
  const responseFormatSelect = document.getElementById("responseFormat");
  const languageSelect = document.getElementById("languageSelect");
  const promptInput = document.getElementById("promptInput");

  // State
  let mediaRecorder = null;
  let chunks = [];
  let recordedFile = null;
  let pickedFile = null;
  let currentStream = null;
  let pendingRunAfterKey = false;
  let pendingRunAfterAuth = false;
  let timerInterval = null;
  let elapsedSec = 0;
  let recordedDurationSec = 0; // duration of the last recording in seconds

  const MAX_SIZE = 25 * 1024 * 1024;
  const ACCEPT_EXT = [".wav", ".mp3", ".m4a", ".ogg"];
  const API_KEY_STORAGE = "openai_api_key";
  const SERVICE_TOKEN_STORAGE = "api2text_access_token";
  const SERVICE_EMAIL_STORAGE = "api2text_email";
  const USE_OWN_KEY_STORAGE = "use_own_key";
  const SERVICE_API_BASE = "https://api-t2t.yhub.net/api";
  // const SERVICE_API_BASE = 'https://api2text.local/api';
  const DEFAULT_MODEL = "gpt-4o-transcribe";
  const DEFAULT_FORMAT = "text";
  const MIC_PERMISSION_KEY = "mic_permission_granted";
  const MIC_DEVICE_ID_KEY = "mic_device_id";

  // Permissions state (best-effort; browsers vary)
  let micPermission = "unknown"; // 'granted' | 'denied' | 'prompt' | 'unknown'

  // Tabs
  function selectTab(which) {
    const record = which === "record";
    tabRecord.setAttribute("aria-selected", record ? "true" : "false");
    tabFile.setAttribute("aria-selected", record ? "false" : "true");
    tabRecord.setAttribute("data-selected", record ? "true" : "false");
    tabFile.setAttribute("data-selected", record ? "false" : "true");
    panelRecord.classList.toggle("hidden", !record);
    panelFile.classList.toggle("hidden", record);
    panelFile.setAttribute("aria-hidden", record ? "true" : "false");

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
  tabRecord.addEventListener("click", () => selectTab("record"));
  tabFile.addEventListener("click", () => selectTab("file"));

  // Pre-check microphone permission (non-blocking)
  (async function precheckMicPermission() {
    try {
      if ("permissions" in navigator && navigator.permissions?.query) {
        const status = await navigator.permissions.query({
          name: "microphone",
        });
        micPermission = status.state; // granted | denied | prompt
        status.onchange = () => {
          micPermission = status.state;
        };
        if (micPermission === "granted") {
          try {
            localStorage.setItem(MIC_PERMISSION_KEY, "1");
          } catch {}
        }
      } else {
        // Fallback: remember prior grant in localStorage (Safari)
        micPermission = localStorage.getItem(MIC_PERMISSION_KEY)
          ? "granted"
          : "unknown";
      }
    } catch {}
  })();

  // Recording
  btnRecord.addEventListener("click", async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
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
      if (recordedFile || !audioPlayer.classList.contains("hidden")) {
        resetRecordingPreview();
      }
      if (!window.isSecureContext) {
        return showRecordingError("Нужен HTTPS или localhost для записи.");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        return showRecordingError(
          "Браузер не поддерживает доступ к микрофону.",
        );
      }
      if (typeof MediaRecorder === "undefined") {
        return showRecordingError(
          "MediaRecorder не поддерживается в этом браузере.",
        );
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
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (e2) {
            throw e2;
          }
        } else {
          throw e;
        }
      }
      currentStream = stream;
      chunks = [];
      recordedFile = null;
      recordedDurationSec = 0;
      pickedFile = null;
      updateRunAvailability();

      // Mark permission as granted and remember device id when possible
      try {
        const track = stream.getAudioTracks?.()[0];
        const settings = track?.getSettings?.() || {};
        if (settings.deviceId) {
          try {
            localStorage.setItem(MIC_DEVICE_ID_KEY, settings.deviceId);
          } catch {}
        }
        try {
          localStorage.setItem(MIC_PERMISSION_KEY, "1");
        } catch {}
      } catch {}

      const mime = getPreferredMimeType();
      try {
        mediaRecorder = new MediaRecorder(
          stream,
          mime ? { mimeType: mime } : undefined,
        );
      } catch {
        mediaRecorder = new MediaRecorder(stream);
      }

      mediaRecorder.addEventListener("dataavailable", (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      });
      mediaRecorder.addEventListener("stop", () => {
        const type =
          (chunks[0] && chunks[0].type) ||
          mediaRecorder.mimeType ||
          "audio/webm";
        const blob = new Blob(chunks, { type });
        const ext = mimeToExt(type);
        recordedFile = new File([blob], `recording.${ext}`, { type });
        // capture measured duration from the recording timer
        recordedDurationSec = Math.max(0, Number(elapsedSec) || 0);
        showRecordingPreview(URL.createObjectURL(recordedFile));
        chunks = [];
        updateRunAvailability();
      });
      mediaRecorder.start();
      setRecordingUI(true);
    } catch (err) {
      console.error(err);
      showRecordingError("Не удалось начать запись. Проверьте разрешения.");
    }
  }
  function stopRecording() {
    try {
      if (mediaRecorder && mediaRecorder.state === "recording")
        mediaRecorder.stop();
    } catch {}
    try {
      currentStream?.getTracks().forEach((t) => t.stop());
    } catch {}
    currentStream = null;
    setRecordingUI(false);
  }
  function showRecordingPreview(url) {
    audioPlayer.classList.remove("hidden");
    audioPlayer.src = url;
    updateRecordWarning();
  }
  function resetRecordingPreview() {
    recordedFile = null;
    recordedDurationSec = 0;
    audioPlayer.src = "";
    audioPlayer.classList.add("hidden");
    if (recordWarning) recordWarning.classList.add("hidden");
    // Reset hints
    recordHint.textContent = "Нажмите, чтобы начать запись";
    recordTimer.classList.add("hidden");
    stopTimer();
    // Reset button state
    btnRecord.classList.remove("bg-red-600", "hover:bg-red-700");
    btnRecord.classList.add("bg-indigo-600", "hover:bg-indigo-700");
    btnRecord.setAttribute("aria-label", "Начать запись");
    btnRecord.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    recordPulse.classList.add("hidden");
    updateRunAvailability();
  }
  function showRecordingError(msg) {
    recordingError.textContent = msg;
    recordingError.classList.remove("hidden");
  }
  function hideRecordingError() {
    recordingError.classList.add("hidden");
  }
  function setRecordingUI(isRecording) {
    if (isRecording) {
      btnRecord.classList.remove("bg-indigo-600", "hover:bg-indigo-700");
      btnRecord.classList.add("bg-red-600", "hover:bg-red-700");
      btnRecord.setAttribute("aria-label", "Остановить запись");
      btnRecord.innerHTML = '<i class="fa-solid fa-stop"></i>';
      recordPulse.classList.remove("hidden");
      recordHint.textContent = "Нажмите, чтобы остановить";
      elapsedSec = 0;
      recordTimer.textContent = "00:00";
      recordTimer.classList.remove("hidden");
      startTimer();
      if (recordWarning) recordWarning.classList.add("hidden");
    } else {
      btnRecord.classList.remove("bg-red-600", "hover:bg-red-700");
      btnRecord.classList.add("bg-indigo-600", "hover:bg-indigo-700");
      btnRecord.setAttribute("aria-label", "Начать запись");
      btnRecord.innerHTML = '<i class="fa-solid fa-microphone"></i>';
      recordPulse.classList.add("hidden");
      recordHint.textContent = "Нажмите, чтобы начать запись";
      stopTimer();
      updateRecordWarning();
    }
  }
  function updateRecordWarning() {
    const isRec = mediaRecorder && mediaRecorder.state === "recording";
    if (!recordWarning) return;
    if (recordedFile && !isRec) {
      recordWarning.classList.remove("hidden");
    } else {
      recordWarning.classList.add("hidden");
    }
  }
  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      elapsedSec += 1;
      const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
      const ss = String(elapsedSec % 60).padStart(2, "0");
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
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("ring-2", "ring-indigo-500");
  });
  dropzone.addEventListener("dragleave", () =>
    dropzone.classList.remove("ring-2", "ring-indigo-500"),
  );
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("ring-2", "ring-indigo-500");
    if (!e.dataTransfer?.files?.length) return;
    const file = e.dataTransfer.files[0];
    handlePickedFile(file);
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) handlePickedFile(file);
  });

  function handlePickedFile(file) {
    clearFileErrors();
    if (!validateFile(file)) return;
    pickedFile = file;
    recordedFile = null; // override recorded if any
    fileNameEl.textContent = `${file.name} • ${(file.size / (1024 * 1024)).toFixed(2)} МБ`;
    const url = URL.createObjectURL(file);
    filePlayer.src = url;
    filePlayer.classList.remove("hidden");
    // ensure file tab is visible
    selectTab("file");
    updateRunAvailability();
  }
  function validateFile(file) {
    const name = file.name.toLowerCase();
    const okExt = ACCEPT_EXT.some((ext) => name.endsWith(ext));
    if (!okExt) {
      fileErrorEl.textContent =
        "Неверный формат. Допустимо: WAV, MP3, M4A, OGG.";
      fileErrorEl.classList.remove("hidden");
      return false;
    }
    if (file.size > MAX_SIZE) {
      fileErrorEl.textContent = "Файл слишком большой. Максимум 25 МБ.";
      fileErrorEl.classList.remove("hidden");
      return false;
    }
    return true;
  }
  function clearFileSelection() {
    pickedFile = null;
    try {
      fileInput.value = "";
    } catch {}
    filePlayer.src = "";
    filePlayer.classList.add("hidden");
    fileNameEl.textContent = "";
    clearFileErrors();
    // Also ensure recording UI reset when returning back
    resetRecordingPreview();
    updateRunAvailability();
  }
  function clearFileErrors() {
    fileErrorEl.classList.add("hidden");
    fileErrorEl.textContent = "";
  }

  // Run transcription
  btnRun.addEventListener("click", async () => {
    const useOwn = getUseOwnKey();
    if (useOwn) {
      const apiKey = localStorage.getItem(API_KEY_STORAGE);
      if (!apiKey) {
        openKeyModal();
        pendingRunAfterKey = true;
        return;
      }
      await runTranscription(apiKey);
    } else {
      // Using service auth. If not authenticated, open modal to prompt login/register.
      const token = localStorage.getItem(SERVICE_TOKEN_STORAGE);
      if (!token) {
        pendingRunAfterAuth = true;
        openKeyModal();
        return;
      }
      await runTranscriptionWithService();
    }
  });

  async function runTranscription(apiKey) {
    const source = recordedFile || pickedFile;
    if (!source) {
      // small inline nudge below the appropriate panel
      if (!panelFile.classList.contains("hidden")) {
        fileErrorEl.textContent = "Выберите звуковой файл или перетащите сюда.";
        fileErrorEl.classList.remove("hidden");
      } else {
        showRecordingError("Запишите аудио перед обработкой.");
      }
      return;
    }
    if (source.size > MAX_SIZE) {
      if (!panelFile.classList.contains("hidden")) {
        fileErrorEl.textContent = "Файл слишком большой. Максимум 25 МБ.";
        fileErrorEl.classList.remove("hidden");
      } else {
        showRecordingError("Запись слишком длинная (>25 МБ).");
      }
      return;
    }

    setRunLoading(true);
    resultEl.value = "";

    const model = localStorage.getItem("model") || DEFAULT_MODEL;
    let response_format =
      localStorage.getItem("response_format") || DEFAULT_FORMAT;
    const language = localStorage.getItem("language") || "";
    const prompt = localStorage.getItem("prompt") || "";

    // Adjust unsupported formats for gpt-4o* models
    if (
      model.startsWith("gpt-4o") &&
      ["srt", "vtt", "verbose_json"].includes(response_format)
    ) {
      response_format = "text";
    }

    const form = new FormData();
    form.append("file", source);
    form.append("model", model);
    form.append("response_format", response_format);
    if (language) form.append("language", language);
    if (prompt) form.append("prompt", prompt);

    try {
      const resp = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        },
      );
      if (!resp.ok) {
        let msg = "Не удалось выполнить запрос.";
        try {
          const j = await resp.json();
          msg = j?.error?.message || msg;
        } catch {}
        throw new Error(msg);
      }
      let out;
      if (response_format === "json" || response_format === "verbose_json") {
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
      btnRun.innerHTML =
        '<svg class="animate-spin h-5 w-5 inline mr-2" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg> Обработка...';
    } else {
      updateRunAvailability();
      btnRun.textContent = "Преобразовать в текст";
    }
  }

  // Copy / Download
  btnCopy.addEventListener("click", async () => {
    const icon = btnCopy.querySelector("i");
    const restore = () => {
      if (icon) icon.className = "fa-solid fa-copy";
    };
    try {
      await navigator.clipboard.writeText(resultEl.value || "");
      if (icon) icon.className = "fa-solid fa-check";
      setTimeout(restore, 1300);
    } catch {
      if (icon) icon.className = "fa-solid fa-triangle-exclamation";
      setTimeout(restore, 1300);
    }
  });
  btnDownload.addEventListener("click", () => {
    const rf = localStorage.getItem("response_format") || DEFAULT_FORMAT;
    const ext = rf.startsWith("verbose") ? "json" : rf;
    const mime =
      {
        text: "text/plain",
        json: "application/json",
        srt: "application/x-subrip",
        vtt: "text/vtt",
      }[ext] || "text/plain";
    const blob = new Blob([resultEl.value || ""], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcription.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // Modal
  btnSettings.addEventListener("click", openSettingsModal);
  modalOverlay.addEventListener("click", closeModal);
  modalCancel.addEventListener("click", closeModal);
  modalSave.addEventListener("click", () => {
    const useOwn = getUseOwnKey();
    const key = (apiKeyInput?.value || "").trim();
    if (useOwn) {
      if (!key) {
        apiKeyInput?.focus();
        return;
      }
      if (rememberChk?.checked) {
        try {
          localStorage.setItem(API_KEY_STORAGE, key);
        } catch {}
      }
    } else {
      // Not using own key: no need to store the key
    }
    // If settings mode, persist settings
    if (!settingsFields.classList.contains("hidden")) {
      try {
        localStorage.setItem("model", modelSelect.value);
        localStorage.setItem("response_format", responseFormatSelect.value);
        localStorage.setItem("language", languageSelect.value);
        localStorage.setItem("prompt", (promptInput.value || "").trim());
      } catch {}
    }
    closeModal();
    if (pendingRunAfterKey) {
      pendingRunAfterKey = false;
      if (useOwn) runTranscription(key);
      else runTranscriptionWithService();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!modal.classList.contains("hidden")) closeModal();
      if (registerModal && !registerModal.classList.contains("hidden"))
        closeRegisterModal();
      if (loginModal && !loginModal.classList.contains("hidden"))
        closeLoginModal();
      if (mediaRecorder && mediaRecorder.state === "recording") stopRecording();
    }
  });

  function openSettingsModal() {
    modalTitle.textContent = "Настройки";
    settingsFields.classList.remove("hidden");
    // Prefill
    apiKeyInput.value = localStorage.getItem(API_KEY_STORAGE) || "";
    apiKeyInput.type = "password";
    syncApiKeyVisibilityUI();
    syncAuthKeySections();
    modelSelect.value = localStorage.getItem("model") || DEFAULT_MODEL;
    syncResponseFormatOptions();
    const savedRF = localStorage.getItem("response_format") || DEFAULT_FORMAT;
    if (
      responseFormatSelect.querySelector(`option[value="${savedRF}"]`)?.disabled
    ) {
      responseFormatSelect.value = DEFAULT_FORMAT;
    } else {
      responseFormatSelect.value = savedRF;
    }
    languageSelect.value = localStorage.getItem("language") || "";
    promptInput.value = localStorage.getItem("prompt") || "";
    // Show modal
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    document.body.style.overflow = "hidden";
    setTimeout(() => apiKeyInput.focus(), 0);
  }
  function openKeyModal() {
    modalTitle.textContent = "Авторизация или API ключ";
    settingsFields.classList.add("hidden");
    apiKeyInput.value = localStorage.getItem(API_KEY_STORAGE) || "";
    apiKeyInput.type = "password";
    syncApiKeyVisibilityUI();
    syncAuthKeySections();
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    document.body.style.overflow = "hidden";
    setTimeout(() => apiKeyInput.focus(), 0);
  }
  function closeModal() {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    document.body.style.overflow = "";
  }

  // Keep response formats consistent with model
  function syncResponseFormatOptions() {
    const isGpt4o = modelSelect.value.startsWith("gpt-4o");
    [...responseFormatSelect.options].forEach((opt) => {
      const val = opt.value;
      const unsupported = ["srt", "vtt", "verbose_json"];
      opt.disabled = isGpt4o && unsupported.includes(val);
    });
  }
  modelSelect.addEventListener("change", () => {
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
    const isPassword = apiKeyInput.type === "password";
    if (toggleApiKeyIcon) {
      toggleApiKeyIcon.className = isPassword
        ? "fa-solid fa-eye-slash"
        : "fa-solid fa-eye";
    }
    if (toggleApiKey) {
      toggleApiKey.setAttribute(
        "aria-label",
        isPassword ? "Показать ключ" : "Скрыть ключ",
      );
      toggleApiKey.setAttribute("aria-pressed", (!isPassword).toString());
    }
  }
  if (toggleApiKey) {
    toggleApiKey.addEventListener("click", (e) => {
      e.preventDefault();
      apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
      syncApiKeyVisibilityUI();
      apiKeyInput.focus();
    });
  }

  // Toggle between auth and own-key sections
  function getUseOwnKey() {
    try {
      return localStorage.getItem(USE_OWN_KEY_STORAGE) === "1";
    } catch {
      return false;
    }
  }
  function setUseOwnKey(v) {
    try {
      if (v) localStorage.setItem(USE_OWN_KEY_STORAGE, "1");
      else localStorage.removeItem(USE_OWN_KEY_STORAGE);
    } catch {}
  }
  function syncAuthKeySections() {
    const on = getUseOwnKey();
    if (useOwnKeyToggle) useOwnKeyToggle.checked = on;
    if (ownKeySection) ownKeySection.classList.toggle("hidden", !on);
    if (authSection) authSection.classList.toggle("hidden", on);
    // Also keep logged-in vs logged-out view in sync
    syncLoggedInView();
  }
  if (useOwnKeyToggle) {
    const onToggle = () => {
      setUseOwnKey(!!useOwnKeyToggle.checked);
      syncAuthKeySections();
    };
    useOwnKeyToggle.addEventListener("change", onToggle);
    useOwnKeyToggle.addEventListener("input", onToggle);
    useOwnKeyToggle.addEventListener("click", onToggle);
  }

  // Ensure initial sync in case modal opens pre-toggled
  syncAuthKeySections();
  syncLoggedInView();

  // On first load, if token exists, fetch fresh user info
  if (hasServiceToken()) {
    refreshServiceUserInfo();
  }

  // Auth buttons (stubs to be wired to your backend)
  if (btnRegister)
    btnRegister.addEventListener("click", () => {
      openRegisterModal();
      window.dispatchEvent(new CustomEvent("auth:register"));
    });
  if (btnLogin)
    btnLogin.addEventListener("click", () => {
      openLoginModal();
      window.dispatchEvent(new CustomEvent("auth:login"));
    });

  // Register modal behavior
  function openRegisterModal() {
    clearRegisterError();
    try {
      regEmail.value = "";
      regPassword.value = "";
      regPassword2.value = "";
    } catch {}
    registerModal.classList.remove("hidden");
    registerModal.classList.add("flex");
    document.body.style.overflow = "hidden";
    setTimeout(() => regEmail?.focus(), 0);
  }
  function closeRegisterModal() {
    registerModal.classList.add("hidden");
    registerModal.classList.remove("flex");
    document.body.style.overflow = "";
  }
  function showRegisterError(msg) {
    if (!regError) return;
    regError.textContent = msg;
    regError.classList.remove("hidden");
  }
  function clearRegisterError() {
    if (!regError) return;
    regError.textContent = "";
    regError.classList.add("hidden");
  }
  function isValidEmail(email) {
    return /.+@.+\..+/.test(email);
  }
  function validateRegisterForm() {
    const email = (regEmail?.value || "").trim();
    const pass = regPassword?.value || "";
    const pass2 = regPassword2?.value || "";
    if (!email || !isValidEmail(email)) return "Введите корректный email";
    if (!pass || pass.length < 6)
      return "Пароль должен быть не менее 6 символов";
    if (pass !== pass2) return "Пароли не совпадают";
    return "";
  }
  function setRegisterLoading(loading) {
    if (!regSubmit) return;
    if (loading) {
      regSubmit.disabled = true;
      regSubmit.innerHTML =
        '<svg class="animate-spin h-5 w-5 inline mr-2" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg> Регистрация...';
    } else {
      regSubmit.disabled = false;
      regSubmit.textContent = "Зарегистрироваться";
    }
  }
  regSubmit?.addEventListener("click", async () => {
    clearRegisterError();
    const err = validateRegisterForm();
    if (err) {
      showRegisterError(err);
      return;
    }
    const email = regEmail.value.trim();
    const password = regPassword.value;
    const password_confirmation = regPassword2.value;
    setRegisterLoading(true);
    try {
      const resp = await fetch("https://api2text.local/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email, password, password_confirmation }),
      });
      let data = null;
      try {
        data = await resp.json();
      } catch {}
      if (!resp.ok) {
        const msg = data?.message || "Не удалось зарегистрироваться";
        return showRegisterError(msg);
      }
      const token = data?.access_token;
      if (!token) {
        return showRegisterError("Ответ без access_token");
      }
      try {
        localStorage.setItem(SERVICE_TOKEN_STORAGE, token);
        localStorage.setItem(SERVICE_EMAIL_STORAGE, email);
      } catch {}
      window.dispatchEvent(
        new CustomEvent("auth:register:success", {
          detail: { email, access_token: token },
        }),
      );
      closeRegisterModal();
      syncLoggedInView();
    } catch (e) {
      showRegisterError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setRegisterLoading(false);
    }
  });
  regCancel?.addEventListener("click", closeRegisterModal);
  registerOverlay?.addEventListener("click", closeRegisterModal);

  // Logged-in UI helpers
  function hasServiceToken() {
    try {
      return !!localStorage.getItem(SERVICE_TOKEN_STORAGE);
    } catch {
      return false;
    }
  }
  function getServiceEmail() {
    try {
      return localStorage.getItem(SERVICE_EMAIL_STORAGE) || "";
    } catch {
      return "";
    }
  }
  function syncLoggedInView() {
    const loggedIn = hasServiceToken();
    if (authLoggedIn) authLoggedIn.classList.toggle("hidden", !loggedIn);
    if (authLoggedOut) authLoggedOut.classList.toggle("hidden", loggedIn);
    if (userEmailEl)
      userEmailEl.textContent = loggedIn ? getServiceEmail() : "";
    if (userSecondsEl)
      userSecondsEl.textContent = loggedIn
        ? userSecondsEl.textContent || "—"
        : "—";
  }
  btnLogout?.addEventListener("click", () => {
    try {
      localStorage.removeItem(SERVICE_TOKEN_STORAGE);
      localStorage.removeItem(SERVICE_EMAIL_STORAGE);
    } catch {}
    syncLoggedInView();
  });

  // Optional: handle login success from external integration
  window.addEventListener("auth:login:success", (e) => {
    const detail = e?.detail || {};
    const token = detail.access_token;
    const email = detail.email || getServiceEmail();
    if (token) {
      try {
        localStorage.setItem(SERVICE_TOKEN_STORAGE, token);
        if (email) localStorage.setItem(SERVICE_EMAIL_STORAGE, email);
      } catch {}
      syncLoggedInView();
      // After login, refresh user info from service
      refreshServiceUserInfo();
      if (pendingRunAfterAuth) {
        pendingRunAfterAuth = false;
        runTranscriptionWithService();
      }
    }
  });
  window.addEventListener("auth:register:success", (e) => {
    // After successful registration, auto-run if pending
    refreshServiceUserInfo();
    if (pendingRunAfterAuth) {
      pendingRunAfterAuth = false;
      runTranscriptionWithService();
    }
  });

  // Login modal behavior
  function openLoginModal() {
    clearLoginError();
    try {
      loginEmail.value = getServiceEmail() || "";
      loginPassword.value = "";
    } catch {}
    loginModal.classList.remove("hidden");
    loginModal.classList.add("flex");
    document.body.style.overflow = "hidden";
    setTimeout(() => loginEmail?.focus(), 0);
  }
  function closeLoginModal() {
    loginModal.classList.add("hidden");
    loginModal.classList.remove("flex");
    document.body.style.overflow = "";
  }
  function showLoginError(msg) {
    if (!loginError) return;
    loginError.textContent = msg;
    loginError.classList.remove("hidden");
  }
  function clearLoginError() {
    if (!loginError) return;
    loginError.textContent = "";
    loginError.classList.add("hidden");
  }
  function validateLoginForm() {
    const email = (loginEmail?.value || "").trim();
    const pass = loginPassword?.value || "";
    if (!/.+@.+\..+/.test(email)) return "Введите корректный email";
    if (!pass || pass.length < 6)
      return "Пароль должен быть не менее 6 символов";
    return "";
  }
  function setLoginLoading(loading) {
    if (!loginSubmit) return;
    if (loading) {
      loginSubmit.disabled = true;
      loginSubmit.innerHTML =
        '<svg class="animate-spin h-5 w-5 inline mr-2" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg> Вход...';
    } else {
      loginSubmit.disabled = false;
      loginSubmit.textContent = "Войти";
    }
  }
  loginSubmit?.addEventListener("click", async () => {
    clearLoginError();
    const err = validateLoginForm();
    if (err) {
      showLoginError(err);
      return;
    }
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    setLoginLoading(true);
    try {
      const resp = await fetch("https://api2text.local/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      let data = null;
      try {
        data = await resp.json();
      } catch {}
      if (!resp.ok) {
        const msg = data?.message || "Не удалось войти";
        return showLoginError(msg);
      }
      const token = data?.access_token;
      if (!token) {
        return showLoginError("Ответ без access_token");
      }
      try {
        localStorage.setItem(SERVICE_TOKEN_STORAGE, token);
        localStorage.setItem(SERVICE_EMAIL_STORAGE, email);
      } catch {}
      window.dispatchEvent(
        new CustomEvent("auth:login:success", {
          detail: { email, access_token: token },
        }),
      );
      closeLoginModal();
      syncLoggedInView();
    } catch (e) {
      showLoginError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setLoginLoading(false);
    }
  });
  loginCancel?.addEventListener("click", closeLoginModal);
  loginOverlay?.addEventListener("click", closeLoginModal);

  // Placeholder service transcription flow
  async function runTranscriptionWithService() {
    const source = recordedFile || pickedFile;
    if (!source) {
      if (!panelFile.classList.contains("hidden")) {
        fileErrorEl.textContent = "Выберите звуковой файл или перетащите сюда.";
        fileErrorEl.classList.remove("hidden");
      } else {
        showRecordingError("Запишите аудио перед обработкой.");
      }
      return;
    }
    if (source.size > MAX_SIZE) {
      if (!panelFile.classList.contains("hidden")) {
        fileErrorEl.textContent = "Файл слишком большой. Максимум 25 МБ.";
        fileErrorEl.classList.remove("hidden");
      } else {
        showRecordingError("Запись слишком длинная (>25 МБ).");
      }
      return;
    }

    const token = localStorage.getItem(SERVICE_TOKEN_STORAGE);
    if (!token) {
      // Prompt user to log in via service auth
      pendingRunAfterAuth = true;
      openKeyModal();
      return;
    }
    setRunLoading(true);
    resultEl.value = "";
    try {
      const model = localStorage.getItem("model") || DEFAULT_MODEL;
      let response_format =
        localStorage.getItem("response_format") || DEFAULT_FORMAT;
      const language = localStorage.getItem("language") || "";
      const prompt = localStorage.getItem("prompt") || "";

      // Keep parity with OpenAI handling
      if (
        model.startsWith("gpt-4o") &&
        ["srt", "vtt", "verbose_json"].includes(response_format)
      ) {
        response_format = "text";
      }

      const form = new FormData();
      form.append("file", source);
      form.append("model", model);
      form.append("response_format", response_format);
      if (language) form.append("language", language);
      if (prompt) form.append("prompt", prompt);
      // duration: prefer timer-based for recorded audio, otherwise probe file metadata
      let durationSec = 0;
      if (recordedFile && source === recordedFile) {
        durationSec = recordedDurationSec || 0;
      }
      if (!durationSec) {
        try {
          durationSec = await getAudioDurationFromFile(source);
        } catch {
          durationSec = 0;
        }
      }
      form.append("duration", String(Math.round(durationSec || 0)));

      const resp = await fetch("https://api2text.local/api/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!resp.ok) {
        let msg = "Не удалось выполнить запрос.";
        try {
          const j = await resp.json();
          msg = j?.message || j?.error || msg;
        } catch {}
        throw new Error(msg);
      }
      let out;
      if (response_format === "json" || response_format === "verbose_json") {
        const j = await resp.json();
        out = JSON.stringify(j, null, 2);
      } else {
        out = await resp.text();
      }
      resultEl.value = out;

      // После успешной транскрибации обновим баланс (секунды) пользователя
      // запрашивая актуальные данные через `auth/me`.
      try {
        await refreshServiceUserInfo();
      } catch {}
    } catch (err) {
      console.error(err);
      resultEl.value = `Ошибка: ${err.message}`;
    } finally {
      setRunLoading(false);
    }
  }

  // Utils
  async function refreshServiceUserInfo() {
    const token = localStorage.getItem(SERVICE_TOKEN_STORAGE);
    if (!token) return;
    try {
      const resp = await fetch(`${SERVICE_API_BASE}/auth/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      // If unauthorized, clear token and update UI
      if (resp.status === 401 || resp.status === 403) {
        try {
          localStorage.removeItem(SERVICE_TOKEN_STORAGE);
          localStorage.removeItem(SERVICE_EMAIL_STORAGE);
        } catch {}
        syncLoggedInView();
        return;
      }
      if (!resp.ok) return;
      let data = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }
      if (!data || typeof data !== "object") return;
      // Try common shapes: { email, seconds_left } or { user: { email }, balance_seconds }
      const email = data.email || data.user?.email || "";
      const secondsLeft =
        data.seconds_left ??
        data.seconds ??
        data.balance_seconds ??
        data.credits_seconds ??
        data.user?.seconds_left ??
        data.user?.seconds ??
        data.user?.balance_seconds ??
        data.user?.credits_seconds ??
        null;
      if (email) {
        try {
          localStorage.setItem(SERVICE_EMAIL_STORAGE, email);
        } catch {}
      }
      if (userEmailEl)
        userEmailEl.textContent = email || getServiceEmail() || "";
      if (userSecondsEl) {
        userSecondsEl.textContent =
          secondsLeft != null
            ? String(secondsLeft)
            : userSecondsEl.textContent || "—";
      }
    } catch {}
  }

  function getPreferredMimeType() {
    if (typeof MediaRecorder === "undefined") return null;
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/mp4",
      "audio/mpeg",
    ];
    for (const t of types) {
      try {
        if (MediaRecorder.isTypeSupported(t)) return t;
      } catch {}
    }
    return null;
  }
  function mimeToExt(type) {
    if (!type) return "webm";
    if (type.includes("webm")) return "webm";
    if (type.includes("ogg")) return "ogg";
    if (type.includes("mp4")) return "mp4";
    if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
    return "webm";
  }

  // Resolve duration (in seconds) from a File by loading audio metadata
  async function getAudioDurationFromFile(file) {
    return new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(file);
        const audio = document.createElement("audio");
        audio.preload = "metadata";
        const cleanup = () => {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        };
        audio.onloadedmetadata = () => {
          const d = Number(audio.duration);
          cleanup();
          resolve(Number.isFinite(d) && d > 0 ? d : 0);
        };
        audio.onerror = () => {
          cleanup();
          resolve(0);
        };
        audio.src = url;
      } catch {
        resolve(0);
      }
    });
  }
});
