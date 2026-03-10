const STORAGE_KEY = 'finance_offline_transactions_v1';

const form = document.getElementById('tx-form');
const txList = document.getElementById('tx-list');
const summaryEl = document.getElementById('summary');
const dateInput = document.getElementById('date');
const refreshAppButton = document.getElementById('refresh-app');

dateInput.value = new Date().toISOString().slice(0, 10);

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

function renderSummary(items) {
  const s = computeSummary(items);
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

function renderList(items) {
  const sorted = [...items].sort((a, b) => (a.date < b.date ? 1 : -1));
  txList.innerHTML = sorted
    .map(
      (tx) => `
      <li class="tx-item">
        <div>
          <strong>${tx.description}</strong>
          <div class="tx-meta">${tx.type} • ${tx.date} • ${formatMoney(tx.amount)}</div>
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

function render() {
  const txs = loadTransactions();
  renderSummary(txs);
  renderList(txs);
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

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const tx = {
    id: crypto.randomUUID(),
    type: document.getElementById('type').value,
    description: document.getElementById('description').value.trim(),
    amount: Number(document.getElementById('amount').value),
    date: document.getElementById('date').value,
  };

  if (!tx.description || !tx.amount || !tx.date) return;

  const all = loadTransactions();
  all.push(tx);
  saveTransactions(all);

  form.reset();
  dateInput.value = new Date().toISOString().slice(0, 10);
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

render();
