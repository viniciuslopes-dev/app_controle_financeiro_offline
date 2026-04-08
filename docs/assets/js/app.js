const STORAGE_KEY = 'finance_offline_transactions_v2';
const LEGACY_STORAGE_KEY = 'finance_offline_transactions_v1';
const CATEGORY_STORAGE_KEY = 'finance_offline_categories_v1';
const SESSION_STORAGE_KEY = 'finance_offline_session_v1';
const SAFETY_SNAPSHOT_STORAGE_KEY = 'finance_offline_safety_snapshots_v1';
const DEVICE_ID_STORAGE_KEY = 'finance_offline_device_id_v1';
const SYNC_QUEUE_STORAGE_KEY = 'finance_offline_sync_queue_v1';
const SYNC_CURSOR_STORAGE_KEY = 'finance_offline_sync_cursor_v1';

const DEFAULT_CATEGORIES = {
  Moradia: ['Aluguel', 'Luz', 'Água', 'Internet'],
  Alimentação: ['Mercado', 'Restaurantes'],
  Transporte: ['Combustível', 'Transporte público'],
};

const FALLBACK_CATEGORY = 'Geral';
const FALLBACK_SUBCATEGORY = 'Outros';
const DEFAULT_ENTRY_TYPE = 'expense';

const form = document.getElementById('tx-form');
const categoryForm = document.getElementById('category-form');
const categoryListEl = document.getElementById('category-list');
const txList = document.getElementById('tx-list');
const summaryEl = document.getElementById('summary');
const typeCompositionChartEl = document.getElementById('type-composition-chart');
const inflowOutflowChartEl = document.getElementById('inflow-outflow-chart');
const categoryChartEl = document.getElementById('category-chart');
const subcategoryChartEl = document.getElementById('subcategory-chart');
const monthlyChartEl = document.getElementById('monthly-chart');
const monthlyTrendChartEl = document.getElementById('monthly-trend-chart');
const dashboardInsightsEl = document.getElementById('dashboard-insights');
const dateInput = document.getElementById('date');
const monthFilterInput = document.getElementById('month-filter');
const reportCategoryFilter = document.getElementById('report-category-filter');
const reportCategoryDropdown = document.getElementById('report-category-dropdown');
const reportCategoryToggle = document.getElementById('report-category-toggle');
const reportCategoryOptions = document.getElementById('report-category-options');
const reportTypeFilter = document.getElementById('report-type-filter');
const recurringCheckbox = document.getElementById('is-recurring');
const recurrenceFields = document.getElementById('recurrence-fields');
const refreshAppButton = document.getElementById('refresh-app');
const exportDataButton = document.getElementById('export-data');
const importDataInput = document.getElementById('import-data-file');
const importDataButton = document.getElementById('import-data');
const sessionForm = document.getElementById('session-form');
const authIdentifierInput = document.getElementById('auth-identifier');
const authSecretInput = document.getElementById('auth-secret');
const createAccountButton = document.getElementById('create-account-button');
const forgotPasswordToggleButton = document.getElementById('forgot-password-toggle');
const signOutButton = document.getElementById('sign-out-button');
const sessionStatusEl = document.getElementById('session-status');
const syncStatusEl = document.getElementById('sync-status');
const dataOriginStatusEl = document.getElementById('data-origin-status');
const passwordRecoveryPanel = document.getElementById('password-recovery-panel');
const passwordResetRequestForm = document.getElementById('password-reset-request-form');
const passwordResetConfirmForm = document.getElementById('password-reset-confirm-form');
const passwordResetIdentifierInput = document.getElementById('password-reset-identifier');
const passwordResetTokenInput = document.getElementById('password-reset-token');
const passwordResetSecretInput = document.getElementById('password-reset-secret');
const passwordResetStatusEl = document.getElementById('password-reset-status');


const navTabs = document.querySelectorAll('.main-nav__tab');
const viewSections = document.querySelectorAll('[data-view]');
let activeView = 'home';

function setActiveView(view) {
  const normalizedView = String(view || '').trim();
  if (!normalizedView) return;

  activeView = normalizedView;

  viewSections.forEach((section) => {
    section.classList.toggle('hidden', section.dataset.view !== activeView);
  });

  navTabs.forEach((tab) => {
    const isActive = tab.dataset.navView === activeView;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
}

const quickEntryTypeButtons = document.querySelectorAll('.quick-type-btn');
const quickCategoryGrid = document.getElementById('quick-category-grid');
const quickSubcategoryGrid = document.getElementById('quick-subcategory-grid');
const quickSubcategoryTitle = document.getElementById('quick-subcategory-title');
const typeHiddenInput = document.getElementById('type');

const quickEntryState = {
  type: 'expense',
  category: '',
  subcategory: '',
};

const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const editTxIdInput = document.getElementById('edit-tx-id');
const editTypeInput = document.getElementById('edit-type');
const editCategoryInput = document.getElementById('edit-category');
const editSubcategoryInput = document.getElementById('edit-subcategory');
const editDescriptionInput = document.getElementById('edit-description');
const editAmountInput = document.getElementById('edit-amount');
const editDateInput = document.getElementById('edit-date');
const editScopeWrap = document.getElementById('edit-scope-wrap');
const editRecurrenceCountWrap = document.getElementById('edit-recurrence-count-wrap');
const editRecurrenceCountInput = document.getElementById('edit-recurrence-count');
const editImpactEl = document.getElementById('edit-impact');
const cancelEditButton = document.getElementById('edit-cancel');

let currentUser = null;
let isApplyingRemoteChanges = false;
let syncRetryTimer = null;
let syncRetryAttempt = 0;
let isPasswordRecoveryVisible = false;

let lastSyncAt = null;
let lastSyncError = null;
let hasPendingConflict = false;

function setLastSyncSuccess() {
  lastSyncAt = nowIsoString();
  lastSyncError = null;
}

function setLastSyncError(message) {
  lastSyncError = normalizeText(String(message || 'Falha de sincronização.'));
}

function getSessionStatusText() {
  const user = getCurrentUser();
  if (!user) {
    return 'Sessão: não autenticado (modo offline local).';
  }

  const expiryTimestamp = parseTimestamp(user.expiresAt);
  if (expiryTimestamp !== null && expiryTimestamp <= Date.now()) {
    return `Sessão: token expirado para ${user.identifier}. Entre novamente para continuar sincronizando.`;
  }

  const expiryText = user.expiresAt
    ? ` Token expira em ${new Date(user.expiresAt).toLocaleString('pt-BR')}.`
    : '';
  return `Sessão: logado como ${user.identifier}.${expiryText}`;
}

function getSyncStatusText() {
  const pendingChanges = loadSyncQueue().length;
  const onlineText = navigator.onLine ? 'online' : 'offline';

  if (!getCurrentUser()) {
    return `Sincronização: modo offline local (${onlineText}). Pendências locais: ${pendingChanges} alteração(ões).`;
  }

  if (!navigator.onLine) {
    const lastSyncText = lastSyncAt ? ` Última sincronização: ${new Date(lastSyncAt).toLocaleString('pt-BR')}.` : '';
    return `Sincronização: sem internet. Fila local pendente: ${pendingChanges} alteração(ões).${lastSyncText}`;
  }

  if (lastSyncError) {
    const lastSyncText = lastSyncAt ? ` Última sincronização com sucesso: ${new Date(lastSyncAt).toLocaleString('pt-BR')}.` : '';
    return `Sincronização: erro de rede/servidor (${lastSyncError}). Pendências: ${pendingChanges} alteração(ões).${lastSyncText}`;
  }

  const lastSyncLabel = lastSyncAt
    ? `Última sincronização: ${new Date(lastSyncAt).toLocaleString('pt-BR')}.`
    : 'Última sincronização: ainda não realizada nesta sessão.';
  return `Sincronização ativa. Fila offline pendente: ${pendingChanges} alteração(ões). ${lastSyncLabel}`;
}

function getDataOriginStatusText() {
  const pendingChanges = loadSyncQueue().length;
  if (hasPendingConflict) {
    return 'Origem dos dados: conflito pendente de revisão (dados locais e nuvem divergentes).';
  }

  if (pendingChanges > 0) {
    return `Origem dos dados: local pendente (${pendingChanges} alteração(ões) aguardando envio).`;
  }

  if (getCurrentUser() && navigator.onLine && !lastSyncError && lastSyncAt) {
    return `Origem dos dados: sincronizado com nuvem (última sincronização em ${new Date(lastSyncAt).toLocaleString('pt-BR')}).`;
  }

  return 'Origem dos dados: local pendente.';
}
const AUTH_API_BASE_URL = normalizeText(String(window.AUTH_API_BASE_URL || '')).replace(/\/$/, '');

if (!AUTH_API_BASE_URL) {
  console.warn('[auth] window.AUTH_API_BASE_URL não configurado. Login/sincronização com backend ficarão indisponíveis até definir auth-config.js no deploy.');
}

function getAuthApiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${AUTH_API_BASE_URL}${normalizedPath}`;
}

function persistSession(session) {
  if (!session) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  const safeSession = {
    expiresAt: String(session.expiresAt || ''),
    identifier: normalizeText(String(session.identifier || '')),
    provider: 'backend-api',
    signedInAt: String(session.signedInAt || new Date().toISOString()),
  };

  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(safeSession));
}

function getCurrentUser() {
  return currentUser;
}

async function refreshSessionToken() {
  const response = await fetch(getAuthApiUrl('/auth/refresh'), {
    method: 'POST',
    credentials: 'include',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, reason: payload.reason || 'refresh-failed' };
  }

  const token = String(payload.token || '').trim();
  const identifier = normalizeText(String(payload.identifier || ''));
  if (!token || !identifier) {
    return { ok: false, reason: 'invalid-token' };
  }

  const session = {
    identifier,
    signedInAt: currentUser?.signedInAt || new Date().toISOString(),
    provider: 'backend-api',
    token,
    expiresAt: String(payload.expiresAt || ''),
  };

  currentUser = session;
  persistSession(session);
  return { ok: true, user: session };
}

async function authFetch(path, options = {}, retryOnUnauthorized = true) {
  if (!currentUser || !currentUser.token) {
    const refreshed = await refreshSessionToken();
    if (!refreshed.ok) return { response: null, reason: refreshed.reason || 'session-expired' };
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${currentUser.token}`);
  const response = await fetch(getAuthApiUrl(path), {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && retryOnUnauthorized) {
    const refreshed = await refreshSessionToken();
    if (!refreshed.ok) {
      currentUser = null;
      persistSession(null);
      return { response, reason: 'session-expired' };
    }

    headers.set('Authorization', `Bearer ${currentUser.token}`);
    const secondResponse = await fetch(getAuthApiUrl(path), {
      ...options,
      headers,
      credentials: 'include',
    });
    return { response: secondResponse, reason: null };
  }

  return { response, reason: null };
}

async function loadSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || 'null');
    if (!stored || typeof stored !== 'object') return { ok: false, reason: 'invalid-session' };

    const refreshed = await refreshSessionToken();
    if (!refreshed.ok) {
      persistSession(null);
      return { ok: false, reason: 'session-expired' };
    }

    return { ok: true, user: refreshed.user };
  } catch {
    return { ok: false, reason: 'session-validation-failed' };
  }
}

function parseAuthResponse(payload, fallbackIdentifier) {
  const data = payload && typeof payload.data === 'object' ? payload.data : payload;
  const token = String(data?.token || '').trim();
  if (!token) {
    return { ok: false, reason: 'invalid-token', message: 'Resposta de autenticação inválida.' };
  }

  return {
    ok: true,
    user: {
      identifier: normalizeText(String(data?.identifier || fallbackIdentifier || '')),
      signedInAt: new Date().toISOString(),
      provider: 'backend-api',
      token,
      expiresAt: String(data?.expiresAt || ''),
    },
  };
}

function parseApiError(payload) {
  if (!payload || typeof payload !== 'object') return {};
  if (payload.error && typeof payload.error === 'object') {
    return {
      reason: String(payload.error.reason || '').trim(),
      message: String(payload.error.message || '').trim(),
    };
  }
  return {
    reason: String(payload.reason || '').trim(),
    message: String(payload.message || '').trim(),
  };
}

function setPasswordResetStatus(message) {
  if (!passwordResetStatusEl) return;
  passwordResetStatusEl.textContent = normalizeText(String(message || ''));
}

function renderPasswordRecoveryVisibility() {
  if (!passwordRecoveryPanel) return;
  passwordRecoveryPanel.classList.toggle('hidden', !isPasswordRecoveryVisible);
  if (forgotPasswordToggleButton) {
    forgotPasswordToggleButton.textContent = isPasswordRecoveryVisible ? 'Fechar recuperação' : 'Esqueci minha senha';
  }
}

async function requestPasswordReset(identifier) {
  const normalizedIdentifier = normalizeText(String(identifier || ''));
  if (!normalizedIdentifier) {
    return { ok: false, reason: 'invalid-input', message: 'Informe o identificador da conta.' };
  }

  try {
    const response = await fetch(getAuthApiUrl('/auth/password-reset/request'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ identifier: normalizedIdentifier }),
    });

    const payload = await response.json().catch(() => ({}));
    const apiError = parseApiError(payload);
    if (!response.ok) {
      return { ok: false, reason: apiError.reason || 'password-reset-request-failed', message: apiError.message || 'Não foi possível solicitar o reset agora.' };
    }

    const data = payload && typeof payload.data === 'object' ? payload.data : {};
    return {
      ok: true,
      message: String(payload.message || 'Solicitação recebida.'),
      token: normalizeText(String(data.resetToken || '')),
      expiresAt: String(data.expiresAt || ''),
    };
  } catch {
    return { ok: false, reason: 'network-error', message: 'Falha de conexão ao solicitar reset de senha.' };
  }
}

