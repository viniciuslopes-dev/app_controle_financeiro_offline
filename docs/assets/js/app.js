const STORAGE_KEY = 'finance_offline_transactions_v2';
const LEGACY_STORAGE_KEY = 'finance_offline_transactions_v1';
const CATEGORY_STORAGE_KEY = 'finance_offline_categories_v1';

const DEFAULT_CATEGORIES = {
  Moradia: ['Aluguel', 'Luz', 'Água', 'Internet'],
  Alimentação: ['Mercado', 'Restaurantes'],
  Transporte: ['Combustível', 'Transporte público'],
};

const FALLBACK_CATEGORY = 'Geral';
const FALLBACK_SUBCATEGORY = 'Outros';

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
const dateInput = document.getElementById('date');
const monthFilterInput = document.getElementById('month-filter');
const categoryInput = document.getElementById('category');
const subcategoryInput = document.getElementById('subcategory');
const reportCategoryFilter = document.getElementById('report-category-filter');
const reportTypeFilter = document.getElementById('report-type-filter');
const recurringCheckbox = document.getElementById('is-recurring');
const recurrenceFields = document.getElementById('recurrence-fields');
const refreshAppButton = document.getElementById('refresh-app');
const exportDataButton = document.getElementById('export-data');
const importDataInput = document.getElementById('import-data-file');
const importDataButton = document.getElementById('import-data');

const quickEntryTypeButtons = document.querySelectorAll('.quick-type-btn');
const quickCategoryGrid = document.getElementById('quick-category-grid');
const quickSubcategoryGrid = document.getElementById('quick-subcategory-grid');
const quickAmountInput = document.getElementById('quick-amount');
const quickDateInput = document.getElementById('quick-date');
const quickSaveButton = document.getElementById('quick-save');

const quickEntryState = {
  type: 'expense',
  category: '',
  subcategory: '',
  amount: '',
  date: '',
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

dateInput.value = new Date().toISOString().slice(0, 10);
monthFilterInput.value = new Date().toISOString().slice(0, 7);
if (quickDateInput) quickDateInput.value = dateInput.value;
quickEntryState.date = dateInput.value;

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

  categoryInput.innerHTML = categoryNames.map((name) => `<option value="${name}">${name}</option>`).join('');
  reportCategoryFilter.innerHTML = ['<option value="">Todas</option>']
    .concat(categoryNames.map((name) => `<option value="${name}">${name}</option>`))
    .join('');

  if (!categoryInput.value || !categories[categoryInput.value]) {
    categoryInput.value = categoryNames[0] || '';
  }

  syncSubcategoryOptions();
  syncQuickEntryOptions();
  renderCategoryList();
}

function syncSubcategoryOptions() {
  const categories = loadCategories();
  const selectedCategory = categoryInput.value;
  const subs = categories[selectedCategory] || [];

  subcategoryInput.innerHTML = subs.map((name) => `<option value="${name}">${name}</option>`).join('');
  if (!subcategoryInput.value || !subs.includes(subcategoryInput.value)) {
    subcategoryInput.value = subs[0] || '';
  }
}

function syncEditSubcategories() {
  const categories = loadCategories();
  const subs = categories[editCategoryInput.value] || [];
  editSubcategoryInput.innerHTML = subs.map((name) => `<option value="${name}">${name}</option>`).join('');
  if (!subs.includes(editSubcategoryInput.value)) {
    editSubcategoryInput.value = subs[0] || '';
  }
}

