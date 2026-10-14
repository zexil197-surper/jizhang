'use strict';

/* =========================================================
   记账本 — 主程序
   数据保存在浏览器的 localStorage 里。
   金额一律用「分」（整数）保存，避免小数计算误差。
   ========================================================= */

const STORAGE_KEY = 'jizhang-data-v1';

function createDefaultData() {
  return {
    version: 1,
    accounts: [
      { id: 'acc-cash', name: '现金', icon: '💵', initialBalance: 0 },
      { id: 'acc-bank', name: '银行卡', icon: '🏦', initialBalance: 0 },
      { id: 'acc-credit', name: '信用卡', icon: '💳', initialBalance: 0 },
    ],
    categories: [
      { id: 'cat-food', name: '餐饮', icon: '🍜', type: 'expense' },
      { id: 'cat-transport', name: '交通', icon: '🚌', type: 'expense' },
      { id: 'cat-shopping', name: '购物', icon: '🛍️', type: 'expense' },
      { id: 'cat-housing', name: '住房', icon: '🏠', type: 'expense' },
      { id: 'cat-fun', name: '娱乐', icon: '🎮', type: 'expense' },
      { id: 'cat-medical', name: '医疗', icon: '💊', type: 'expense' },
      { id: 'cat-other-exp', name: '其他', icon: '📦', type: 'expense' },
      { id: 'cat-salary', name: '工资', icon: '💼', type: 'income' },
      { id: 'cat-bonus', name: '奖金', icon: '🎁', type: 'income' },
      { id: 'cat-other-inc', name: '其他', icon: '💰', type: 'income' },
    ],
    // type: 'expense' 支出 | 'income' 收入 | 'transfer' 转账（accountId 转出 → toAccountId 转入）
    transactions: [],
  };
}

// 账户和分类可选的图标
const ICON_CHOICES = [
  '🍜', '🍔', '☕', '🍺', '🛒', '🛍️', '👕', '💄', '🚌', '🚗', '⛽', '🚕',
  '✈️', '🏠', '💡', '📱', '💻', '🎮', '🎬', '🎵', '📚', '🎓', '💊', '🏥',
  '🐶', '👶', '🎁', '💇', '🏋️', '🧾', '📦', '💼', '💰', '📈', '🧧', '↩️',
  '💵', '🏦', '💳', '🪙', '👛', '🐷',
];

/* ---------- 读取 / 保存 ---------- */

let storageOk = true;

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultData();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.transactions)) return createDefaultData();
    return parsed;
  } catch (e) {
    storageOk = false;
    return createDefaultData();
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    showToast('⚠️ 保存失败：浏览器不允许存储数据');
    return false;
  }
}

/* ---------- 小工具 ---------- */

const moneyFormatter = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

/** 把「分」显示成 $1,234.56 */
function formatMoney(cents) {
  return moneyFormatter.format(cents / 100);
}

/** 把用户输入的金额文字变成「分」；不合法返回 null。allowNegative 时允许负数和 0 */
function parseAmount(text, allowNegative = false) {
  let cleaned = String(text).replace(/[,\s$]/g, '');
  let sign = 1;
  if (allowNegative && cleaned.startsWith('-')) {
    sign = -1;
    cleaned = cleaned.slice(1);
  }
  if (allowNegative && cleaned === '') return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100) * sign;
  if (allowNegative) return cents;
  return cents > 0 ? cents : null;
}

/** 今天的本地日期 YYYY-MM-DD（不用 toISOString，避免时区差一天） */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function currentMonthStr() {
  return todayStr().slice(0, 7);
}