async function confirmPasswordReset(token, secret) {
  const normalizedToken = normalizeText(String(token || ''));
  const normalizedSecret = String(secret || '').trim();
  if (!normalizedToken || !normalizedSecret) {
    return { ok: false, reason: 'invalid-input', message: 'Informe token e nova senha.' };
  }

  try {
    const response = await fetch(getAuthApiUrl('/auth/password-reset/confirm'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ token: normalizedToken, secret: normalizedSecret }),
    });

    const payload = await response.json().catch(() => ({}));
    const apiError = parseApiError(payload);
    if (!response.ok) {
      if (apiError.reason === 'reset-token-expired') {
        return { ok: false, reason: 'reset-token-expired', message: 'Token expirado. Solicite um novo token.' };
      }
      if (apiError.reason === 'reset-token-invalid') {
        return { ok: false, reason: 'reset-token-invalid', message: 'Token inválido. Revise e tente novamente.' };
      }
      if (apiError.reason === 'reset-token-used') {
        return { ok: false, reason: 'reset-token-used', message: 'Token já utilizado. Solicite um novo token.' };
      }
      return { ok: false, reason: apiError.reason || 'password-reset-confirm-failed', message: apiError.message || 'Não foi possível redefinir a senha agora.' };
    }

    return {
      ok: true,
      message: String(payload.message || 'Senha redefinida com sucesso.'),
    };
  } catch {
    return { ok: false, reason: 'network-error', message: 'Falha de conexão ao redefinir a senha.' };
  }
}

async function signIn(identifier, secret) {
  const normalizedIdentifier = normalizeText(String(identifier || ''));
  const normalizedSecret = String(secret || '').trim();
  if (!normalizedIdentifier || !normalizedSecret) {
    return { ok: false, reason: 'invalid-input', message: 'Informe identificador e senha/código.' };
  }

  try {
    const response = await fetch(getAuthApiUrl('/auth/login'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ identifier: normalizedIdentifier, secret: normalizedSecret }),
    });

    const payload = await response.json().catch(() => ({}));
    const apiError = parseApiError(payload);

    if (!response.ok) {
      if (apiError.reason === 'account-not-found') {
        return { ok: false, reason: 'account-not-found', message: 'Conta inexistente.' };
      }
      if (apiError.reason === 'invalid-credentials') {
        return { ok: false, reason: 'invalid-credentials', message: 'Credenciais inválidas.' };
      }
      if (apiError.reason === 'account-locked') {
        return { ok: false, reason: 'account-locked', message: apiError.message || 'Conta temporariamente bloqueada.' };
      }
      if (apiError.reason === 'too-many-attempts') {
        return { ok: false, reason: 'too-many-attempts', message: apiError.message || 'Muitas tentativas. Tente novamente depois.' };
      }
      return { ok: false, reason: 'auth-failed', message: apiError.message || 'Não foi possível autenticar agora.' };
    }

    const parsed = parseAuthResponse(payload, normalizedIdentifier);
    if (!parsed.ok) return parsed;

    currentUser = parsed.user;
    persistSession(parsed.user);
    return parsed;
  } catch {
    return { ok: false, reason: 'network-error', message: 'Não foi possível conectar ao servidor de autenticação.' };
  }
}

async function registerAccount(identifier, secret) {
  const normalizedIdentifier = normalizeText(String(identifier || ''));
  const normalizedSecret = String(secret || '').trim();
  if (!normalizedIdentifier || !normalizedSecret) {
    return { ok: false, reason: 'invalid-input', message: 'Informe identificador e senha.' };
  }

  try {
    const response = await fetch(getAuthApiUrl('/auth/register'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ identifier: normalizedIdentifier, secret: normalizedSecret }),
    });

    const payload = await response.json().catch(() => ({}));
    const apiError = parseApiError(payload);

    if (!response.ok) {
      if (apiError.reason === 'identifier-already-in-use') {
        return { ok: false, reason: 'identifier-already-in-use', message: 'Este identificador já está em uso.' };
      }
      if (apiError.reason === 'invalid-identifier' || apiError.reason === 'weak-password') {
        return { ok: false, reason: apiError.reason, message: apiError.message || 'Dados de cadastro inválidos.' };
      }
      return { ok: false, reason: 'register-failed', message: apiError.message || 'Não foi possível criar sua conta agora.' };
    }

    const parsed = parseAuthResponse(payload, normalizedIdentifier);
    if (!parsed.ok) return parsed;

    currentUser = parsed.user;
    persistSession(parsed.user);
    return { ...parsed, message: String(payload.message || 'Conta criada com sucesso.') };
  } catch {
    return { ok: false, reason: 'network-error', message: 'Não foi possível conectar ao servidor de autenticação.' };
  }
}

async function signOut() {
  currentUser = null;
  persistSession(null);
  if (syncRetryTimer) {
    window.clearTimeout(syncRetryTimer);
    syncRetryTimer = null;
  }
  lastSyncError = null;
  hasPendingConflict = false;

  try {
    await fetch(getAuthApiUrl('/auth/logout'), {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Ignora falhas de logout remoto.
  }
}

function updateSyncStatus() {
  if (syncStatusEl) {
    syncStatusEl.textContent = getSyncStatusText();
  }

  if (dataOriginStatusEl) {
    dataOriginStatusEl.textContent = getDataOriginStatusText();
  }
}

function renderSessionState() {
  if (sessionStatusEl) {
    const user = getCurrentUser();
    if (user) {
      sessionStatusEl.textContent = getSessionStatusText();
    } else {
      sessionStatusEl.textContent = getSessionStatusText();
    }
  }

  if (authIdentifierInput) {
    const user = getCurrentUser();
    authIdentifierInput.value = user ? user.identifier : '';
  }

  if (authSecretInput) authSecretInput.value = '';

  if (signOutButton) {
    signOutButton.disabled = !getCurrentUser();
  }

  updateSyncStatus();
}

function getLocalTodayISO() {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

function getLocalCurrentMonthISO() {
  return getLocalTodayISO().slice(0, 7);
}

function applyEntryDefaults() {
  const today = getLocalTodayISO();

  if (typeHiddenInput) typeHiddenInput.value = DEFAULT_ENTRY_TYPE;
  if (dateInput) dateInput.value = today;

  quickEntryState.type = DEFAULT_ENTRY_TYPE;
}

applyEntryDefaults();
if (monthFilterInput) monthFilterInput.value = getLocalCurrentMonthISO();

function loadCategories() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CATEGORY_STORAGE_KEY) || '{}');
    if (Object.keys(parsed).length) return parsed;
  } catch {
    // fallback para default
  }
  return { ...DEFAULT_CATEGORIES };
}

function saveCategories(categories) {
  localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(categories));
}

function normalizeText(value) {
  return value.trim().replace(/\s+/g, ' ');
}

function getDeviceId() {
  const stored = normalizeText(String(localStorage.getItem(DEVICE_ID_STORAGE_KEY) || ''));
  if (stored) return stored;

  const created = `device-${crypto.randomUUID()}`;
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
  return created;
}

function nowIsoString() {
  return new Date().toISOString();
}

function parseTimestamp(value) {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function loadSyncQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_QUEUE_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSyncQueue(queue) {
  const normalized = Array.isArray(queue) ? queue : [];
  localStorage.setItem(SYNC_QUEUE_STORAGE_KEY, JSON.stringify(normalized));
}

function enqueueSyncChanges(changes) {
  if (!Array.isArray(changes) || !changes.length || isApplyingRemoteChanges) return;
  const queue = loadSyncQueue();
  queue.push(...changes);
  saveSyncQueue(queue);
  scheduleSyncRetry(0);
}

function getSyncCursor() {
  const cursor = normalizeText(String(localStorage.getItem(SYNC_CURSOR_STORAGE_KEY) || ''));
  return cursor || null;
}

function setSyncCursor(cursor) {
  if (!cursor) {
    localStorage.removeItem(SYNC_CURSOR_STORAGE_KEY);
    return;
  }
  localStorage.setItem(SYNC_CURSOR_STORAGE_KEY, String(cursor));
}

function computeSyncBackoffMs(attempt) {
  const base = 1200;
  const capped = Math.min(30000, base * (2 ** Math.max(0, attempt)));
  const jitter = Math.floor(Math.random() * 500);
  return capped + jitter;
}

function createSafetySnapshot(reason = 'manual') {
  const payload = buildBackupPayload();
  const snapshot = {
    id: `snapshot-${crypto.randomUUID()}`,
    reason,
    createdAt: nowIsoString(),
    payload,
  };

  let history = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(SAFETY_SNAPSHOT_STORAGE_KEY) || '[]');
    if (Array.isArray(parsed)) history = parsed;
  } catch {
    history = [];
  }

  history.push(snapshot);
  localStorage.setItem(SAFETY_SNAPSHOT_STORAGE_KEY, JSON.stringify(history.slice(-10)));
  return snapshot;
}

function sanitizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Number(amount.toFixed(2));
}

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

function createSeriesId() {
  return `series-${crypto.randomUUID()}`;
}

function addCategoryAndSubcategory(categoryName, subcategoryName) {
  const category = normalizeText(categoryName);
  const subcategory = normalizeText(subcategoryName);
  if (!category || !subcategory) return;

  const categories = loadCategories();
  if (!categories[category]) categories[category] = [];
  if (!categories[category].includes(subcategory)) {
    categories[category].push(subcategory);
    categories[category].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  saveCategories(categories);
}

function syncCategoryOptions() {
  const categories = loadCategories();
  const categoryNames = Object.keys(categories).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const selectedReportCategories = getSelectedReportCategories();

  if (reportCategoryFilter) {
    reportCategoryFilter.innerHTML = categoryNames.map((name) => `<option value="${name}">${name}</option>`).join('');

    Array.from(reportCategoryFilter.options).forEach((option) => {
      option.selected = selectedReportCategories.includes(option.value);
    });
  }

  syncQuickEntryOptions();
  syncReportCategoryDropdown();
  renderCategoryList();
}

function syncEditSubcategories() {
  const categories = loadCategories();
  const subs = categories[editCategoryInput.value] || [];
  editSubcategoryInput.innerHTML = subs.map((name) => `<option value="${name}">${name}</option>`).join('');
  if (!subs.includes(editSubcategoryInput.value)) {
    editSubcategoryInput.value = subs[0] || '';
  }
}

function getSelectedReportCategories() {
  if (!reportCategoryFilter) return [];

  return Array.from(reportCategoryFilter.selectedOptions)
    .map((option) => option.value)
    .filter(Boolean);
}

function updateReportCategoryToggleLabel() {
  if (!reportCategoryToggle) return;
  const selected = getSelectedReportCategories();
  if (!selected.length) {
    reportCategoryToggle.textContent = 'Todas as categorias';
    return;
  }

  if (selected.length <= 2) {
    reportCategoryToggle.textContent = selected.join(', ');
    return;
  }

  reportCategoryToggle.textContent = `${selected.length} categorias selecionadas`;
}

function renderReportCategoryDropdownOptions() {
  if (!reportCategoryOptions) return;

  const selected = new Set(getSelectedReportCategories());
  const options = reportCategoryFilter ? Array.from(reportCategoryFilter.options) : [];
  reportCategoryOptions.innerHTML = options
    .map((option) => `
      <label class="multi-dropdown__option">
        <input type="checkbox" value="${option.value}" ${selected.has(option.value) ? 'checked' : ''} />
        <span>${option.value}</span>
      </label>
    `)
    .join('');

  reportCategoryOptions.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const selectedValues = new Set(
        Array.from(reportCategoryOptions.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value),
      );

      if (reportCategoryFilter) {
        Array.from(reportCategoryFilter.options).forEach((option) => {
          option.selected = selectedValues.has(option.value);
        });
      }

      updateReportCategoryToggleLabel();
      render();
    });
  });
}

function setReportCategoryDropdownOpen(open) {
  if (!reportCategoryDropdown || !reportCategoryToggle || !reportCategoryOptions) return;

  reportCategoryDropdown.dataset.open = String(open);
  reportCategoryToggle.setAttribute('aria-expanded', String(open));
  reportCategoryOptions.classList.toggle('hidden', !open);
}

function syncReportCategoryDropdown() {
  updateReportCategoryToggleLabel();
  renderReportCategoryDropdownOptions();
}

function renderCategoryList() {
  if (!categoryListEl) return;

  const categories = loadCategories();
  const rows = Object.entries(categories).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));

  categoryListEl.innerHTML = rows
    .map(
      ([category, subs]) => `
        <li>
          <div>
            <strong>${category}</strong>: ${subs.join(', ') || 'Sem subcategorias'}
          </div>
          <button type="button" class="delete-category-btn" data-category="${category}">Excluir categoria</button>
        </li>
      `,
    )
    .join('');

  categoryListEl.querySelectorAll('.delete-category-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const category = btn.getAttribute('data-category');
      deleteCategory(category);
    });
  });
}

function deleteCategory(category) {
  if (!category) return;
  const confirmed = window.confirm(`Deseja excluir a categoria "${category}"?`);
  if (!confirmed) return;

  const categories = loadCategories();
  if (!categories[category]) return;

  delete categories[category];
  if (!Object.keys(categories).length) {
    categories[FALLBACK_CATEGORY] = [FALLBACK_SUBCATEGORY];
  }
  saveCategories(categories);

  const updatedTxs = loadTransactions().map((tx) => {
    if (tx.category !== category) return tx;
    return {
      ...tx,
      category: FALLBACK_CATEGORY,
      subcategory: FALLBACK_SUBCATEGORY,
    };
  });
  saveTransactions(updatedTxs);

  syncCategoryOptions();
  render();
}

function addMonths(dateString, offset) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  return date.toISOString().slice(0, 10);
}

function addYears(dateString, offset) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setFullYear(date.getFullYear() + offset);
  return date.toISOString().slice(0, 10);
}

function getNextDate(dateString, frequency) {
  return frequency === 'yearly' ? addYears(dateString, 1) : addMonths(dateString, 1);
}