function renderCategoryList() {
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

function loadTransactions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveTransactions(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function sanitizeTransaction(tx) {
  if (!tx || typeof tx !== 'object') return null;

  const description = normalizeText(String(tx.description || ''));
  const amount = sanitizeAmount(tx.amount);
  const date = typeof tx.date === 'string' ? tx.date : '';
  const type = ['income', 'expense', 'investment', 'goal'].includes(tx.type) ? tx.type : null;

  if (!description || amount === null || !isValidDateString(date) || !type) return null;

  const category = normalizeText(String(tx.category || FALLBACK_CATEGORY)) || FALLBACK_CATEGORY;
  const subcategory = normalizeText(String(tx.subcategory || FALLBACK_SUBCATEGORY)) || FALLBACK_SUBCATEGORY;

  return {
    id: typeof tx.id === 'string' && tx.id ? tx.id : crypto.randomUUID(),
    type,
    category,
    subcategory,
    description,
    amount,
    date,
    recurrence: tx.recurrence && typeof tx.recurrence === 'object' ? tx.recurrence : null,
  };
}

function buildBackupPayload() {
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    transactions: loadTransactions(),
    categories: loadCategories(),
  };
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
  if (payload.version !== '1.0') {
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

function importBackupPayload(payload) {
  const categories = normalizeImportedCategories(payload.categories || {});
  const transactions = payload.transactions.map((tx) => sanitizeTransaction(tx)).filter(Boolean);

  transactions.forEach((tx) => {
    if (!categories[tx.category]) categories[tx.category] = [];
    if (!categories[tx.category].includes(tx.subcategory)) {
      categories[tx.category].push(tx.subcategory);
    }
  });

  if (!transactions.length) {
    return { ok: false, message: 'Nenhum lançamento válido foi encontrado no arquivo.' };
  }

  if (!window.confirm('Importar backup irá substituir os dados atuais. Deseja continuar?')) {
    return { ok: false, cancelled: true };
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

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDateBR(value) {
  if (!isValidDateString(value)) return value;

  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function computeSummary(items) {
  const totals = { income: 0, expense: 0, investment: 0, goal: 0 };
  for (const tx of items) totals[tx.type] += tx.amount;
  const balance = totals.income - totals.expense - totals.investment - totals.goal;
  return { ...totals, balance };
}

function getCurrentMonthFilter() {
  return monthFilterInput.value;
}

function filterByMonth(items, month) {
  if (!month) return items;
  return items.filter((tx) => tx.date.startsWith(month));
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

function renderSummary(items, month) {
  const monthItems = filterByMonth(items, month);
  const s = computeSummary(monthItems);

  const totalDiscounted = s.expense + s.investment + s.goal;

  summaryEl.innerHTML = [
    ['Receitas', s.income],
    ['Despesas', s.expense],
    ['Investimentos', s.investment],
    ['Metas', s.goal],
    ['Total descontado', totalDiscounted],
    ['Saldo', s.balance],
  ]
    .map(
      ([label, value]) => `
      <div class="summary-item">
        <small>${label}</small>
        <strong>${formatMoney(value)}</strong>
      </div>
    `,
    )
    .join('');
}

function renderBars(
  container,
  rows,
  emptyMessage = 'Sem dados para o período selecionado.',
  options = {},
) {
  const { summaryLabel = 'Total', summaryValue, tone = 'default' } = options;

  if (!rows.length) {
    container.innerHTML = `<p class="empty">${emptyMessage}</p>`;
    return;
  }

  const total = rows.reduce((acc, row) => acc + row.value, 0);
  const headerValue = summaryValue ?? total;
  const maxValue = Math.max(...rows.map((r) => r.value), 1);
  container.innerHTML = `<p class="chart-total">${summaryLabel}: <strong>${formatMoney(headerValue)}</strong></p>` + rows
    .map((row) => {
      const width = Math.max((row.value / maxValue) * 100, 2);
      const rowTone = row.tone || tone;
      return `
        <div class="bar-row">
          <small>${row.label}</small>
          <div class="bar bar-${rowTone}"><span style="width:${width}%"></span></div>
          <strong>${formatMoney(row.value)}</strong>
        </div>
      `;
    })
    .join('');
}

function renderInflowOutflowChart(items, month) {
  const monthItems = filterByMonth(items, month);
  const summary = computeSummary(monthItems);
  const outflow = summary.expense + summary.investment + summary.goal;
  const netFlow = summary.income - outflow;
  const rows = [
    { label: 'Entradas', value: summary.income, tone: 'income' },
    {
      label: 'Saídas',
      value: outflow,
      tone: 'outflow',
    },
  ];

  renderBars(inflowOutflowChartEl, rows, 'Sem dados de entradas e saídas para o período selecionado.', {
    summaryLabel: 'Diferença (Entradas - Saídas)',
    summaryValue: netFlow,
  });
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

  renderBars(typeCompositionChartEl, rows, 'Sem despesas, investimentos ou metas para o período selecionado.');
}

function renderCategoryChart(items, month) {
  const selectedType = reportTypeFilter.value;
  const filtered = filterByMonthAndType(items, month, selectedType);
  const byCategory = filtered.reduce((acc, tx) => {
    acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
    return acc;
  }, {});

  const rows = Object.entries(byCategory)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const tone = selectedType === 'income' ? 'income' : selectedType === 'all' ? 'default' : 'outflow';
  renderBars(
    categoryChartEl,
    rows,
    `Sem lançamentos de ${getTypeLabel(selectedType).toLowerCase()} para este filtro.`,
    { tone },
  );
}

function renderSubcategoryChart(items, month) {
  const selectedCategory = reportCategoryFilter.value;
  const selectedType = reportTypeFilter.value;
  const filteredByType = filterByMonthAndType(items, month, selectedType);
  const filtered = selectedCategory
    ? filteredByType.filter((tx) => tx.category === selectedCategory)
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
  renderBars(
    subcategoryChartEl,
    rows,
    `Sem subcategorias para ${getTypeLabel(selectedType).toLowerCase()} neste filtro.`,
    { tone },
  );
}

function renderMonthlyChart(items) {
  const selectedType = reportTypeFilter.value;
  const filteredByType = filterByType(items, selectedType);
  const monthly = filteredByType.reduce((acc, tx) => {
    const month = tx.date.slice(0, 7);
    acc[month] = (acc[month] || 0) + tx.amount;
    return acc;
  }, {});

  const rows = Object.entries(monthly)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => (a.label > b.label ? 1 : -1))
    .slice(-12);

  const average = rows.length ? rows.reduce((acc, row) => acc + row.value, 0) / rows.length : 0;
  const tone = selectedType === 'income' ? 'income' : selectedType === 'all' ? 'default' : 'outflow';

  renderBars(
    monthlyChartEl,
    rows,
    `Sem evolução mensal para ${getTypeLabel(selectedType).toLowerCase()} no período.`,
    { summaryLabel: 'Média mensal', summaryValue: average, tone },
  );
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

  return {
    seriesId: targetTx.recurrence.seriesId || unique[0]?.recurrence?.seriesId || createSeriesId(),
    items: unique,
  };
}

function recalcSeriesMetadata(items, seriesId) {
  const seriesItems = findSeriesItems(items, seriesId);
  if (!seriesItems.length) return;

  const total = seriesItems.length;
  const startDate = seriesItems[0].date;
  const baseAmount = seriesItems[0].amount;
  const frequency = seriesItems[0].recurrence?.frequency || 'monthly';

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
  const filtered = filterByMonth(items, month);
  const sorted = [...filtered].sort((a, b) => (a.date < b.date ? 1 : -1));

  txList.innerHTML = sorted
    .map(
      (tx) => `
      <li class="tx-item">
        <div>
          <strong>${tx.description}</strong>
          ${tx.recurrence ? '<span class="badge">recorrente</span>' : ''}
          <div class="tx-meta">${tx.type} • ${tx.category} › ${tx.subcategory || 'Outros'} • ${formatDateBR(tx.date)} • ${formatMoney(tx.amount)}</div>
        </div>
        <div class="tx-actions">
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
      const next = loadTransactions().filter((item) => item.id !== id);
      saveTransactions(next);
      render();
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
    const frequency = last.recurrence?.frequency || 'monthly';
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
    const frequency = target.recurrence?.frequency === 'yearly' ? 'yearly' : 'monthly';
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
    const frequency = affectedItems[0].recurrence?.frequency || 'monthly';
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
  renderTypeCompositionChart(txs, selectedMonth);
  renderInflowOutflowChart(txs, selectedMonth);
  renderCategoryChart(txs, selectedMonth);
  renderSubcategoryChart(txs, selectedMonth);
  renderMonthlyChart(txs);
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
    all.push({ ...baseTx, id: crypto.randomUUID() });
  }

  saveTransactions(all);
  return true;
}

function syncQuickEntryFromForm() {
  if (!quickEntryTypeButtons.length) return;
  quickEntryState.type = document.getElementById('type').value || quickEntryState.type;
  quickEntryState.category = normalizeText(categoryInput.value || '');
  quickEntryState.subcategory = normalizeText(subcategoryInput.value || '');
  quickEntryState.amount = '';
  quickEntryState.date = dateInput.value;
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
  const selectedSubs = categories[quickEntryState.category] || [];

  if (!selectedSubs.length) {
    quickSubcategoryGrid.innerHTML = '<p class="quick-entry-empty">Selecione uma categoria.</p>';
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
  quickEntryState.amount = '';
  quickEntryState.date = new Date().toISOString().slice(0, 10);
  if (quickAmountInput) quickAmountInput.value = '';
  if (quickDateInput) quickDateInput.value = quickEntryState.date;
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

categoryInput.addEventListener('change', syncSubcategoryOptions);
reportCategoryFilter.addEventListener('change', render);
reportTypeFilter.addEventListener('change', render);

recurringCheckbox.addEventListener('change', () => {
  recurrenceFields.classList.toggle('hidden', !recurringCheckbox.checked);
});

monthFilterInput.addEventListener('change', render);

editCategoryInput.addEventListener('change', () => {
  syncEditSubcategories();
  refreshEditImpact();
});
editForm.querySelectorAll('input[name="edit-scope"]').forEach((radio) => {
  radio.addEventListener('change', refreshEditImpact);
});
editRecurrenceCountInput.addEventListener('input', refreshEditImpact);
editDateInput.addEventListener('change', refreshEditImpact);
cancelEditButton.addEventListener('click', closeEditModal);

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

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const baseTx = buildBaseTransaction({
    type: document.getElementById('type').value,
    category: categoryInput.value,
    subcategory: subcategoryInput.value,
    description: document.getElementById('description').value,
    amount: document.getElementById('amount').value,
    date: document.getElementById('date').value,
  });

  const recurrenceConfig = recurringCheckbox.checked
    ? {
      enabled: true,
      frequency: document.getElementById('recurrence-frequency').value,
      count: Number(document.getElementById('recurrence-count').value || 12),
    }
    : null;

  if (!saveTransactionWithValidation(baseTx, recurrenceConfig)) return;

  form.reset();
  recurrenceFields.classList.add('hidden');
  dateInput.value = new Date().toISOString().slice(0, 10);
  syncCategoryOptions();
  syncQuickEntryFromForm();
  resetQuickEntry();
  render();
});


quickEntryTypeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    quickEntryState.type = button.dataset.type || 'expense';
    renderQuickTypeButtons();
  });
});

if (quickAmountInput) {
  quickAmountInput.addEventListener('input', () => {
    quickEntryState.amount = quickAmountInput.value;
  });
}

if (quickDateInput) {
  quickDateInput.addEventListener('input', () => {
    quickEntryState.date = quickDateInput.value;
  });
}

if (quickSaveButton) {
  quickSaveButton.addEventListener('click', () => {
    const baseTx = buildBaseTransaction({
      type: quickEntryState.type,
      category: quickEntryState.category,
      subcategory: quickEntryState.subcategory,
      description: `Lançamento rápido • ${quickEntryState.subcategory || quickEntryState.category || 'Sem categoria'}`,
      amount: quickAmountInput?.value || quickEntryState.amount,
      date: quickDateInput?.value || quickEntryState.date,
    });

    addCategoryAndSubcategory(baseTx.category, baseTx.subcategory);

    if (!saveTransactionWithValidation(baseTx, null)) {
      window.alert('Preencha valor, data e selecione categoria/subcategoria para salvar rapidamente.');
      return;
    }

    syncCategoryOptions();
    resetQuickEntry();
    render();
  });
}

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
    const file = importDataInput?.files?.[0];
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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(console.error);
}

migrateLegacyData();
const txs = loadTransactions();
if (migrateRecurringSeriesData(txs)) {
  saveTransactions(txs);
}
syncQuickEntryFromForm();
syncCategoryOptions();
resetQuickEntry();
render();