function shiftMonth(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function formatDayHead(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  let label = `${m}月${d}日 ${WEEKDAYS[date.getDay()]}`;
  if (dateStr === todayStr()) label += ' · 今天';
  return label;
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function findCategory(id) {
  return data.categories.find((c) => c.id === id);
}

function findAccount(id) {
  return data.accounts.find((a) => a.id === id);
}

/** 计算每个账户当前余额（分） */
function accountBalances() {
  const balances = new Map(data.accounts.map((a) => [a.id, a.initialBalance || 0]));
  const add = (id, cents) => { if (balances.has(id)) balances.set(id, balances.get(id) + cents); };
  for (const t of data.transactions) {
    if (t.type === 'income') add(t.accountId, t.amount);
    else if (t.type === 'expense') add(t.accountId, -t.amount);
    else if (t.type === 'transfer') {
      add(t.accountId, -t.amount);
      add(t.toAccountId, t.amount);
    }
  }
  return balances;
}

const $ = (id) => document.getElementById(id);

let toastTimer = null;
function showToast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function openModal(id) {
  $(id).hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  $(id).hidden = true;
  document.body.style.overflow = '';
}

/* ---------- 程序状态 ---------- */

let data = loadData();
let viewMonth = currentMonthStr();
let currentPage = 'records';

const PAGE_TITLES = { records: '记账本', accounts: '我的账户', settings: '设置' };

// 正在填写的记账表单
const form = {
  editingId: null,
  type: 'expense',
  categoryId: null,
  accountId: null,
  toAccountId: null,
};

/* ---------- 页面切换 ---------- */

function showPage(page) {
  currentPage = page;
  for (const p of Object.keys(PAGE_TITLES)) $(`page-${p}`).hidden = p !== page;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.page === page));
  $('page-title').textContent = PAGE_TITLES[page];
  $('add-btn').hidden = page === 'settings';
  window.scrollTo(0, 0);
  renderCurrentPage();
}

function renderCurrentPage() {
  if (currentPage === 'records') renderRecords();
  else if (currentPage === 'accounts') renderAccounts();
  else if (currentPage === 'settings') renderSettings();
}

/* ---------- 明细页 ---------- */