function migrateLegacyData() {
  const current = localStorage.getItem(STORAGE_KEY);
  if (current) return;

  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacy) return;

  try {
    const parsed = JSON.parse(legacy);
    const migrated = Array.isArray(parsed)
      ? parsed.map((tx) => ({
          ...tx,
          category: tx.category || FALLBACK_CATEGORY,
          subcategory: tx.subcategory || FALLBACK_SUBCATEGORY,
          recurrence: tx.recurrence || null,
        }))
      : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  } catch {
    localStorage.setItem(STORAGE_KEY, '[]');
  }
}

function loadTransactions(options = {}) {
  const includeDeleted = !!options.includeDeleted;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const sanitized = Array.isArray(parsed)
      ? parsed.map((tx) => sanitizeTransaction(tx, { keepUpdatedAt: true })).filter(Boolean)
      : [];

    return includeDeleted ? sanitized : sanitized.filter((tx) => !tx.deletedAt);
  } catch {
    return [];
  }
}

function saveTransactions(items) {
  const existing = loadTransactions({ includeDeleted: true });
  const existingById = new Map(existing.map((tx) => [tx.id, tx]));
  const now = nowIsoString();
  const changes = [];

  const sanitized = Array.isArray(items)
    ? items
      .map((item) => sanitizeTransaction(item, { keepUpdatedAt: true }))
      .filter(Boolean)
      .map((tx) => {
        const previous = existingById.get(tx.id);
        const isSameData = previous
          && !previous.deletedAt
          && JSON.stringify(normalizeTransactionComparable(previous)) === JSON.stringify(normalizeTransactionComparable(tx));

        const nextVersion = isSameData
          ? Number(previous.version || 1)
          : Number(previous && previous.version ? previous.version : 0) + 1;
        const syncedTx = {
          ...tx,
          updatedAt: isSameData && typeof previous.updatedAt === 'string' ? previous.updatedAt : now,
          deletedAt: null,
          version: nextVersion,
          etag: `local-${tx.id}-${nextVersion}`,
          deviceId: isSameData
            ? (previous && previous.deviceId ? previous.deviceId : (tx.deviceId || getDeviceId()))
            : getDeviceId(),
        };

        if (!previous || previous.deletedAt || !isSameData) {
          changes.push({
            id: syncedTx.id,
            updated_at: syncedTx.updatedAt,
            deleted_at: null,
            version: syncedTx.version,
            base_version: previous ? Number(previous.version || 0) : 0,
            etag: syncedTx.etag,
            device_id: syncedTx.deviceId,
            data: normalizeTransactionComparable(syncedTx),
          });
        }

        return syncedTx;
      })
    : [];

  const sanitizedById = new Map(sanitized.map((tx) => [tx.id, tx]));
  const preservedDeleted = existing.filter((tx) => tx.deletedAt && !sanitizedById.has(tx.id));

  existing.forEach((tx) => {
    if (tx.deletedAt || sanitizedById.has(tx.id)) return;
    const tombstoneVersion = Number(tx.version || 0) + 1;
    const tombstone = {
      ...tx,
      deletedAt: now,
      updatedAt: now,
      version: tombstoneVersion,
      etag: `local-${tx.id}-${tombstoneVersion}`,
      deviceId: getDeviceId(),
    };

    preservedDeleted.push(tombstone);
    changes.push({
      id: tx.id,
      updated_at: now,
      deleted_at: now,
      version: tombstoneVersion,
      base_version: Number(tx.version || 0),
      etag: tombstone.etag,
      device_id: tombstone.deviceId,
      data: null,
    });
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify([...sanitized, ...preservedDeleted]));
  enqueueSyncChanges(changes);
}

function sanitizeTransaction(tx, options = {}) {
  if (!tx || typeof tx !== 'object') return null;

  const description = normalizeText(String(tx.description || ''));
  const amount = sanitizeAmount(tx.amount);
  const date = typeof tx.date === 'string' ? tx.date : '';
  const type = ['income', 'expense', 'investment', 'goal'].includes(tx.type) ? tx.type : null;

  if (!description || amount === null || !isValidDateString(date) || !type) return null;

  const category = normalizeText(String(tx.category || FALLBACK_CATEGORY)) || FALLBACK_CATEGORY;
  const subcategory = normalizeText(String(tx.subcategory || FALLBACK_SUBCATEGORY)) || FALLBACK_SUBCATEGORY;
  const keepUpdatedAt = !!options.keepUpdatedAt;

  return {
    id: typeof tx.id === 'string' && tx.id ? tx.id : crypto.randomUUID(),
    type,
    category,
    subcategory,
    description,
    amount,
    date,
    recurrence: tx.recurrence && typeof tx.recurrence === 'object' ? tx.recurrence : null,
    completed: tx.completed === true,
    updatedAt: keepUpdatedAt ? (typeof tx.updatedAt === 'string' ? tx.updatedAt : nowIsoString()) : nowIsoString(),
    deletedAt: keepUpdatedAt && typeof tx.deletedAt === 'string' ? tx.deletedAt : null,
    version: Number.isInteger(Number(tx.version)) && Number(tx.version) > 0 ? Number(tx.version) : 1,
    etag: typeof tx.etag === 'string' ? tx.etag : '',
    ...(typeof tx.deviceId === 'string' && normalizeText(tx.deviceId) ? { deviceId: normalizeText(tx.deviceId) } : (keepUpdatedAt ? {} : { deviceId: getDeviceId() })),
  };
}

function buildBackupPayload() {
  return {
    version: '1.1',
    exportedAt: new Date().toISOString(),
    transactions: loadTransactions({ includeDeleted: true }),
    categories: loadCategories(),
  };
}

async function uploadBackupForUser(payload) {
  if (!currentUser) {
    return { ok: false, message: 'Sessão expirada. Entre novamente para sincronizar.' };
  }

  const validation = validateBackupPayload(payload);
  if (!validation.valid) {
    return { ok: false, message: validation.message };
  }

  try {
    const { response } = await authFetch('/users/me/backup', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payload }),
    });
    if (!response) {
      return { ok: false, message: 'Sessão expirada. Entre novamente para sincronizar.' };
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, message: data.message || 'Falha ao enviar backup para a nuvem.' };
    }
  } catch {
    return { ok: false, message: 'Sem conexão com o servidor para enviar backup.' };
  }

  return { ok: true };
}

async function downloadBackupForUser() {
  if (!currentUser) {
    return { ok: false, message: 'Sessão expirada. Entre novamente para sincronizar.' };
  }

  try {
    const { response } = await authFetch('/users/me/backup', { method: 'GET' });
    if (!response) {
      return { ok: false, message: 'Sessão expirada. Entre novamente para sincronizar.' };
    }

    if (response.status === 404) {
      return { ok: true, found: false };
    }

    const remoteRecord = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, message: remoteRecord.message || 'Falha ao baixar backup remoto.' };
    }

    const payload = remoteRecord && remoteRecord.payload ? remoteRecord.payload : null;
    const validation = validateBackupPayload(payload);
    if (!validation.valid) {
      return { ok: false, message: validation.message };
    }

    return {
      ok: true,
      found: true,
      payload,
      savedAt: remoteRecord && remoteRecord.savedAt ? remoteRecord.savedAt : null,
    };
  } catch {
    return { ok: false, message: 'Sem conexão com o servidor para baixar backup.' };
  }
}

function toServerChangePayload(change) {
  return {
    id: change.id,
    updated_at: change.updated_at,
    deleted_at: change.deleted_at,
    version: change.version,
    base_version: change.base_version,
    etag: change.etag,
    device_id: change.device_id,
    data: change.data,
  };
}

function fromServerChange(change) {
  const baseData = change && change.data && typeof change.data === 'object' ? change.data : {};
  return sanitizeTransaction({
    ...baseData,
    id: change.id,
    updatedAt: change.updated_at,
    deletedAt: change.deleted_at,
    version: change.version,
    etag: change.etag,
    deviceId: change.device_id,
  }, { keepUpdatedAt: true });
}

function applyRemoteChanges(changes) {
  if (!Array.isArray(changes) || !changes.length) return;
  const localAll = loadTransactions({ includeDeleted: true });
  const localMap = new Map(localAll.map((tx) => [tx.id, tx]));

  changes.forEach((rawChange) => {
    const remoteTx = fromServerChange(rawChange);
    if (!remoteTx) return;
    const localTx = localMap.get(remoteTx.id);
    if (!localTx) {
      localMap.set(remoteTx.id, remoteTx);
      return;
    }

    const resolved = resolveTransactionConflict(localTx, remoteTx);
    localMap.set(remoteTx.id, resolved);
  });

  isApplyingRemoteChanges = true;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(localMap.values())));
  isApplyingRemoteChanges = false;
}

async function pushPendingChanges() {
  const queue = loadSyncQueue();
  if (!queue.length || !currentUser) return { ok: true, applied: 0, conflicts: [] };

  const { response } = await authFetch('/users/me/changes', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      device_id: getDeviceId(),
      changes: queue.map(toServerChangePayload),
    }),
  });

  if (!response) {
    return { ok: false, message: 'Sessão expirada. Entre novamente para sincronizar.' };
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, message: payload.message || 'Falha ao enviar alterações incrementais.' };
  }

  saveSyncQueue([]);
  hasPendingConflict = Array.isArray(payload.conflicts) && payload.conflicts.length > 0;
  if (Array.isArray(payload.conflicts) && payload.conflicts.length) {
    applyRemoteChanges(payload.conflicts.map((item) => item.server).filter(Boolean));
  }

  return {
    ok: true,
    applied: Array.isArray(payload.applied) ? payload.applied.length : queue.length,
    conflicts: Array.isArray(payload.conflicts) ? payload.conflicts : [],
  };
}

async function pullRemoteChanges() {
  if (!currentUser) return { ok: true, imported: 0 };
  const since = getSyncCursor();
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  const { response } = await authFetch(`/users/me/changes${query}`, { method: 'GET' });
  if (!response) {
    return { ok: false, message: 'Sessão expirada. Entre novamente para sincronizar.' };
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, message: payload.message || 'Falha ao baixar alterações incrementais.' };
  }

  const changes = Array.isArray(payload.changes) ? payload.changes : [];
  applyRemoteChanges(changes);
  if (payload.cursor) setSyncCursor(payload.cursor);
  return { ok: true, imported: changes.length };
}

async function runIncrementalSync() {
  if (!navigator.onLine || !currentUser) return { ok: false, skipped: true };

  const pushResult = await pushPendingChanges();
  if (!pushResult.ok) {
    setLastSyncError(pushResult.message || 'Falha ao enviar alterações.');
    updateSyncStatus();
    return pushResult;
  }

  const pullResult = await pullRemoteChanges();
  if (!pullResult.ok) {
    setLastSyncError(pullResult.message || 'Falha ao baixar alterações.');
    updateSyncStatus();
    return pullResult;
  }

  syncRetryAttempt = 0;
  setLastSyncSuccess();
  updateSyncStatus();
  render();
  return {
    ok: true,
    pushed: pushResult.applied,
    imported: pullResult.imported,
    conflicts: pushResult.conflicts || [],
  };
}

function scheduleSyncRetry(delayMs = null) {
  if (syncRetryTimer) {
    window.clearTimeout(syncRetryTimer);
    syncRetryTimer = null;
  }

  const waitMs = typeof delayMs === 'number' ? delayMs : computeSyncBackoffMs(syncRetryAttempt);
  syncRetryTimer = window.setTimeout(async () => {
    const result = await runIncrementalSync();
    if (result.ok) {
      syncRetryAttempt = 0;
      return;
    }

    if (!result.skipped) {
      setLastSyncError(result.message || 'Falha temporária de rede.');
      updateSyncStatus();
    }
    syncRetryAttempt += 1;
    scheduleSyncRetry();
  }, Math.max(0, waitMs));
}

