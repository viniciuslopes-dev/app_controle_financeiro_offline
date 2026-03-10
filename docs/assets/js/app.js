const STORAGE_KEY = 'finance_offline_transactions_v2';
const LEGACY_STORAGE_KEY = 'finance_offline_transactions_v1';
const CATEGORY_STORAGE_KEY = 'finance_offline_categories_v1';

const DEFAULT_CATEGORIES = {
  Moradia: ['Aluguel', 'Luz', 'Água', 'Internet'],
  Alimentação: ['Mercado', 'Restaurantes'],
  Transporte: ['Combustível', 'Transporte público'],
};

const form = document.getElementById('tx-form');
const categoryForm = document.getElementById('category-form');
const categoryListEl = document.getElementById('category-list');
const txList = document.getElementById('tx-list');
const summaryEl = document.getElementById('summary');
const categoryChartEl = document.getElementById('category-chart');
const subcategoryChartEl = document.getElementById('subcategory-chart');
const monthlyChartEl = document.getElementById('monthly-chart');
const dateInput = document.getElementById('date');
const monthFilterInput = document.getElementById('month-filter');
const categoryInput = document.getElementById('category');
const subcategoryInput = document.getElementById('subcategory');
const reportCategoryFilter = document.getElementById('report-category-filter');
const recurringCheckbox = document.getElementById('is-recurring');
const recurrenceFields = document.getElementById('recurrence-fields');
const refreshAppButton = document.getElementById('refresh-app');

dateInput.value = new Date().toISOString().slice(0, 10);
monthFilterInput.value = new Date().toISOString().slice(0, 7);

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

function renderCategoryList() {
  const categories = loadCategories();
  const rows = Object.entries(categories).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));

  categoryListEl.innerHTML = rows
    .map(
      ([category, subs]) => `<li><strong>${category}</strong>: ${subs.join(', ') || 'Sem subcategorias'}</li>`,
    )
    .join('');
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
          category: tx.category || 'Geral',
          subcategory: tx.subcategory || 'Outros',
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

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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

function renderSummary(items, month) {
  const monthItems = filterByMonth(items, month);
  const s = computeSummary(monthItems);

  summaryEl.innerHTML = [
    ['Receitas', s.income],
    ['Despesas', s.expense],
    ['Investimentos', s.investment],
    ['Metas', s.goal],
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

function renderBars(container, rows, emptyMessage = 'Sem dados para o período selecionado.') {
  if (!rows.length) {
    container.innerHTML = `<p class="empty">${emptyMessage}</p>`;
    return;
  }

  const maxValue = Math.max(...rows.map((r) => r.value), 1);
  container.innerHTML = rows
    .map((row) => {
      const width = Math.max((row.value / maxValue) * 100, 2);
      return `
        <div class="bar-row">
          <small>${row.label}</small>
          <div class="bar"><span style="width:${width}%"></span></div>
          <strong>${formatMoney(row.value)}</strong>
        </div>
      `;
    })
    .join('');
}

function renderCategoryChart(items, month) {
  const expenses = filterByMonth(items, month).filter((tx) => tx.type === 'expense');
  const byCategory = expenses.reduce((acc, tx) => {
    acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
    return acc;
  }, {});

  const rows = Object.entries(byCategory)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  renderBars(categoryChartEl, rows);
}

function renderSubcategoryChart(items, month) {
  const selectedCategory = reportCategoryFilter.value;
  const expenses = filterByMonth(items, month).filter((tx) => tx.type === 'expense');
  const filtered = selectedCategory ? expenses.filter((tx) => tx.category === selectedCategory) : expenses;

  const bySubcategory = filtered.reduce((acc, tx) => {
    const label = `${tx.category} › ${tx.subcategory || 'Outros'}`;
    acc[label] = (acc[label] || 0) + tx.amount;
    return acc;
  }, {});

  const rows = Object.entries(bySubcategory)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  renderBars(subcategoryChartEl, rows, 'Sem despesas em subcategorias para este filtro.');
}

function renderMonthlyChart(items) {
  const monthly = items
    .filter((tx) => tx.type === 'expense')
    .reduce((acc, tx) => {
      const month = tx.date.slice(0, 7);
      acc[month] = (acc[month] || 0) + tx.amount;
      return acc;
    }, {});

  const rows = Object.entries(monthly)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => (a.label > b.label ? 1 : -1))
    .slice(-12);

  renderBars(monthlyChartEl, rows);
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
          <div class="tx-meta">${tx.type} • ${tx.category} › ${tx.subcategory || 'Outros'} • ${tx.date} • ${formatMoney(tx.amount)}</div>
        </div>
        <button class="delete-btn" data-id="${tx.id}">Excluir</button>
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
}

function createRecurringTransactions(baseTx, frequency, count) {
  const txs = [];
  for (let index = 0; index < count; index += 1) {
    const date =
      frequency === 'yearly' ? addYears(baseTx.date, index) : addMonths(baseTx.date, index);

    txs.push({
      ...baseTx,
      id: crypto.randomUUID(),
      date,
      recurrence: {
        frequency,
        sequence: index + 1,
        total: count,
      },
    });
  }
  return txs;
}

function render() {
  const txs = loadTransactions();
  const selectedMonth = getCurrentMonthFilter();
  renderSummary(txs, selectedMonth);
  renderCategoryChart(txs, selectedMonth);
  renderSubcategoryChart(txs, selectedMonth);
  renderMonthlyChart(txs);
  renderList(txs, selectedMonth);
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

recurringCheckbox.addEventListener('change', () => {
  recurrenceFields.classList.toggle('hidden', !recurringCheckbox.checked);
});

monthFilterInput.addEventListener('change', render);

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const baseTx = {
    type: document.getElementById('type').value,
    category: normalizeText(categoryInput.value),
    subcategory: normalizeText(subcategoryInput.value),
    description: normalizeText(document.getElementById('description').value),
    amount: Number(document.getElementById('amount').value),
    date: document.getElementById('date').value,
    recurrence: null,
  };

  if (!baseTx.description || !baseTx.amount || !baseTx.date || !baseTx.category || !baseTx.subcategory) return;

  const all = loadTransactions();
  if (recurringCheckbox.checked) {
    const frequency = document.getElementById('recurrence-frequency').value;
    const count = Number(document.getElementById('recurrence-count').value || 12);
    const recurringTxs = createRecurringTransactions(baseTx, frequency, count);
    all.push(...recurringTxs);
  } else {
    all.push({ ...baseTx, id: crypto.randomUUID() });
  }

  saveTransactions(all);

  form.reset();
  recurrenceFields.classList.add('hidden');
  dateInput.value = new Date().toISOString().slice(0, 10);
  syncCategoryOptions();
  render();
});

if (refreshAppButton) {
  refreshAppButton.addEventListener('click', () => {
    refreshAppWithoutLosingData().catch(console.error);
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(console.error);
}

migrateLegacyData();
syncCategoryOptions();
render();