function renderRecords() {
  const [y, m] = viewMonth.split('-').map(Number);
  $('month-label').textContent = `${y}年${m}月`;

  const monthTx = data.transactions
    .filter((t) => t.date.startsWith(viewMonth))
    .sort((a, b) => (b.date.localeCompare(a.date)) || (b.createdAt - a.createdAt));

  let income = 0;
  let expense = 0;
  for (const t of monthTx) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  $('sum-income').textContent = formatMoney(income);
  $('sum-expense').textContent = formatMoney(expense);
  const balanceEl = $('sum-balance');
  balanceEl.textContent = formatMoney(income - expense);
  balanceEl.className = 'summary-value ' + (income - expense < 0 ? 'expense' : '');

  const list = $('record-list');
  if (monthTx.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <div class="empty-icon">📝</div>
        <p>这个月还没有记录<br>点右下角「记一笔」开始吧</p>
      </div>`;
    return;
  }

  // 按日期分组
  const groups = new Map();
  for (const t of monthTx) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }

  let html = '';
  for (const [date, items] of groups) {
    let dayExpense = 0;
    let dayIncome = 0;
    for (const t of items) {
      if (t.type === 'income') dayIncome += t.amount;
      else if (t.type === 'expense') dayExpense += t.amount;
    }
    const dayParts = [];
    if (dayExpense) dayParts.push(`支出 ${formatMoney(dayExpense)}`);
    if (dayIncome) dayParts.push(`收入 ${formatMoney(dayIncome)}`);

    html += `<div class="day-group">
      <div class="day-head"><span>${formatDayHead(date)}</span><span>${dayParts.join('  ')}</span></div>
      <div class="day-items">`;
    for (const t of items) html += recordRowHtml(t);
    html += '</div></div>';
  }
  list.innerHTML = html;
}

function recordRowHtml(t) {
  let icon, title, sub, amountHtml;
  if (t.type === 'transfer') {
    const from = findAccount(t.accountId);
    const to = findAccount(t.toAccountId);
    icon = '🔁';
    title = '转账';
    sub = `${from ? from.name : '?'} → ${to ? to.name : '?'}`;
    amountHtml = `<span class="record-amount">${formatMoney(t.amount)}</span>`;
  } else {
    const cat = findCategory(t.categoryId) || { name: '未分类', icon: '❓' };
    const acc = findAccount(t.accountId);
    icon = cat.icon;
    title = cat.name;
    sub = acc ? acc.name : '';
    const sign = t.type === 'income' ? '+' : '-';
    amountHtml = `<span class="record-amount ${t.type}">${sign}${formatMoney(t.amount)}</span>`;
  }
  if (t.note) sub = sub ? `${sub} · ${t.note}` : t.note;
  return `<button class="record" data-id="${t.id}">
      <span class="record-icon">${icon}</span>
      <span class="record-main">
        <div class="record-cat">${escapeHtml(title)}</div>
        <div class="record-sub">${escapeHtml(sub)}</div>
      </span>
      ${amountHtml}
    </button>`;
}

/* ---------- 记一笔 / 编辑 弹窗 ---------- */

function openRecordForm(tx, presetType) {
  const firstAcc = data.accounts[0]?.id || null;
  const lastAcc = findAccount(data.lastAccountId) ? data.lastAccountId : firstAcc;
  form.editingId = tx ? tx.id : null;
  form.type = tx ? tx.type : (presetType || 'expense');
  form.categoryId = tx ? tx.categoryId : null;
  form.accountId = tx ? tx.accountId : lastAcc;
  form.toAccountId = tx ? tx.toAccountId || null : null;

  $('form-title').textContent = tx ? '修改记录' : (form.type === 'transfer' ? '转账' : '记一笔');
  $('f-amount').value = tx ? (tx.amount / 100).toFixed(2) : '';
  $('f-date').value = tx ? tx.date : defaultDateForForm();
  $('f-note').value = tx ? tx.note || '' : '';
  $('delete-btn').hidden = !tx;
  $('form-error').textContent = '';

  renderFormChoices();
  openModal('record-modal');
  // 新记录时自动聚焦金额（手机上会弹出数字键盘）
  if (!tx) setTimeout(() => $('f-amount').focus(), 50);
}

/** 如果正在看别的月份，新记录默认日期放在那个月；否则用今天 */
function defaultDateForForm() {
  if (currentPage !== 'records' || viewMonth === currentMonthStr()) return todayStr();
  return `${viewMonth}-01`;
}

function renderFormChoices() {
  const isTransfer = form.type === 'transfer';
  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === form.type);
  });

  $('cat-field').hidden = isTransfer;
  $('to-field').hidden = !isTransfer;
  $('acc-label').textContent = isTransfer ? '从哪个账户转出' : '账户';

  if (!isTransfer) {
    const cats = data.categories.filter((c) => c.type === form.type);
    $('f-categories').innerHTML = cats.map((c) => `
      <button type="button" class="chip ${c.id === form.categoryId ? 'active' : ''}" data-cat="${c.id}">
        <span class="chip-icon">${c.icon}</span><span>${escapeHtml(c.name)}</span>
      </button>`).join('');
  }

  const accountChips = (selectedId, attr) => data.accounts.map((a) => `
    <button type="button" class="chip ${a.id === selectedId ? 'active' : ''}" ${attr}="${a.id}">
      <span>${a.icon}</span><span>${escapeHtml(a.name)}</span>
    </button>`).join('');
  $('f-accounts').innerHTML = accountChips(form.accountId, 'data-acc');
  if (isTransfer) $('f-to-accounts').innerHTML = accountChips(form.toAccountId, 'data-to-acc');
}

function submitRecordForm(event) {
  event.preventDefault();
  const amount = parseAmount($('f-amount').value);
  const date = $('f-date').value;
  const note = $('f-note').value.trim();
  const isTransfer = form.type === 'transfer';

  let error = '';
  if (amount === null) error = '请输入正确的金额，比如 12.50';
  else if (!isTransfer && !form.categoryId) error = '请选择一个分类';
  else if (!form.accountId) error = isTransfer ? '请选择从哪个账户转出' : '请选择一个账户';
  else if (isTransfer && !form.toAccountId) error = '请选择转入哪个账户';
  else if (isTransfer && form.toAccountId === form.accountId) error = '转出和转入不能是同一个账户';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) error = '请选择日期';
  if (error) {
    $('form-error').textContent = error;
    return;
  }

  const fields = {
    type: form.type,
    amount,
    categoryId: isTransfer ? null : form.categoryId,
    accountId: form.accountId,
    toAccountId: isTransfer ? form.toAccountId : null,
    date,
    note,
  };
  if (form.editingId) {
    const tx = data.transactions.find((t) => t.id === form.editingId);
    Object.assign(tx, fields);
  } else {
    data.transactions.push({ id: newId('tx'), ...fields, createdAt: Date.now() });
  }
  if (!isTransfer) data.lastAccountId = form.accountId;

  if (saveData()) showToast(form.editingId ? '已修改 ✓' : (isTransfer ? '已转账 ✓' : '已记一笔 ✓'));
  if (currentPage === 'records') viewMonth = date.slice(0, 7); // 跳到这条记录所在的月份
  closeModal('record-modal');
  renderCurrentPage();
}

function deleteCurrentRecord() {
  if (!form.editingId) return;
  if (!confirm('确定删除这条记录吗？删除后无法恢复。')) return;
  data.transactions = data.transactions.filter((t) => t.id !== form.editingId);
  if (saveData()) showToast('已删除');
  closeModal('record-modal');
  renderCurrentPage();
}

/* ---------- 账户页 ---------- */

function renderAccounts() {
  const balances = accountBalances();
  let assets = 0;
  let debts = 0;
  for (const b of balances.values()) {
    if (b >= 0) assets += b;
    else debts += -b;
  }
  const net = assets - debts;
  $('net-worth').textContent = formatMoney(net);
  $('net-worth').classList.toggle('expense', net < 0);
  $('total-assets').textContent = formatMoney(assets);
  $('total-debts').textContent = formatMoney(debts);

  $('account-list').innerHTML = data.accounts.map((a) => {
    const b = balances.get(a.id);
    return `<button class="record" data-account="${a.id}">
        <span class="record-icon">${a.icon}</span>
        <span class="record-main"><div class="record-cat">${escapeHtml(a.name)}</div></span>
        <span class="record-amount balance-amount ${b < 0 ? 'negative' : ''}">${formatMoney(b)}</span>
        <span class="chevron">›</span>
      </button>`;
  }).join('');
}

/* ---------- 设置页（分类管理） ---------- */

function renderSettings() {
  const usage = new Map();
  for (const t of data.transactions) {
    if (t.categoryId) usage.set(t.categoryId, (usage.get(t.categoryId) || 0) + 1);
  }
  for (const type of ['expense', 'income']) {
    $(`cat-list-${type}`).innerHTML = data.categories
      .filter((c) => c.type === type)
      .map((c) => `<button class="record" data-category="${c.id}">
          <span class="record-icon">${c.icon}</span>
          <span class="record-main">
            <div class="record-cat">${escapeHtml(c.name)}</div>
            <div class="record-sub">${usage.get(c.id) || 0} 条记录</div>
          </span>
          <span class="chevron">›</span>
        </button>`).join('');
  }
}

/* ---------- 通用编辑弹窗（账户、分类共用） ---------- */

let editor = null; // { onSave, onDelete, icon }

/**
 * 打开编辑弹窗。
 * fields: name（名称）、icon（图标）、可选 extraHtml（额外输入框）
 * onSave(values) 返回错误文字表示失败，返回空表示成功
 */
function openEditor({ title, name, icon, extraHtml = '', onSave, onDelete }) {
  editor = { onSave, onDelete, icon };
  $('edit-title').textContent = title;
  $('edit-body').innerHTML = `
    <label class="field">
      <span class="field-label">名称</span>
      <input id="e-name" type="text" class="input" maxlength="12" value="${escapeHtml(name)}" placeholder="比如：外卖" autocomplete="off">
    </label>
    <div class="field">
      <span class="field-label">图标</span>
      <div class="icon-grid">${ICON_CHOICES.map((ic) =>
        `<button type="button" class="icon-choice ${ic === icon ? 'active' : ''}" data-icon="${ic}">${ic}</button>`).join('')}
      </div>
    </div>
    ${extraHtml}`;
  $('edit-error').textContent = '';
  $('edit-delete').hidden = !onDelete;
  openModal('edit-modal');
  if (!name) setTimeout(() => $('e-name').focus(), 50);
}

function submitEditor(event) {
  event.preventDefault();
  const name = $('e-name').value.trim();
  if (!name) {
    $('edit-error').textContent = '请填写名称';
    return;
  }
  const error = editor.onSave({ name, icon: editor.icon });
  if (error) {
    $('edit-error').textContent = error;
    return;
  }
  saveData();
  closeModal('edit-modal');
  renderCurrentPage();
}

function deleteInEditor() {
  if (!editor.onDelete) return;
  const error = editor.onDelete();
  if (error === false) return; // 用户取消
  if (error) {
    $('edit-error').textContent = error;
    return;
  }
  saveData();
  closeModal('edit-modal');
  renderCurrentPage();
}

function editAccount(account) {
  const balanceText = account ? (account.initialBalance / 100).toFixed(2) : '';
  openEditor({
    title: account ? '修改账户' : '添加账户',
    name: account ? account.name : '',
    icon: account ? account.icon : '👛',
    extraHtml: `
      <label class="field">
        <span class="field-label">初始余额</span>
        <input id="e-balance" type="text" inputmode="decimal" class="input" value="${balanceText}" placeholder="0.00" autocomplete="off">
        <p class="field-hint">开始用记账本时，这个账户里原本有多少钱。<br>信用卡如果有欠款，填负数，比如 -500</p>
      </label>`,
    onSave({ name, icon }) {
      const initialBalance = parseAmount($('e-balance').value, true);
      if (initialBalance === null) return '初始余额格式不对，比如 1000 或 -500';
      if (data.accounts.some((a) => a.name === name && a !== account)) return '已经有同名的账户了';
      if (account) {
        Object.assign(account, { name, icon, initialBalance });
        showToast('账户已修改 ✓');
      } else {
        data.accounts.push({ id: newId('acc'), name, icon, initialBalance });
        showToast('账户已添加 ✓');
      }
      return '';
    },
    onDelete: account ? () => {
      const used = data.transactions.filter((t) => t.accountId === account.id || t.toAccountId === account.id).length;
      if (used > 0) return `这个账户有 ${used} 条记录，不能删除。可以先把这些记录删掉或改到别的账户。`;
      if (data.accounts.length <= 1) return '至少要保留一个账户';
      if (!confirm(`确定删除账户「${account.name}」吗？`)) return false;
      data.accounts = data.accounts.filter((a) => a !== account);
      showToast('账户已删除');
      return '';
    } : null,
  });
}

function editCategory(category, type) {
  const catType = category ? category.type : type;
  openEditor({
    title: category ? '修改分类' : (catType === 'income' ? '添加收入分类' : '添加支出分类'),
    name: category ? category.name : '',
    icon: category ? category.icon : (catType === 'income' ? '💰' : '📦'),
    onSave({ name, icon }) {
      if (data.categories.some((c) => c.type === catType && c.name === name && c !== category)) {
        return '已经有同名的分类了';
      }
      if (category) {
        Object.assign(category, { name, icon });
        showToast('分类已修改 ✓');
      } else {
        data.categories.push({ id: newId('cat'), name, icon, type: catType });
        showToast('分类已添加 ✓');
      }
      return '';
    },
    onDelete: category ? () => {
      const used = data.transactions.filter((t) => t.categoryId === category.id).length;
      if (used > 0) return `这个分类有 ${used} 条记录，不能删除。可以改个名字继续用。`;
      if (data.categories.filter((c) => c.type === catType).length <= 1) return '每种类型至少要保留一个分类';
      if (!confirm(`确定删除分类「${category.name}」吗？`)) return false;
      data.categories = data.categories.filter((c) => c !== category);
      showToast('分类已删除');
      return '';
    } : null,
  });
}

/* ---------- 绑定按钮 ---------- */

function bindEvents() {
  // 页面切换
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => showPage(tab.dataset.page));
  });
  $('settings-btn').addEventListener('click', () => showPage('settings'));

  // 明细页
  $('prev-month').addEventListener('click', () => { viewMonth = shiftMonth(viewMonth, -1); renderRecords(); });
  $('next-month').addEventListener('click', () => { viewMonth = shiftMonth(viewMonth, 1); renderRecords(); });
  $('month-label').addEventListener('click', () => { viewMonth = currentMonthStr(); renderRecords(); });

  $('add-btn').addEventListener('click', () => openRecordForm(null));

  $('record-list').addEventListener('click', (e) => {
    const row = e.target.closest('.record');
    if (!row) return;
    const tx = data.transactions.find((t) => t.id === row.dataset.id);
    if (tx) openRecordForm(tx);
  });

  // 账户页
  $('transfer-btn').addEventListener('click', () => openRecordForm(null, 'transfer'));
  $('add-account-btn').addEventListener('click', () => editAccount(null));
  $('account-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-account]');
    if (row) editAccount(findAccount(row.dataset.account));
  });

  // 设置页
  document.querySelectorAll('.add-cat-btn').forEach((btn) => {
    btn.addEventListener('click', () => editCategory(null, btn.dataset.type));
  });
  for (const type of ['expense', 'income']) {
    $(`cat-list-${type}`).addEventListener('click', (e) => {
      const row = e.target.closest('[data-category]');
      if (row) editCategory(findCategory(row.dataset.category));
    });
  }

  // 记账弹窗
  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (form.type === btn.dataset.type) return;
      form.type = btn.dataset.type;
      form.categoryId = null; // 收入和支出的分类不一样，切换后要重新选
      $('form-error').textContent = '';
      renderFormChoices();
    });
  });

  $('f-categories').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    form.categoryId = chip.dataset.cat;
    $('form-error').textContent = '';
    renderFormChoices();
  });

  $('f-accounts').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-acc]');
    if (!chip) return;
    form.accountId = chip.dataset.acc;
    renderFormChoices();
  });

  $('f-to-accounts').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-to-acc]');
    if (!chip) return;
    form.toAccountId = chip.dataset.toAcc;
    renderFormChoices();
  });

  $('record-form').addEventListener('submit', submitRecordForm);
  $('delete-btn').addEventListener('click', deleteCurrentRecord);
  $('close-modal').addEventListener('click', () => closeModal('record-modal'));

  // 通用编辑弹窗
  $('edit-form').addEventListener('submit', submitEditor);
  $('edit-delete').addEventListener('click', deleteInEditor);
  $('edit-close').addEventListener('click', () => closeModal('edit-modal'));
  $('edit-body').addEventListener('click', (e) => {
    const choice = e.target.closest('[data-icon]');
    if (!choice) return;
    editor.icon = choice.dataset.icon;
    $('edit-body').querySelectorAll('.icon-choice').forEach((b) => b.classList.toggle('active', b === choice));
  });

  // 点弹窗外面的灰色区域、或按 Esc 键关闭弹窗
  for (const id of ['record-modal', 'edit-modal']) {
    $(id).addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(id); });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const id of ['record-modal', 'edit-modal']) if (!$(id).hidden) closeModal(id);
  });
}

/* ---------- 启动 ---------- */

bindEvents();
showPage('records');
if (!storageOk) showToast('⚠️ 浏览器禁止了本地存储，记录可能无法保存');