function downloadBackupFile(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const dateTag = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = `controle-financeiro-backup-${dateTag}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function validateBackupPayload(payload) {
  if (!payload || typeof payload !== 'object') return { valid: false, message: 'Arquivo inválido.' };
  if (payload.version !== '1.0' && payload.version !== '1.1') {
    return { valid: false, message: 'Versão de backup não suportada. Exporte um novo arquivo no app de origem.' };
  }

  if (!Array.isArray(payload.transactions)) {
    return { valid: false, message: 'Backup inválido: lista de lançamentos ausente.' };
  }

  if (!payload.categories || typeof payload.categories !== 'object' || Array.isArray(payload.categories)) {
    return { valid: false, message: 'Backup inválido: categorias ausentes.' };
  }

  return { valid: true };
}

function normalizeImportedCategories(categories) {
  const normalized = {};

  Object.entries(categories).forEach(([category, subcategories]) => {
    const categoryName = normalizeText(String(category || ''));
    if (!categoryName) return;

    const normalizedSubs = Array.isArray(subcategories)
      ? subcategories.map((sub) => normalizeText(String(sub || ''))).filter(Boolean)
      : [];

    normalized[categoryName] = Array.from(new Set(normalizedSubs));
  });

  if (!Object.keys(normalized).length) {
    normalized[FALLBACK_CATEGORY] = [FALLBACK_SUBCATEGORY];
  }

  return normalized;
}

function applyBackupPayload(payload, options = {}) {
  const categories = normalizeImportedCategories(payload.categories || {});
  const transactions = payload.transactions.map((tx) => sanitizeTransaction(tx, { keepUpdatedAt: true })).filter(Boolean);

  transactions.forEach((tx) => {
    if (!categories[tx.category]) categories[tx.category] = [];
    if (!categories[tx.category].includes(tx.subcategory)) {
      categories[tx.category].push(tx.subcategory);
    }
  });

  if (!transactions.length) {
    return { ok: false, message: 'Nenhum lançamento válido foi encontrado no backup.' };
  }

  if (options.createSnapshot !== false) {
    createSafetySnapshot(options.snapshotReason || 'before-apply-backup');
  }

  if (migrateRecurringSeriesData(transactions)) {
    recalcAllSeriesMetadata(transactions);
  }

  saveCategories(categories);
  saveTransactions(transactions);
  syncCategoryOptions();
  render();

  return { ok: true, importedCount: transactions.length };
}

function normalizeTransactionComparable(tx) {
  return {
    id: tx.id,
    type: tx.type,
    category: tx.category,
    subcategory: tx.subcategory,
    description: tx.description,
    amount: tx.amount,
    date: tx.date,
    recurrence: tx.recurrence || null,
    completed: tx.completed || false,
  };
}

function mergeTransactionFields(localTx, remoteTx, preferRemote) {
  const winner = preferRemote ? remoteTx : localTx;
  const loser = preferRemote ? localTx : remoteTx;
  return {
    ...winner,
    description: winner.description || loser.description,
    category: winner.category || loser.category,
    subcategory: winner.subcategory || loser.subcategory,
    recurrence: winner.recurrence || loser.recurrence || null,
  };
}

function resolveTransactionConflict(localTx, remoteTx) {
  const localVersion = Number(localTx.version || 1);
  const remoteVersion = Number(remoteTx.version || 1);
  if (remoteVersion !== localVersion) {
    return remoteVersion > localVersion ? remoteTx : localTx;
  }

  if (localTx.deletedAt || remoteTx.deletedAt) {
    if (localTx.deletedAt && remoteTx.deletedAt) {
      return (parseTimestamp(remoteTx.updatedAt) || 0) >= (parseTimestamp(localTx.updatedAt) || 0)
        ? remoteTx
        : localTx;
    }
    return remoteTx.deletedAt ? remoteTx : localTx;
  }

  const localStamp = parseTimestamp(localTx.updatedAt) || 0;
  const remoteStamp = parseTimestamp(remoteTx.updatedAt) || 0;
  return mergeTransactionFields(localTx, remoteTx, remoteStamp >= localStamp);
}

function mergeTransactions(localTxs, remoteTxs) {
  const localMap = new Map(
    (Array.isArray(localTxs) ? localTxs : [])
      .map((tx) => sanitizeTransaction(tx, { keepUpdatedAt: true }))
      .filter(Boolean)
      .map((tx) => [tx.id, tx]),
  );
  const remoteMap = new Map(
    (Array.isArray(remoteTxs) ? remoteTxs : [])
      .map((tx) => sanitizeTransaction(tx, { keepUpdatedAt: true }))
      .filter(Boolean)
      .map((tx) => [tx.id, tx]),
  );

  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const merged = [];
  const summary = { kept: 0, imported: 0, conflicting: 0 };
  const conflicts = [];

  allIds.forEach((id) => {
    const localTx = localMap.get(id);
    const remoteTx = remoteMap.get(id);

    if (!localTx && remoteTx) {
      merged.push(remoteTx);
      summary.imported += 1;
      return;
    }

    if (localTx && !remoteTx) {
      merged.push(localTx);
      summary.kept += 1;
      return;
    }

    const sameData = JSON.stringify(normalizeTransactionComparable(localTx)) === JSON.stringify(normalizeTransactionComparable(remoteTx));
    const sameVersion = Number(localTx.version || 1) === Number(remoteTx.version || 1);

    if (sameData) {
      merged.push(resolveTransactionConflict(localTx, remoteTx));
      summary.kept += 1;
      return;
    }

    if (sameVersion) {
      summary.conflicting += 1;
      conflicts.push({
        id,
        local: localTx,
        remote: remoteTx,
      });
      const mergedTx = resolveTransactionConflict(localTx, remoteTx);
      merged.push(mergedTx);
      if (mergedTx === remoteTx) {
        summary.imported += 1;
      } else {
        summary.kept += 1;
      }
      return;
    }

    const mergedTx = resolveTransactionConflict(localTx, remoteTx);
    merged.push(mergedTx);
    if (mergedTx === remoteTx) {
      summary.imported += 1;
    } else {
      summary.kept += 1;
    }
  });

  return { transactions: merged, summary, conflicts };
}

function mergeBackupPayloads(localPayload, remotePayload) {
  const categories = normalizeImportedCategories({
    ...(localPayload.categories || {}),
    ...(remotePayload.categories || {}),
  });

  Object.entries(localPayload.categories || {}).forEach(([category, subcategories]) => {
    if (!categories[category]) categories[category] = [];
    if (Array.isArray(subcategories)) {
      subcategories.forEach((subcategory) => {
        if (!categories[category].includes(subcategory)) categories[category].push(subcategory);
      });
    }
  });

  Object.entries(remotePayload.categories || {}).forEach(([category, subcategories]) => {
    if (!categories[category]) categories[category] = [];
    if (Array.isArray(subcategories)) {
      subcategories.forEach((subcategory) => {
        if (!categories[category].includes(subcategory)) categories[category].push(subcategory);
      });
    }
  });

  const mergedTxResult = mergeTransactions(localPayload.transactions || [], remotePayload.transactions || []);
  mergedTxResult.transactions.forEach((tx) => {
    if (!categories[tx.category]) categories[tx.category] = [];
    if (!categories[tx.category].includes(tx.subcategory)) categories[tx.category].push(tx.subcategory);
  });

  return {
    payload: {
      version: '1.1',
      exportedAt: nowIsoString(),
      transactions: mergedTxResult.transactions,
      categories,
    },
    summary: mergedTxResult.summary,
    conflicts: mergedTxResult.conflicts,
  };
}

function formatSyncSummary(summary) {
  return `Sincronização concluída: ${summary.kept} mantido(s), ${summary.imported} importado(s), ${summary.conflicting} conflitante(s).`;
}

function importBackupPayload(payload) {
  if (!window.confirm('Importar backup irá substituir os dados atuais. Deseja continuar?')) {
    return { ok: false, cancelled: true };
  }

  return applyBackupPayload(payload, { createSnapshot: true, snapshotReason: 'before-manual-import' });
}

async function handleRemoteBackupOnSignIn() {
  const result = await runIncrementalSync();
  if (!result.ok && !result.skipped) {
    window.alert(result.message || 'Falha na sincronização incremental. A fila offline será reenviada automaticamente.');
    scheduleSyncRetry();
    return;
  }

  if (result.ok && Array.isArray(result.conflicts) && result.conflicts.length) {
    const preview = result.conflicts
      .slice(0, 5)
      .map((conflict) => `• ID ${conflict.id}: versão esperada ${conflict.expected_version}, base enviada ${conflict.received_base_version}`)
      .join('\n');

    window.alert(
      `Conflitos detectados por versionamento otimista: ${result.conflicts.length}.\n\n${preview}${result.conflicts.length > 5 ? '\n• ...' : ''}\n\nRegra aplicada: maior versão vence; em empate, exclusão (tombstone) prevalece; sem exclusão, mescla por campos.`,
    );
  }
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDateBR(value) {
  if (!isValidDateString(value)) return value;

  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function formatPercent(value, digits = 1) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function computeSummary(items) {
  const totals = { income: 0, expense: 0, investment: 0, goal: 0 };
  for (const tx of items) totals[tx.type] += tx.amount;
  const balance = totals.income - totals.expense - totals.investment - totals.goal;
  return { ...totals, balance };
}

function getCurrentMonthFilter() {
  return monthFilterInput ? monthFilterInput.value : '';
}

function getPreviousMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return null;

  const [year, monthNumber] = month.split('-').map(Number);
  const previous = new Date(year, monthNumber - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
}

function filterByMonth(items, month) {
  if (!month) return items;
  return items.filter((tx) => tx.date.startsWith(month));
}

function getSelectedReportType() {
  return reportTypeFilter ? reportTypeFilter.value : 'outflow';
}

function getTypeLabel(type) {
  const labels = {
    all: 'Todos os lançamentos',
    outflow: 'Saídas',
    income: 'Entradas',
    expense: 'Despesas',
    investment: 'Investimentos',
    goal: 'Metas',
  };

  return labels[type] || 'Lançamentos';
}

function filterByType(items, type) {
  if (!type || type === 'outflow') {
    return items.filter((tx) => tx.type !== 'income');
  }

  if (type === 'all') return items;
  if (type === 'income') return items.filter((tx) => tx.type === 'income');

  return items.filter((tx) => tx.type === type);
}

function filterByMonthAndType(items, month, type) {
  const monthItems = filterByMonth(items, month);
  return filterByType(monthItems, type);
}

function getSummaryDelta(current, previous, invertColors = false) {
  if (previous === 0 && current === 0) return { text: '', className: 'summary-delta--neutral' };
  const diff = current - previous;
  const pct = previous > 0 ? (diff / previous) * 100 : null;
  const arrow = diff > 0 ? '\u25B2' : diff < 0 ? '\u25BC' : '';
  const pctText = pct !== null ? ` ${pct >= 0 ? '+' : ''}${formatPercent(pct)}%` : '';
  const isUp = diff > 0;
  const isDown = diff < 0;
  const upClass = invertColors ? 'summary-delta--down' : 'summary-delta--up';
  const downClass = invertColors ? 'summary-delta--up' : 'summary-delta--down';
  const className = isUp ? upClass : isDown ? downClass : 'summary-delta--neutral';
  return { text: `${arrow} ${formatMoney(Math.abs(diff))}${pctText}`, className };
}

function renderSummary(items, month) {
  const monthItems = filterByMonth(items, month);
  const s = computeSummary(monthItems);
  const totalDiscounted = s.expense + s.investment + s.goal;

  const prevMonth = getPreviousMonth(month);
  const prevItems = prevMonth ? filterByMonth(items, prevMonth) : [];
  const p = computeSummary(prevItems);
  const prevTotalDiscounted = p.expense + p.investment + p.goal;

  const rows = [
    ['Receitas', s.income, p.income, 'summary-item--income', false],
    ['Despesas', s.expense, p.expense, 'summary-item--expense', true],
    ['Investimentos', s.investment, p.investment, 'summary-item--investment', false],
    ['Metas', s.goal, p.goal, 'summary-item--goal', false],
    ['Total descontado', totalDiscounted, prevTotalDiscounted, 'summary-item--discounted', true],
    ['Saldo', s.balance, p.balance, s.balance >= 0 ? 'summary-item--balance-positive' : 'summary-item--balance-negative', false],
  ];

  summaryEl.innerHTML = rows
    .map(([label, value, prevValue, modifier, invertColors]) => {
      const delta = prevMonth ? getSummaryDelta(value, prevValue, invertColors) : null;
      const deltaHtml = delta && delta.text ? `<span class="summary-delta ${delta.className}">${delta.text}</span>` : '';
      return `
      <div class="summary-item ${modifier}">
        <small>${label}</small>
        <strong>${formatMoney(value)}</strong>
        ${deltaHtml}
      </div>`;
    })
    .join('');
}

function renderBars(
  container,
  rows,
  emptyMessage = 'Sem dados para o período selecionado.',
  options = {},
) {
  const {
    summaryLabel = 'Total',
    summaryValue,
    tone = 'default',
    showPercent = true,
    scaleMode = 'max',
    insightText = '',
    delta,
    secondaryDeltas = [],
  } = options;

  if (!rows.length) {
    container.innerHTML = `<p class="empty">${emptyMessage}</p>`;
    return;
  }

  const total = rows.reduce((acc, row) => acc + row.value, 0);
  const headerValue = summaryValue === undefined || summaryValue === null ? total : summaryValue;
  const maxValue = Math.max(...rows.map((r) => r.value), 1);
  const deltaDirectionValue = !delta
    ? null
    : typeof delta.directionValue === 'number'
      ? delta.directionValue
      : delta.percent;
  const deltaClass = !delta || delta.percent === null
    ? 'chart-delta--neutral'
    : deltaDirectionValue > 0
      ? 'chart-delta--positive'
      : deltaDirectionValue < 0
        ? 'chart-delta--negative'
        : 'chart-delta--neutral';
  const deltaText = !delta
    ? ''
    : ` <span class="chart-delta ${deltaClass}">(${delta.absoluteLabel} | ${delta.percentLabel})</span>`;
  const secondaryDeltaHtml = secondaryDeltas
    .map((item) => {
      const directionValue = typeof item.directionValue === 'number' ? item.directionValue : item.percent;
      const itemClass = item.percent === null
        ? 'chart-delta--neutral'
        : directionValue > 0
          ? 'chart-delta--positive'
          : directionValue < 0
            ? 'chart-delta--negative'
            : 'chart-delta--neutral';
      return `<p class="chart-delta-breakdown"><small>${item.label}:</small> <span class="chart-delta ${itemClass}">(${item.absoluteLabel} | ${item.percentLabel})</span></p>`;
    })
    .join('');

  container.innerHTML = `<p class="chart-total">${summaryLabel}: <strong>${formatMoney(headerValue)}</strong>${deltaText}</p>${secondaryDeltaHtml}${insightText ? `<p class="chart-insight">${insightText}</p>` : ''}` + rows
    .map((row) => {
      const widthBase = scaleMode === 'total' ? total : maxValue;
      const rawWidth = widthBase > 0 ? (row.value / widthBase) * 100 : 0;
      const width = row.value > 0 ? Math.max(rawWidth, 2) : 0;
      const pct = total > 0 ? (row.value / total) * 100 : 0;
      const rowTone = row.tone || tone;
      const extraClass = row.rowClassName || '';
      return `
        <div class="bar-row ${extraClass}">
          <small>${row.label}</small>
          <div class="bar bar-${rowTone}"><span style="width:${width}%"></span></div>
          <strong class="bar-value">${formatMoney(row.value)}</strong>
          <small class="bar-percent">${showPercent ? `${formatPercent(pct)}%` : ''}</small>
        </div>
      `;
    })
    .join('');
}

function getMonthOverMonthDelta(items, selectedMonth, type) {
  if (!selectedMonth) return null;

  const previousMonth = getPreviousMonth(selectedMonth);
  if (!previousMonth) return null;

  const currentTotal = filterByMonthAndType(items, selectedMonth, type).reduce((acc, tx) => acc + tx.amount, 0);
  const previousTotal = filterByMonthAndType(items, previousMonth, type).reduce((acc, tx) => acc + tx.amount, 0);
  const absolute = currentTotal - previousTotal;
  const percent = previousTotal > 0 ? (absolute / previousTotal) * 100 : null;
  const isExpenseType = type === 'expense';
  const isMixedOutflowType = type === 'outflow';
  const directionValue = isExpenseType ? -absolute : isMixedOutflowType ? 0 : absolute;

  const absoluteLabel = isExpenseType
    ? absolute < 0
      ? `${formatMoney(Math.abs(absolute))} a menos`
      : absolute > 0
        ? `${formatMoney(absolute)} a mais`
        : formatMoney(0)
    : `${absolute >= 0 ? '+' : '-'}${formatMoney(Math.abs(absolute))}`;

  const percentLabel = percent === null
    ? 'sem base no mês anterior'
    : isExpenseType
      ? percent < 0
        ? `${formatPercent(Math.abs(percent))}% a menos`
        : percent > 0
          ? `${formatPercent(percent)}% a mais`
          : `${formatPercent(0)}%`
      : `${percent >= 0 ? '+' : ''}${formatPercent(percent)}%`;

  return {
    absolute,
    percent,
    directionValue,
    absoluteLabel,
    percentLabel,
  };
}

function getOutflowBreakdownDeltas(items, selectedMonth) {
  if (!selectedMonth) return [];

  const previousMonth = getPreviousMonth(selectedMonth);
  if (!previousMonth) return [];

  const currentItems = filterByMonth(items, selectedMonth);
  const previousItems = filterByMonth(items, previousMonth);

  const sumTypes = (list, types) => list
    .filter((tx) => types.includes(tx.type))
    .reduce((acc, tx) => acc + tx.amount, 0);

  const expenseCurrent = sumTypes(currentItems, ['expense']);
  const expensePrevious = sumTypes(previousItems, ['expense']);
  const expenseAbsolute = expenseCurrent - expensePrevious;
  const expensePercent = expensePrevious > 0 ? (expenseAbsolute / expensePrevious) * 100 : null;

  const futureCurrent = sumTypes(currentItems, ['investment', 'goal']);
  const futurePrevious = sumTypes(previousItems, ['investment', 'goal']);
  const futureAbsolute = futureCurrent - futurePrevious;
  const futurePercent = futurePrevious > 0 ? (futureAbsolute / futurePrevious) * 100 : null;

  return [
    {
      label: 'Despesas',
      absoluteLabel: expenseAbsolute < 0
        ? `${formatMoney(Math.abs(expenseAbsolute))} a menos`
        : expenseAbsolute > 0
          ? `${formatMoney(expenseAbsolute)} a mais`
          : formatMoney(0),
      percentLabel: expensePercent === null
        ? 'sem base no mês anterior'
        : expensePercent < 0
          ? `${formatPercent(Math.abs(expensePercent))}% a menos`
          : expensePercent > 0
            ? `${formatPercent(expensePercent)}% a mais`
            : `${formatPercent(0)}%`,
      directionValue: -expenseAbsolute,
      percent: expensePercent,
    },
    {
      label: 'Investimentos + metas',
      absoluteLabel: `${futureAbsolute >= 0 ? '+' : '-'}${formatMoney(Math.abs(futureAbsolute))}`,
      percentLabel: futurePercent === null ? 'sem base no mês anterior' : `${futurePercent >= 0 ? '+' : ''}${formatPercent(futurePercent)}%`,
      directionValue: futureAbsolute,
      percent: futurePercent,
    },
  ];
}

function getNetFlowMonthOverMonthDelta(items, selectedMonth) {
  if (!selectedMonth) return null;

  const previousMonth = getPreviousMonth(selectedMonth);
  if (!previousMonth) return null;

  const currentItems = filterByMonth(items, selectedMonth);
  const previousItems = filterByMonth(items, previousMonth);

  const currentSummary = computeSummary(currentItems);
  const previousSummary = computeSummary(previousItems);

  const currentNet = currentSummary.income - (currentSummary.expense + currentSummary.investment + currentSummary.goal);
  const previousNet = previousSummary.income - (previousSummary.expense + previousSummary.investment + previousSummary.goal);

  const absolute = currentNet - previousNet;
  const percent = previousNet !== 0 ? (absolute / Math.abs(previousNet)) * 100 : null;

  return {
    absolute,
    percent,
    absoluteLabel: `${absolute >= 0 ? '+' : '-'}${formatMoney(Math.abs(absolute))}`,
    percentLabel: percent === null ? 'sem base no mês anterior' : `${percent >= 0 ? '+' : ''}${formatPercent(percent)}%`,
    directionValue: absolute,
  };
}

function renderInflowOutflowChart(items, month) {
  const monthItems = filterByMonth(items, month);
  const summary = computeSummary(monthItems);
  const outflow = summary.expense + summary.investment + summary.goal;
  const netFlow = summary.income - outflow;
  const rows = [
    { label: 'Entradas', value: summary.income, tone: 'income' },
    {
      label: 'Sa\u00eddas',
      value: outflow,
      tone: 'outflow',
    },
  ];

  let insightText = '';
  if (summary.income > 0 && outflow > 0) {
    if (outflow > summary.income) {
      const excessPct = ((outflow - summary.income) / summary.income) * 100;
      insightText = `\u26A0 Sa\u00eddas excedem entradas em ${formatPercent(excessPct)}%`;
    } else {
      const savePct = ((summary.income - outflow) / summary.income) * 100;
      insightText = `\u2714 Voc\u00ea economizou ${formatPercent(savePct)}% da renda`;
    }
  }

  const delta = getNetFlowMonthOverMonthDelta(items, month);

  renderBars(inflowOutflowChartEl, rows, 'Sem dados de entradas e sa\u00eddas para o per\u00edodo selecionado.', {
    summaryLabel: 'Diferen\u00e7a (Entradas - Sa\u00eddas)',
    summaryValue: netFlow,
    scaleMode: 'total',
    delta,
  });

  if (insightText && monthItems.length) {
    const isAlert = outflow > summary.income;
    inflowOutflowChartEl.innerHTML += `<p class="${isAlert ? 'insight-alert' : 'insight-positive'}">${insightText}</p>`;
  }
}

function renderTypeCompositionChart(items, month) {
  const monthItems = filterByMonth(items, month).filter((tx) => ['expense', 'investment', 'goal'].includes(tx.type));
  const byType = monthItems.reduce((acc, tx) => {
    acc[tx.type] = (acc[tx.type] || 0) + tx.amount;
    return acc;
  }, {});

  const rows = Object.entries(byType)
    .map(([type, value]) => ({ label: getTypeLabel(type), value }))
    .sort((a, b) => b.value - a.value);

  renderBars(typeCompositionChartEl, rows, 'Sem despesas, investimentos ou metas para o período selecionado.', {
    scaleMode: 'total',
  });
}

function renderCategoryChart(items, month) {
  const selectedType = getSelectedReportType();
  const filtered = filterByMonthAndType(items, month, selectedType);
  const byCategory = filtered.reduce((acc, tx) => {
    acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
    return acc;
  }, {});

  const rows = Object.entries(byCategory)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const tone = selectedType === 'income' ? 'income' : selectedType === 'all' ? 'default' : 'outflow';
  const delta = getMonthOverMonthDelta(items, month, selectedType);
  const secondaryDeltas = selectedType === 'outflow' ? getOutflowBreakdownDeltas(items, month) : [];
  renderBars(
    categoryChartEl,
    rows,
    `Sem lançamentos de ${getTypeLabel(selectedType).toLowerCase()} para este filtro.`,
    { tone, scaleMode: 'total', delta, secondaryDeltas },
  );
}

function renderSubcategoryChart(items, month) {
  const selectedCategories = getSelectedReportCategories();
  const selectedType = getSelectedReportType();
  const filteredByType = filterByMonthAndType(items, month, selectedType);
  const filtered = selectedCategories.length
    ? filteredByType.filter((tx) => selectedCategories.includes(tx.category))
    : filteredByType;

  const bySubcategory = filtered.reduce((acc, tx) => {
    const label = `${tx.category} › ${tx.subcategory || 'Outros'}`;
    acc[label] = (acc[label] || 0) + tx.amount;
    return acc;
  }, {});

  const rows = Object.entries(bySubcategory)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const tone = selectedType === 'income' ? 'income' : selectedType === 'all' ? 'default' : 'outflow';
  const emptyLabelContext = selectedCategories.length
    ? ` nas categorias selecionadas para ${getTypeLabel(selectedType).toLowerCase()} neste filtro.`
    : ` para ${getTypeLabel(selectedType).toLowerCase()} neste filtro.`;
  renderBars(
    subcategoryChartEl,
    rows,
    `Sem subcategorias${emptyLabelContext}`,
    { tone, scaleMode: 'total' },
  );
}

function buildMonthlyRows(items, selectedType) {
  const filteredByType = filterByType(items, selectedType);
  const monthly = filteredByType.reduce((acc, tx) => {
    const month = tx.date.slice(0, 7);
    acc[month] = (acc[month] || 0) + tx.amount;
    return acc;
  }, {});

  return Object.entries(monthly)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => (a.label > b.label ? 1 : -1))
    .slice(-12);
}

function getMovingAverageRows(rows, windowSize = 3) {
  return rows.map((row, index) => {
    const start = Math.max(0, index - (windowSize - 1));
    const set = rows.slice(start, index + 1);
    const avg = set.reduce((acc, item) => acc + item.value, 0) / set.length;
    return { label: row.label, value: avg };
  });
}

function buildSparklinePath(rows, width, height, padding = 10) {
  if (!rows.length) return '';
  const values = rows.map((row) => row.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  return rows
    .map((row, index) => {
      const x = padding + (rows.length > 1 ? (index / (rows.length - 1)) * innerWidth : innerWidth / 2);
      const normalized = (row.value - min) / range;
      const y = padding + (1 - normalized) * innerHeight;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function renderMonthlyTrendChart(rows, tone = 'default') {
  if (!monthlyTrendChartEl) return;
  if (!rows.length) {
    monthlyTrendChartEl.innerHTML = '<p>Sem dados suficientes para tendência.</p>';
    return;
  }

  const maRows = getMovingAverageRows(rows, 3);
  const stroke = tone === 'income' ? '#16a34a' : tone === 'outflow' ? '#dc2626' : '#2563eb';
  const path = buildSparklinePath(maRows, 680, 120, 14);

  monthlyTrendChartEl.innerHTML = `
    <svg viewBox="0 0 680 120" role="img" aria-label="Tendência mensal por média móvel de 3 meses">
      <path d="${path}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
    <p>Barras = valor mensal • Linha = média móvel (3 meses)</p>
  `;
}

function renderMonthlyChart(items) {
  const selectedType = getSelectedReportType();
  const rows = buildMonthlyRows(items, selectedType);

  const average = rows.length ? rows.reduce((acc, row) => acc + row.value, 0) / rows.length : 0;
  const tone = selectedType === 'income' ? 'income' : selectedType === 'all' ? 'default' : 'outflow';
  const isIncome = selectedType === 'income';

  const coloredRows = rows.map((row) => {
    let rowClassName = '';
    if (row.value > average) {
      rowClassName = isIncome ? 'bar-row--income-above' : 'bar-row--above-avg';
    } else {
      rowClassName = isIncome ? 'bar-row--income-below' : 'bar-row--below-avg';
    }
    return { ...row, rowClassName };
  });

  const values = rows.map((r) => r.value);
  const minVal = values.length ? Math.min(...values) : 0;
  const maxVal = values.length ? Math.max(...values) : 0;
  const minMaxText = rows.length ? `M\u00edn: ${formatMoney(minVal)} \u2022 M\u00e1x: ${formatMoney(maxVal)}` : '';

  renderBars(
    monthlyChartEl,
    coloredRows,
    `Sem evolu\u00e7\u00e3o mensal para ${getTypeLabel(selectedType).toLowerCase()} no per\u00edodo.`,
    { summaryLabel: 'M\u00e9dia mensal', summaryValue: average, tone, insightText: minMaxText },
  );

  renderMonthlyTrendChart(rows, tone);
}

function getConcentrationStatus(value) {
  if (value >= 60) return { label: 'Alto', className: 'badge-status--high' };
  if (value >= 40) return { label: 'Atenção', className: 'badge-status--attention' };
  return { label: 'Normal', className: 'badge-status--normal' };
}

function renderDashboardInsights(items, month) {
  if (!dashboardInsightsEl) return;

  const monthItems = filterByMonth(items, month).filter((tx) => tx.type !== 'income');
  if (!monthItems.length) {
    dashboardInsightsEl.innerHTML = '<p class="empty">Sem insights para o período selecionado.</p>';
    return;
  }

  const byCategory = monthItems.reduce((acc, tx) => {
    acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
    return acc;
  }, {});
  const rows = Object.entries(byCategory)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const total = rows.reduce((acc, row) => acc + row.value, 0);
  const top1 = rows[0];
  const top1Pct = total > 0 ? (top1.value / total) * 100 : 0;
  const top3Value = rows.slice(0, 3).reduce((acc, row) => acc + row.value, 0);
  const top3Pct = total > 0 ? (top3Value / total) * 100 : 0;
  const status = getConcentrationStatus(top1Pct);

  // Recorrentes vs avulsos
  const recurringTotal = monthItems.filter((tx) => tx.recurrence).reduce((acc, tx) => acc + tx.amount, 0);
  const recurringPct = total > 0 ? (recurringTotal / total) * 100 : 0;

  // Maior variação vs mês anterior
  const prevMonth = getPreviousMonth(month);
  let biggestChangeHtml = '';
  if (prevMonth) {
    const prevMonthItems = filterByMonth(items, prevMonth).filter((tx) => tx.type !== 'income');
    const prevByCategory = prevMonthItems.reduce((acc, tx) => {
      acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
      return acc;
    }, {});
    const allCats = new Set([...Object.keys(byCategory), ...Object.keys(prevByCategory)]);
    let biggestChange = { cat: '', change: 0, pct: 0 };
    for (const cat of allCats) {
      const curr = byCategory[cat] || 0;
      const prev = prevByCategory[cat] || 0;
      const change = curr - prev;
      if (Math.abs(change) > Math.abs(biggestChange.change) && prev > 0) {
        biggestChange = { cat, change, pct: (change / prev) * 100 };
      }
    }
    if (biggestChange.cat) {
      const arrow = biggestChange.change > 0 ? '\u25B2' : '\u25BC';
      const changeClass = biggestChange.change > 0 ? 'badge-status--high' : 'badge-status--normal';
      biggestChangeHtml = `
    <div class="dashboard-insight-item">
      <div>
        <small>Maior varia\u00e7\u00e3o vs. m\u00eas anterior</small>
        <strong>${biggestChange.cat}: ${arrow} ${formatPercent(Math.abs(biggestChange.pct))}%</strong>
      </div>
      <span class="badge-status ${changeClass}">${biggestChange.change > 0 ? 'Aumento' : 'Redu\u00e7\u00e3o'}</span>
    </div>`;
    }
  }

  dashboardInsightsEl.innerHTML = `
    <div class="dashboard-insight-item">
      <div>
        <small>Maior categoria de sa\u00edda</small>
        <strong>${top1.label}: ${formatPercent(top1Pct)}%</strong>
      </div>
      <span class="badge-status ${status.className}">${status.label}</span>
    </div>
    <div class="dashboard-insight-item">
      <div>
        <small>Concentra\u00e7\u00e3o Top 3 categorias</small>
        <strong>${formatPercent(top3Pct)}% das sa\u00eddas do m\u00eas</strong>
      </div>
      <span class="badge-status badge-status--normal">Info</span>
    </div>${biggestChangeHtml}
    <div class="dashboard-insight-item">
      <div>
        <small>Recorrentes vs. avulsos</small>
        <strong>${formatPercent(recurringPct)}% recorrentes</strong>
      </div>
      <span class="badge-status badge-status--normal">${recurringPct > 70 ? 'Pouca flexibilidade' : 'Flex\u00edvel'}</span>
    </div>
  `;
}

function getDaysInMonth(month) {
  if (!month) return 30;
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m, 0).getDate();
}

function getDaysElapsed(month) {
  if (!month) return 1;
  const today = new Date();
  const [year, m] = month.split('-').map(Number);
  const todayMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  if (month === todayMonth) return today.getDate();
  if (month < todayMonth) return getDaysInMonth(month);
  return 1;
}

function getKPIStatus(metric, value) {
  const thresholds = {
    savingsRate: [
      { max: 10, label: 'Cr\u00edtico', className: 'badge-status--high' },
      { max: 20, label: 'Aten\u00e7\u00e3o', className: 'badge-status--attention' },
      { max: Infinity, label: 'Saud\u00e1vel', className: 'badge-status--normal' },
    ],
    commitmentRate: [
      { max: 70, label: 'Saud\u00e1vel', className: 'badge-status--normal' },
      { max: 90, label: 'Aten\u00e7\u00e3o', className: 'badge-status--attention' },
      { max: Infinity, label: 'Cr\u00edtico', className: 'badge-status--high' },
    ],
  };

  const levels = thresholds[metric];
  if (!levels) return { label: 'Info', className: 'badge-status--normal' };
  for (const level of levels) {
    if (value <= level.max) return { label: level.label, className: level.className };
  }
  return { label: 'Info', className: 'badge-status--normal' };
}

function renderFinancialKPIs(items, month) {
  const kpiEl = document.getElementById('financial-kpis');
  if (!kpiEl) return;

  const monthItems = filterByMonth(items, month);
  const s = computeSummary(monthItems);
  const outflow = s.expense + s.investment + s.goal;

  if (!monthItems.length) {
    kpiEl.innerHTML = '<p class="empty">Sem dados para calcular indicadores.</p>';
    return;
  }

  const savingsRate = s.income > 0 ? ((s.investment + s.goal) / s.income) * 100 : 0;
  const commitmentRate = s.income > 0 ? (outflow / s.income) * 100 : 0;
  const daysInMonth = getDaysInMonth(month);
  const daysElapsed = getDaysElapsed(month);
  const daysRemaining = Math.max(daysInMonth - daysElapsed, 1);
  const today = new Date();
  const todayMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const isPastMonth = month && month < todayMonth;
  const availablePerDay = isPastMonth ? s.balance : s.balance / daysRemaining;

  const savingsStatus = getKPIStatus('savingsRate', savingsRate);
  const commitmentStatus = getKPIStatus('commitmentRate', commitmentRate);

  const availableBadgeLabel = isPastMonth ? 'Encerrado' : `${daysRemaining} dias restantes`;
  const availableBadgeClass = availablePerDay > 0 ? 'badge-status--normal' : 'badge-status--high';

  kpiEl.innerHTML = `<div class="kpi-grid">
    <div class="kpi-item">
      <div>
        <small>Taxa de poupan\u00e7a</small>
        <strong>${formatPercent(savingsRate)}%</strong>
      </div>
      <span class="badge-status ${savingsStatus.className}">${savingsStatus.label}</span>
    </div>
    <div class="kpi-item">
      <div>
        <small>Comprometimento da renda</small>
        <strong>${formatPercent(commitmentRate)}%</strong>
      </div>
      <span class="badge-status ${commitmentStatus.className}">${commitmentStatus.label}</span>
    </div>
    <div class="kpi-item">
      <div>
        <small>Dispon\u00edvel por dia</small>
        <strong>${formatMoney(availablePerDay)}</strong>
      </div>
      <span class="badge-status ${availableBadgeClass}">${availableBadgeLabel}</span>
    </div>
  </div>`;
}

function renderYTDSummary(items, month) {
  const ytdEl = document.getElementById('ytd-summary');
  if (!ytdEl) return;

  const year = month ? month.split('-')[0] : String(new Date().getFullYear());
  const yearItems = items.filter((tx) => tx.date.startsWith(year));

  if (!yearItems.length) {
    ytdEl.innerHTML = '<p class="empty">Sem dados acumulados para o ano.</p>';
    return;
  }

  const s = computeSummary(yearItems);
  const totalDiscounted = s.expense + s.investment + s.goal;
  const monthsWithData = new Set(yearItems.map((tx) => tx.date.slice(0, 7))).size;

  const rows = [
    ['Receitas', s.income, 'summary-item--income'],
    ['Despesas', s.expense, 'summary-item--expense'],
    ['Investimentos', s.investment, 'summary-item--investment'],
    ['Metas', s.goal, 'summary-item--goal'],
    ['Total descontado', totalDiscounted, 'summary-item--discounted'],
    ['Saldo anual', s.balance, s.balance >= 0 ? 'summary-item--balance-positive' : 'summary-item--balance-negative'],
  ];

  ytdEl.innerHTML = `<div class="ytd-grid">${rows
    .map(([label, value, modifier]) => {
      const avg = monthsWithData > 0 ? value / monthsWithData : 0;
      return `<div class="ytd-item ${modifier}">
        <small>${label}</small>
        <strong>${formatMoney(value)}</strong>
        <span class="ytd-avg">M\u00e9dia: ${formatMoney(avg)}/m\u00eas (${monthsWithData} meses)</span>
      </div>`;
    })
    .join('')}</div>`;
}

function findSeriesItems(items, seriesId) {
  return items
    .filter((tx) => tx.recurrence && tx.recurrence.seriesId === seriesId)
    .sort((a, b) => (a.date > b.date ? 1 : -1));
}

function getRecurringSignature(tx, includeStartDate = true) {
  if (!tx || !tx.recurrence) return null;
  const frequency = tx.recurrence.frequency === 'yearly' ? 'yearly' : 'monthly';
  const parts = [
    tx.type,
    normalizeText(String(tx.category || '')).toLocaleLowerCase('pt-BR'),
    normalizeText(String(tx.subcategory || '')).toLocaleLowerCase('pt-BR'),
    normalizeText(String(tx.description || '')).toLocaleLowerCase('pt-BR'),
    frequency,
  ];
  if (includeStartDate) {
    parts.push(tx.recurrence.startDate || tx.date);
  }
  return parts.join('|');
}

function findSeriesItemsBySignature(items, signature, includeStartDate = true) {
  if (!signature) return [];
  return items
    .filter((tx) => !!tx.recurrence && getRecurringSignature(tx, includeStartDate) === signature)
    .sort((a, b) => (a.date > b.date ? 1 : -1));
}

function resolveRecurringSeries(items, targetTx) {
  if (!targetTx || !targetTx.recurrence) return { seriesId: null, items: [] };

  const bySeriesId = targetTx.recurrence.seriesId ? findSeriesItems(items, targetTx.recurrence.seriesId) : [];
  const byStrictSignature = findSeriesItemsBySignature(items, getRecurringSignature(targetTx, true), true);
  const byRelaxedSignature = findSeriesItemsBySignature(items, getRecurringSignature(targetTx, false), false);

  let chosen = bySeriesId;
  if (chosen.length <= 1 && byStrictSignature.length > chosen.length) chosen = byStrictSignature;
  if (chosen.length <= 1 && byRelaxedSignature.length > chosen.length) chosen = byRelaxedSignature;

  const merged = [...bySeriesId, ...chosen].sort((a, b) => (a.date > b.date ? 1 : -1));
  const seen = new Set();
  const unique = merged.filter((tx) => {
    if (seen.has(tx.id)) return false;
    seen.add(tx.id);
    return true;
  });

  const firstSeriesItem = unique[0];
  const fallbackSeriesId =
    firstSeriesItem && firstSeriesItem.recurrence ? firstSeriesItem.recurrence.seriesId : null;

  return {
    seriesId: targetTx.recurrence.seriesId || fallbackSeriesId || createSeriesId(),
    items: unique,
  };
}

function recalcSeriesMetadata(items, seriesId) {
  const seriesItems = findSeriesItems(items, seriesId);
  if (!seriesItems.length) return;

  const total = seriesItems.length;
  const startDate = seriesItems[0].date;
  const baseAmount = seriesItems[0].amount;
  const frequency = seriesItems[0].recurrence && seriesItems[0].recurrence.frequency
    ? seriesItems[0].recurrence.frequency
    : 'monthly';

  seriesItems.forEach((tx, index) => {
    tx.recurrence = {
      ...tx.recurrence,
      seriesId,
      frequency,
      sequence: index + 1,
      total,
      startDate,
      baseAmount,
    };
  });
}

function recalcAllSeriesMetadata(items) {
  const seriesIds = new Set(
    items
      .filter((tx) => tx.recurrence && tx.recurrence.seriesId)
      .map((tx) => tx.recurrence.seriesId),
  );
  seriesIds.forEach((seriesId) => recalcSeriesMetadata(items, seriesId));
}

function migrateRecurringSeriesData(items) {
  const seriesByLegacyKey = new Map();
  let changed = false;

  const ordered = [...items].sort((a, b) => {
    if (a.date === b.date) return (a.id || '').localeCompare(b.id || '');
    return a.date > b.date ? 1 : -1;
  });

  ordered.forEach((tx) => {
    if (!tx.recurrence) return;
    const frequency = tx.recurrence.frequency === 'yearly' ? 'yearly' : 'monthly';
    const legacyKey = [
      frequency,
      tx.type,
      tx.category,
      tx.subcategory,
      tx.description,
      tx.recurrence.startDate || tx.date,
    ].join('|');

    if (!tx.recurrence.seriesId) {
      if (!seriesByLegacyKey.has(legacyKey)) {
        seriesByLegacyKey.set(legacyKey, createSeriesId());
      }
      tx.recurrence.seriesId = seriesByLegacyKey.get(legacyKey);
      changed = true;
    }

    if (!tx.recurrence.frequency || tx.recurrence.frequency !== frequency) {
      tx.recurrence.frequency = frequency;
      changed = true;
    }
  });

  recalcAllSeriesMetadata(items);
  return changed;
}

function renderList(items, month) {
  const monthItems = filterByMonth(items, month);
  const outflowItems = monthItems.filter((tx) => tx.type !== 'income');
  const sorted = [...monthItems].sort((a, b) => (a.date < b.date ? 1 : -1));

  const completedCount = monthItems.filter((tx) => tx.completed).length;
  const totalCount = monthItems.length;
  const completedAmount = outflowItems
    .filter((tx) => tx.completed)
    .reduce((sum, tx) => sum + tx.amount, 0);
  const pendingAmount = outflowItems
    .filter((tx) => !tx.completed)
    .reduce((sum, tx) => sum + tx.amount, 0);
  const counterEl = document.getElementById('tx-counter');
  const summaryEl = document.getElementById('tx-summary');
  if (counterEl) {
    counterEl.textContent = `${completedCount}/${totalCount}`;
  }
  if (summaryEl) {
    summaryEl.textContent = `Saídas — Realizado: ${formatMoney(completedAmount)} • Pendente: ${formatMoney(pendingAmount)}`;
  }

  txList.innerHTML = sorted
    .map(
      (tx) => `
      <li class="tx-item${tx.completed ? ' tx-completed' : ''}">
        <div>
          <strong>${tx.description}</strong>
          ${tx.recurrence ? '<span class="badge">recorrente</span>' : ''}
          ${tx.completed ? '<span class="badge badge--done">realizado</span>' : ''}
          <div class="tx-meta">${tx.type} • ${tx.category} › ${tx.subcategory || 'Outros'} • ${formatDateBR(tx.date)} • ${formatMoney(tx.amount)}</div>
        </div>
        <div class="tx-actions">
          <button class="complete-btn" data-id="${tx.id}" title="${tx.completed ? 'Desmarcar realizado' : 'Marcar como realizado'}">${tx.completed ? '✓' : '○'}</button>
          <button class="edit-btn" data-id="${tx.id}">Editar</button>
          <button class="delete-btn" data-id="${tx.id}">Excluir</button>
        </div>
      </li>
    `,
    )
    .join('');

  txList.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const confirmed = window.confirm('Deseja excluir este lançamento?');
      if (!confirmed) return;
      const next = loadTransactions().filter((item) => item.id !== id);
      saveTransactions(next);
      render();
    });
  });

  txList.querySelectorAll('.complete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const all = loadTransactions();
      const idx = all.findIndex((tx) => tx.id === id);
      if (idx !== -1) {
        all[idx] = { ...all[idx], completed: !all[idx].completed };
        saveTransactions(all);
        render();
      }
    });
  });

  txList.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      openEditModal(btn.getAttribute('data-id'));
    });
  });
}

function createRecurringTransactions(baseTx, frequency, count) {
  const txs = [];
  const seriesId = createSeriesId();
  const total = Math.max(1, Number(count) || 1);

  for (let index = 0; index < total; index += 1) {
    const date =
      frequency === 'yearly' ? addYears(baseTx.date, index) : addMonths(baseTx.date, index);

    txs.push({
      ...baseTx,
      id: crypto.randomUUID(),
      date,
      recurrence: {
        seriesId,
        frequency,
        sequence: index + 1,
        total,
        startDate: baseTx.date,
        baseAmount: baseTx.amount,
      },
    });
  }
  return txs;
}

function applyPatch(tx, patch) {
  const next = { ...tx };
  if (typeof patch.description === 'string') next.description = normalizeText(patch.description);
  if (typeof patch.category === 'string') next.category = normalizeText(patch.category);
  if (typeof patch.subcategory === 'string') next.subcategory = normalizeText(patch.subcategory);
  if (typeof patch.type === 'string') next.type = patch.type;
  if (patch.amount !== undefined) {
    const amount = sanitizeAmount(patch.amount);
    if (amount !== null) next.amount = amount;
  }
  if (typeof patch.date === 'string' && isValidDateString(patch.date)) next.date = patch.date;
  return next;
}

function adjustSeriesLength(items, seriesId, desiredTotal, cutoffDate = null) {
  const seriesItems = findSeriesItems(items, seriesId);
  if (!seriesItems.length) return;

  const existingTotal = seriesItems.length;
  const parsedDesired = Number(desiredTotal);
  if (!Number.isInteger(parsedDesired) || parsedDesired < 1) return;

  const lockedPastCount = cutoffDate ? seriesItems.filter((tx) => tx.date < cutoffDate).length : 0;
  const targetTotal = Math.max(parsedDesired, lockedPastCount);

  if (targetTotal < existingTotal) {
    const removable = cutoffDate
      ? seriesItems.filter((tx) => tx.date >= cutoffDate).sort((a, b) => (a.date < b.date ? 1 : -1))
      : [...seriesItems].sort((a, b) => (a.date < b.date ? 1 : -1));
    const removeCount = existingTotal - targetTotal;
    const idsToRemove = new Set(removable.slice(0, removeCount).map((tx) => tx.id));
    const kept = items.filter((tx) => !idsToRemove.has(tx.id));
    items.splice(0, items.length, ...kept);
    return;
  }

  if (targetTotal > existingTotal) {
    let last = seriesItems[seriesItems.length - 1];
    const frequency = last.recurrence && last.recurrence.frequency ? last.recurrence.frequency : 'monthly';
    while (findSeriesItems(items, seriesId).length < targetTotal) {
      const nextTx = {
        ...last,
        id: crypto.randomUUID(),
        date: getNextDate(last.date, frequency),
        recurrence: {
          ...last.recurrence,
          seriesId,
          frequency,
        },
      };
      items.push(nextTx);
      last = nextTx;
    }
  }
}

function applyRecurringEdit({ txId, scope, patch, recurrenceCount }) {
  const all = loadTransactions();
  const target = all.find((tx) => tx.id === txId);
  if (!target) return false;

  const isRecurring = !!target.recurrence;
  const normalizedScope = isRecurring ? scope : 'single';

  if (normalizedScope === 'single' || !isRecurring) {
    const index = all.findIndex((tx) => tx.id === txId);
    all[index] = applyPatch(all[index], patch);
    saveTransactions(all);
    return true;
  }

  const { seriesId, items: seriesItems } = resolveRecurringSeries(all, target);
  if (!seriesItems.length) return false;
  const targetIndex = seriesItems.findIndex((tx) => tx.id === txId);
  const cutoffDate = target.date;

  if (normalizedScope === 'future') {
    const frequency = target.recurrence && target.recurrence.frequency === 'yearly' ? 'yearly' : 'monthly';
    const shouldShiftDates = typeof patch.date === 'string' && isValidDateString(patch.date);
    const anchorDate = shouldShiftDates ? patch.date : cutoffDate;

    const pastSeriesItems = seriesItems.filter((tx) => tx.date < cutoffDate);
    const futureSeriesItems = seriesItems.filter((tx) => tx.date >= cutoffDate);

    const parsedCount = Number(recurrenceCount);
    const hasDesiredCount = Number.isInteger(parsedCount) && parsedCount >= 1;
    const minTotal = pastSeriesItems.length + 1;
    const targetTotal = hasDesiredCount ? Math.max(parsedCount, minTotal) : seriesItems.length;
    const targetFutureCount = Math.max(1, targetTotal - pastSeriesItems.length);

    const targetDates = Array.from({ length: targetFutureCount }, (_, index) =>
      frequency === 'yearly' ? addYears(anchorDate, index) : addMonths(anchorDate, index),
    );

    const futureByDate = new Map();
    futureSeriesItems.forEach((tx) => {
      if (!futureByDate.has(tx.date)) futureByDate.set(tx.date, tx);
    });

    const futureIds = new Set(futureSeriesItems.map((tx) => tx.id));
    const rebuiltFuture = targetDates.map((date) => {
      const existing = futureByDate.get(date) || (date === cutoffDate ? target : null);
      const baseTx = existing ? { ...existing } : { ...target, id: crypto.randomUUID() };
      const nextTx = applyPatch(baseTx, { ...patch, date });
      nextTx.recurrence = {
        ...(nextTx.recurrence || {}),
        seriesId,
        frequency,
      };
      futureIds.delete(nextTx.id);
      return nextTx;
    });

    const kept = all.filter((tx) => !futureIds.has(tx.id));
    const rebuiltIds = new Set(rebuiltFuture.map((tx) => tx.id));
    const merged = [...kept.filter((tx) => !rebuiltIds.has(tx.id)), ...rebuiltFuture];
    all.splice(0, all.length, ...merged);

    const canonicalSeries = findSeriesItems(all, seriesId);
    if (canonicalSeries.length <= 1) {
      const resolvedIds = new Set(seriesItems.map((tx) => tx.id));
      all.forEach((tx) => {
        if (!resolvedIds.has(tx.id) && !rebuiltIds.has(tx.id)) return;
        if (!tx.recurrence) tx.recurrence = {};
        tx.recurrence.seriesId = seriesId;
        tx.recurrence.frequency = frequency;
      });
    }

    recalcSeriesMetadata(all, seriesId);
    saveTransactions(all);
    return true;
  }

  const affectedItems = (
    normalizedScope === 'future'
      ? targetIndex >= 0
        ? seriesItems.slice(targetIndex)
        : seriesItems.filter((tx) => tx.date >= cutoffDate)
      : seriesItems
  ).sort((a, b) => a.date.localeCompare(b.date, 'pt-BR'));
  const affectedIds = new Set(affectedItems.map((tx) => tx.id));

  const shouldShiftDates = typeof patch.date === 'string' && isValidDateString(patch.date);
  const sequenceDatesById = new Map();
  if (shouldShiftDates && affectedItems.length) {
    const frequency = affectedItems[0].recurrence && affectedItems[0].recurrence.frequency
      ? affectedItems[0].recurrence.frequency
      : 'monthly';
    affectedItems.forEach((tx, index) => {
      const date = frequency === 'yearly' ? addYears(patch.date, index) : addMonths(patch.date, index);
      sequenceDatesById.set(tx.id, date);
    });
  }

  const updated = all.map((tx) => {
    if (!affectedIds.has(tx.id)) return tx;
    const scopedPatch = {
      ...patch,
      date: shouldShiftDates ? sequenceDatesById.get(tx.id) : tx.date,
    };
    return applyPatch(tx, scopedPatch);
  });

  all.splice(0, all.length, ...updated);

  if (recurrenceCount !== undefined && recurrenceCount !== null && recurrenceCount !== '') {
    adjustSeriesLength(all, seriesId, recurrenceCount, normalizedScope === 'future' ? cutoffDate : null);
  }

  recalcSeriesMetadata(all, seriesId);
  saveTransactions(all);
  return true;
}

function estimateRecurringImpact(items, tx, scope, recurrenceCount) {
  if (!tx || !tx.recurrence || scope === 'single') return 'Impacto: 1 lançamento.';
  const { items: seriesItems } = resolveRecurringSeries(items, tx);
  if (!seriesItems.length) return 'Impacto: 1 lançamento.';
  const affected = scope === 'future' ? seriesItems.filter((item) => item.date >= tx.date) : seriesItems;

  const parsedCount = Number(recurrenceCount);
  if (!Number.isInteger(parsedCount) || parsedCount < 1) {
    return `Impacto estimado: ${affected.length} lançamento(s) alterado(s).`;
  }

  if (scope === 'future') {
    const frequency = tx.recurrence.frequency === 'yearly' ? 'yearly' : 'monthly';
    const lockedPastCount = seriesItems.filter((item) => item.date < tx.date).length;
    const targetTotal = Math.max(parsedCount, lockedPastCount + 1);
    const targetFutureCount = Math.max(1, targetTotal - lockedPastCount);
    const targetDates = Array.from({ length: targetFutureCount }, (_, index) =>
      frequency === 'yearly' ? addYears(tx.date, index) : addMonths(tx.date, index),
    );
    const existingFutureDates = new Set(seriesItems.filter((item) => item.date >= tx.date).map((item) => item.date));

    let updated = 0;
    let created = 0;
    targetDates.forEach((date) => {
      if (existingFutureDates.has(date)) updated += 1;
      else created += 1;
    });
    const removed = Math.max(0, existingFutureDates.size - updated);

    return `Impacto estimado: ${updated} lançamento(s) atualizado(s), +${created} novo(s) e ${removed} removido(s).`;
  }

  const lockedPastCount = scope === 'future' ? seriesItems.filter((item) => item.date < tx.date).length : 0;
  const targetTotal = Math.max(parsedCount, lockedPastCount);
  const resizedDelta = targetTotal - seriesItems.length;

  if (resizedDelta === 0) {
    return `Impacto estimado: ${affected.length} lançamento(s) alterado(s), duração inalterada (${seriesItems.length}).`;
  }

  if (resizedDelta > 0) {
    return `Impacto estimado: ${affected.length} lançamento(s) alterado(s) e +${resizedDelta} nova(s) ocorrência(s).`;
  }

  return `Impacto estimado: ${affected.length} lançamento(s) alterado(s) e ${Math.abs(resizedDelta)} ocorrência(s) futura(s) removida(s).`;
}

function openEditModal(txId) {
  const items = loadTransactions();
  const tx = items.find((item) => item.id === txId);
  if (!tx) return;

  const categories = loadCategories();
  const categoryNames = Object.keys(categories).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  editCategoryInput.innerHTML = categoryNames.map((name) => `<option value="${name}">${name}</option>`).join('');

  editTxIdInput.value = tx.id;
  editTypeInput.value = tx.type;
  editCategoryInput.value = tx.category;
  syncEditSubcategories();
  editSubcategoryInput.value = tx.subcategory;
  editDescriptionInput.value = tx.description;
  editAmountInput.value = tx.amount;
  editDateInput.value = tx.date;

  const isRecurring = !!tx.recurrence;
  editScopeWrap.classList.toggle('hidden', !isRecurring);
  editRecurrenceCountWrap.classList.toggle('hidden', !isRecurring);
  editRecurrenceCountInput.value = isRecurring ? tx.recurrence.total : '';

  const defaultScope = isRecurring ? 'single' : 'single';
  editForm.querySelectorAll('input[name="edit-scope"]').forEach((radio) => {
    radio.checked = radio.value === defaultScope;
    radio.disabled = !isRecurring;
  });

  editImpactEl.textContent = estimateRecurringImpact(items, tx, defaultScope, editRecurrenceCountInput.value);
  editModal.classList.remove('hidden');
}

function closeEditModal() {
  editModal.classList.add('hidden');
  editForm.reset();
}

function getSelectedEditScope() {
  const selected = editForm.querySelector('input[name="edit-scope"]:checked');
  return selected ? selected.value : 'single';
}

function refreshEditImpact() {
  const items = loadTransactions();
  const tx = items.find((item) => item.id === editTxIdInput.value);
  if (!tx) return;
  const scope = getSelectedEditScope();
  editImpactEl.textContent = estimateRecurringImpact(items, tx, scope, editRecurrenceCountInput.value);
}

function render() {
  const txs = loadTransactions();
  const selectedMonth = getCurrentMonthFilter();
  renderSummary(txs, selectedMonth);
  renderFinancialKPIs(txs, selectedMonth);
  renderYTDSummary(txs, selectedMonth);
  renderTypeCompositionChart(txs, selectedMonth);
  renderInflowOutflowChart(txs, selectedMonth);
  renderCategoryChart(txs, selectedMonth);
  renderSubcategoryChart(txs, selectedMonth);
  renderMonthlyChart(txs);
  renderDashboardInsights(txs, selectedMonth);
  renderList(txs, selectedMonth);
}


function buildBaseTransaction(input) {
  return {
    type: input.type,
    category: normalizeText(input.category || ''),
    subcategory: normalizeText(input.subcategory || ''),
    description: normalizeText(input.description || ''),
    amount: sanitizeAmount(input.amount),
    date: input.date,
    recurrence: null,
  };
}

function saveTransactionWithValidation(baseTx, recurrenceConfig = null) {
  if (!baseTx.description || !baseTx.amount || !isValidDateString(baseTx.date) || !baseTx.category || !baseTx.subcategory) {
    return false;
  }

  const all = loadTransactions();
  if (recurrenceConfig && recurrenceConfig.enabled) {
    const recurringTxs = createRecurringTransactions(baseTx, recurrenceConfig.frequency, recurrenceConfig.count);
    all.push(...recurringTxs);
  } else {
    all.push({ ...baseTx, id: crypto.randomUUID(), completed: true });
  }

  saveTransactions(all);
  return true;
}

function renderQuickTypeButtons() {
  if (!quickEntryTypeButtons.length) return;
  quickEntryTypeButtons.forEach((button) => {
    const isActive = button.dataset.type === quickEntryState.type;
    button.classList.toggle('selected', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function renderQuickSubcategoryGrid() {
  if (!quickSubcategoryGrid) return;
  const categories = loadCategories();
  const selectedCategory = quickEntryState.category;
  const selectedSubs = categories[selectedCategory] || [];

  if (quickSubcategoryTitle) {
    quickSubcategoryTitle.textContent = selectedCategory
      ? `Subcategoria de ${selectedCategory}`
      : 'Subcategoria';
  }

  if (!selectedSubs.length) {
    quickSubcategoryGrid.innerHTML = '<p class="quick-entry-empty">Selecione uma categoria para ver as subcategorias.</p>';
    return;
  }

  quickSubcategoryGrid.innerHTML = selectedSubs
    .map((name) => `<button type="button" class="quick-chip ${name === quickEntryState.subcategory ? 'selected' : ''}" data-subcategory="${name}">${name}</button>`)
    .join('');

  quickSubcategoryGrid.querySelectorAll('[data-subcategory]').forEach((button) => {
    button.addEventListener('click', () => {
      quickEntryState.subcategory = button.dataset.subcategory || '';
      renderQuickSubcategoryGrid();
    });
  });
}

function renderQuickCategoryGrid() {
  if (!quickCategoryGrid) return;
  const categories = loadCategories();
  const categoryNames = Object.keys(categories).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  if (!categoryNames.length) {
    quickCategoryGrid.innerHTML = '<p class="quick-entry-empty">Cadastre ao menos uma categoria.</p>';
    quickSubcategoryGrid.innerHTML = '';
    return;
  }

  quickCategoryGrid.innerHTML = categoryNames
    .map((name) => `<button type="button" class="quick-chip ${name === quickEntryState.category ? 'selected' : ''}" data-category="${name}">${name}</button>`)
    .join('');

  quickCategoryGrid.querySelectorAll('[data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      quickEntryState.category = button.dataset.category || '';
      const subs = categories[quickEntryState.category] || [];
      quickEntryState.subcategory = subs[0] || '';
      renderQuickCategoryGrid();
      renderQuickSubcategoryGrid();
    });
  });

  renderQuickSubcategoryGrid();
}

function syncQuickEntryOptions() {
  if (!quickEntryTypeButtons.length) return;
  const categories = loadCategories();
  const categoryNames = Object.keys(categories).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  if (!categoryNames.includes(quickEntryState.category)) {
    quickEntryState.category = categoryNames[0] || '';
  }

  const subcategories = categories[quickEntryState.category] || [];
  if (!subcategories.includes(quickEntryState.subcategory)) {
    quickEntryState.subcategory = subcategories[0] || '';
  }

  renderQuickTypeButtons();
  renderQuickCategoryGrid();
}

function resetQuickEntry() {
  applyEntryDefaults();
  syncQuickEntryOptions();
}

async function refreshAppWithoutLosingData() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('finance-pwa-')).map((key) => caches.delete(key)));
  }

  window.location.reload();
}


function reportMissingElement(id, context) {
  console.error(`[init] Elemento obrigatório ausente: #${id} (${context})`);
}

navTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    setActiveView(tab.dataset.navView);
  });
});

if (categoryForm) {
  categoryForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    addCategoryAndSubcategory(
      document.getElementById('new-category').value,
      document.getElementById('new-subcategory').value,
    );
    categoryForm.reset();
    syncCategoryOptions();
    render();
  });
} else {
  reportMissingElement('category-form', 'cadastro de categorias');
}

if (reportCategoryFilter) {
  reportCategoryFilter.addEventListener('change', () => {
    syncReportCategoryDropdown();
    render();
  });
}

if (reportTypeFilter) {
  reportTypeFilter.addEventListener('change', render);
} else {
  reportMissingElement('report-type-filter', 'filtro de tipo do dashboard');
}

if (reportCategoryToggle && reportCategoryDropdown) {
  reportCategoryToggle.addEventListener('click', () => {
    const isOpen = reportCategoryDropdown.dataset.open === 'true';
    setReportCategoryDropdownOpen(!isOpen);
  });

  document.addEventListener('click', (event) => {
    if (!reportCategoryDropdown.contains(event.target)) {
      setReportCategoryDropdownOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setReportCategoryDropdownOpen(false);
    }
  });
}

if (recurringCheckbox && recurrenceFields) {
  recurringCheckbox.addEventListener('change', () => {
    recurrenceFields.classList.toggle('hidden', !recurringCheckbox.checked);
  });
}

if (monthFilterInput) {
  monthFilterInput.addEventListener('change', render);
} else {
  reportMissingElement('month-filter', 'filtro mensal');
}

if (editCategoryInput) {
  editCategoryInput.addEventListener('change', () => {
    syncEditSubcategories();
    refreshEditImpact();
  });
}

if (editForm) {
  editForm.querySelectorAll('input[name="edit-scope"]').forEach((radio) => {
    radio.addEventListener('change', refreshEditImpact);
  });

  editForm.addEventListener('submit', (ev) => {
    ev.preventDefault();

    const txId = editTxIdInput.value;
    const scope = getSelectedEditScope();
    const patch = {
      type: editTypeInput.value,
      category: editCategoryInput.value,
      subcategory: editSubcategoryInput.value,
      description: editDescriptionInput.value,
      amount: editAmountInput.value,
      date: editDateInput.value,
    };

    if (!normalizeText(patch.description) || !sanitizeAmount(patch.amount) || !isValidDateString(patch.date)) return;

    const recurrenceCount = editRecurrenceCountInput.value ? Number(editRecurrenceCountInput.value) : undefined;
    applyRecurringEdit({ txId, scope, patch, recurrenceCount });
    closeEditModal();
    render();
  });
} else {
  reportMissingElement('edit-form', 'edição de lançamentos');
}

if (editRecurrenceCountInput) editRecurrenceCountInput.addEventListener('input', refreshEditImpact);
if (editDateInput) editDateInput.addEventListener('change', refreshEditImpact);
if (cancelEditButton) cancelEditButton.addEventListener('click', closeEditModal);

if (form) {
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const descriptionValue = normalizeText(document.getElementById('description').value || '');
    const autoDescription = descriptionValue || `${quickEntryState.subcategory || quickEntryState.category || 'Sem categoria'}`;

    const baseTx = buildBaseTransaction({
      type: quickEntryState.type,
      category: quickEntryState.category,
      subcategory: quickEntryState.subcategory,
      description: autoDescription,
      amount: document.getElementById('amount').value,
      date: document.getElementById('date').value,
    });

    const recurrenceConfig = recurringCheckbox && recurringCheckbox.checked
      ? {
        enabled: true,
        frequency: document.getElementById('recurrence-frequency').value,
        count: Number(document.getElementById('recurrence-count').value || 12),
      }
      : null;

    if (!baseTx.category || !baseTx.subcategory) {
      window.alert('Selecione categoria e subcategoria.');
      return;
    }

    addCategoryAndSubcategory(baseTx.category, baseTx.subcategory);

    if (!saveTransactionWithValidation(baseTx, recurrenceConfig)) {
      window.alert('Preencha valor e data para salvar.');
      return;
    }

    form.reset();
    if (recurrenceFields) recurrenceFields.classList.add('hidden');
    syncCategoryOptions();
    resetQuickEntry();
    render();
  });
} else {
  reportMissingElement('tx-form', 'criação de lançamento');
}

quickEntryTypeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    quickEntryState.type = button.dataset.type || 'expense';
    if (typeHiddenInput) typeHiddenInput.value = quickEntryState.type;
    renderQuickTypeButtons();
  });
});

if (refreshAppButton) {
  refreshAppButton.addEventListener('click', () => {
    refreshAppWithoutLosingData().catch(console.error);
  });
}

if (exportDataButton) {
  exportDataButton.addEventListener('click', () => {
    downloadBackupFile(buildBackupPayload());
  });
}

if (importDataButton) {
  importDataButton.addEventListener('click', () => {
    const file = importDataInput && importDataInput.files ? importDataInput.files[0] : null;
    if (!file) {
      window.alert('Selecione um arquivo .json para importar.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || '{}'));
        const validation = validateBackupPayload(payload);
        if (!validation.valid) {
          window.alert(validation.message);
          return;
        }

        const result = importBackupPayload(payload);
        if (result.ok) {
          importDataInput.value = '';
          window.alert(`Backup importado com sucesso (${result.importedCount} lançamento(s)).`);
        } else if (!result.cancelled) {
          window.alert(result.message || 'Não foi possível importar o backup.');
        }
      } catch {
        window.alert('Não foi possível ler o arquivo. Verifique se ele é um JSON válido exportado pelo app.');
      }
    };
    reader.readAsText(file);
  });
}

if (sessionForm) {
  sessionForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const result = await signIn(
      authIdentifierInput ? authIdentifierInput.value : '',
      authSecretInput ? authSecretInput.value : '',
    );

    if (!result.ok) {
      window.alert(result.message || 'Não foi possível entrar.');
      return;
    }

    lastSyncError = null;
    hasPendingConflict = false;
    renderSessionState();
    await handleRemoteBackupOnSignIn();
  });
}

if (createAccountButton) {
  createAccountButton.addEventListener('click', async () => {
    const result = await registerAccount(
      authIdentifierInput ? authIdentifierInput.value : '',
      authSecretInput ? authSecretInput.value : '',
    );

    if (!result.ok) {
      window.alert(result.message || 'Não foi possível criar conta.');
      return;
    }

    lastSyncError = null;
    hasPendingConflict = false;
    renderSessionState();
    window.alert(result.message || 'Conta criada e autenticada com sucesso.');
    await handleRemoteBackupOnSignIn();
  });
}

if (forgotPasswordToggleButton) {
  forgotPasswordToggleButton.addEventListener('click', () => {
    isPasswordRecoveryVisible = !isPasswordRecoveryVisible;
    renderPasswordRecoveryVisibility();
    if (isPasswordRecoveryVisible && passwordResetIdentifierInput && authIdentifierInput) {
      passwordResetIdentifierInput.value = normalizeText(String(authIdentifierInput.value || ''));
    }
  });
}

if (passwordResetRequestForm) {
  passwordResetRequestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = await requestPasswordReset(passwordResetIdentifierInput ? passwordResetIdentifierInput.value : '');
    if (!result.ok) {
      setPasswordResetStatus(result.message || 'Falha ao solicitar reset de senha.');
      return;
    }

    if (passwordResetTokenInput && result.token) {
      passwordResetTokenInput.value = result.token;
    }

    if (result.token && result.expiresAt) {
      const expires = new Date(result.expiresAt).toLocaleString('pt-BR');
      setPasswordResetStatus(`Token emitido com sucesso. Expira em ${expires}.`);
      return;
    }

    setPasswordResetStatus(result.message || 'Solicitação enviada com sucesso.');
  });
}

if (passwordResetConfirmForm) {
  passwordResetConfirmForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = await confirmPasswordReset(
      passwordResetTokenInput ? passwordResetTokenInput.value : '',
      passwordResetSecretInput ? passwordResetSecretInput.value : '',
    );

    if (!result.ok) {
      setPasswordResetStatus(result.message || 'Falha ao redefinir senha.');
      return;
    }

    if (passwordResetSecretInput) passwordResetSecretInput.value = '';
    setPasswordResetStatus(result.message || 'Senha redefinida com sucesso.');
  });
}

if (signOutButton) {
  signOutButton.addEventListener('click', async () => {
    await signOut();
    renderSessionState();
  });
}

window.addEventListener('online', () => {
  updateSyncStatus();
  scheduleSyncRetry(300);
});
window.addEventListener('offline', updateSyncStatus);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(console.error);
}

async function initializeApplication() {
  const restoredSession = await loadSession();
  if (restoredSession && restoredSession.ok) {
    currentUser = restoredSession.user;
  } else {
    currentUser = null;
    if (restoredSession && restoredSession.reason === 'session-expired') {
      setLastSyncError('Sessão expirada');
      window.alert('Sua sessão expirou. Entre novamente para continuar sincronizando com sua conta.');
    }
  }

  renderSessionState();
  renderPasswordRecoveryVisibility();
  setPasswordResetStatus('Solicite um token e em seguida informe token + nova senha para concluir.');
  if (currentUser) scheduleSyncRetry(300);

  migrateLegacyData();
  const txs = loadTransactions();
  if (migrateRecurringSeriesData(txs)) {
    saveTransactions(txs);
  }
  syncCategoryOptions();
  resetQuickEntry();
  setActiveView(activeView);
  render();
}

initializeApplication().catch((error) => {
  console.error(error);
  renderSessionState();
});
