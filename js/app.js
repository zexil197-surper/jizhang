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
    // 每月预算：{ 分类id: 金额（分） }，每个月都一样
    budgets: {},
    // 存钱目标：{ id, name, icon, target, deadline, deposits: [{ id, amount（正数存入/负数取出）, date, note }] }
    goals: [],
  };
}

// 账户和分类可选的图标
const ICON_CHOICES = [
  '🍜', '🍔', '☕', '🍺', '🛒', '🛍️', '👕', '💄', '🚌', '🚗', '⛽', '🚕',
  '✈️', '🏠', '💡', '📱', '💻', '🎮', '🎬', '🎵', '📚', '🎓', '💊', '🏥',
  '🐶', '👶', '🎁', '💇', '🏋️', '🧾', '📦', '💼', '💰', '📈', '🧧', '↩️',
  '💵', '🏦', '💳', '🪙', '👛', '🐷', '🎯', '🏖️', '💍', '🚀',
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
/**
 * 底部小提示。level 为 'warn'（黄）或 'over'（红）时更醒目、显示更久。
 * action = { label, onClick } 时显示一个按钮（比如「撤销」）
 */
function showToast(message, level = '', action = null) {
  const el = $('toast');
  el.textContent = message;
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      el.classList.remove('show');
      action.onClick();
    });
    el.appendChild(btn);
  }
  el.className = `toast show ${level} ${action ? 'has-action' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 6000 : level ? 4500 : 2200);
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

const PAGE_TITLES = {
  records: '记账本', budget: '每月预算', charts: '图表统计', goals: '存钱目标', accounts: '我的账户', settings: '设置',
};

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
  else if (currentPage === 'budget') renderBudget();
  else if (currentPage === 'charts') renderCharts();
  else if (currentPage === 'goals') renderGoals();
  else if (currentPage === 'accounts') renderAccounts();
  else if (currentPage === 'settings') renderSettings();
  renderBudgetDot();
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
  renderBackupReminder();
  renderBudgetAlert();
  renderDailyTip();
  renderQuickChips();

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
  form.saveQuick = false;

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
  const quickBtn = $('f-save-quick');
  quickBtn.hidden = isTransfer || !!form.editingId;
  quickBtn.classList.toggle('active', form.saveQuick);
  quickBtn.setAttribute('aria-pressed', String(form.saveQuick));
  quickBtn.textContent = form.saveQuick ? '⚡ ✓ 会同时存为快捷按钮' : '⚡ 同时存为快捷按钮，以后点一下就记好';
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
  const month = date.slice(0, 7);
  const levelBefore = isTransfer ? null : budgetInfo(form.categoryId, month);
  if (form.editingId) {
    const tx = data.transactions.find((t) => t.id === form.editingId);
    Object.assign(tx, fields);
  } else {
    data.transactions.push({ id: newId('tx'), ...fields, createdAt: Date.now() });
    if (form.saveQuick && !isTransfer) addQuickItem(fields);
  }
  if (!isTransfer) data.lastAccountId = form.accountId;

  if (saveData()) {
    showToast(form.editingId ? '已修改 ✓' : (isTransfer ? '已转账 ✓' : '已记一笔 ✓'));
    if (form.type === 'expense') warnIfBudgetCrossed(form.categoryId, month, levelBefore);
  }
  if (currentPage === 'records') viewMonth = month; // 跳到这条记录所在的月份
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

/* ---------- 快捷记账 ---------- */

function quickLabel(q) {
  const cat = findCategory(q.categoryId);
  return `${cat ? cat.icon : '❓'} ${q.note || (cat ? cat.name : '未分类')} ${formatMoney(q.amount)}`;
}

function addQuickItem(fields) {
  data.quickItems = data.quickItems || [];
  const same = data.quickItems.some((q) => q.type === fields.type && q.amount === fields.amount
    && q.categoryId === fields.categoryId && q.accountId === fields.accountId && q.note === fields.note);
  if (!same) {
    data.quickItems.push({
      id: newId('quick'),
      type: fields.type,
      amount: fields.amount,
      categoryId: fields.categoryId,
      accountId: fields.accountId,
      note: fields.note,
    });
  }
}

function renderQuickChips() {
  const items = data.quickItems || [];
  $('quick-chips').innerHTML = items.length
    ? items.map((q) => `<button class="quick-chip q-${q.type}" data-quick="${q.id}">${escapeHtml(quickLabel(q))}</button>`).join('')
      + '<button class="quick-chip manage" id="quick-manage">✏️ 管理</button>'
    : '<p class="quick-empty">记一笔时点「⚡ 同时存为快捷按钮」，常记的账以后点一下就记好。</p>';
}

/** 点快捷按钮：用今天的日期马上记一笔，可以撤销 */
function quickAdd(q) {
  if (!findCategory(q.categoryId) || !findAccount(q.accountId)) {
    alert('这个快捷按钮用到的分类或账户已经被删除了，请在「管理」里删掉它，重新添加。');
    return;
  }
  const date = todayStr();
  const month = date.slice(0, 7);
  const before = q.type === 'expense' ? budgetInfo(q.categoryId, month) : null;
  const tx = {
    id: newId('tx'),
    type: q.type,
    amount: q.amount,
    categoryId: q.categoryId,
    accountId: q.accountId,
    toAccountId: null,
    date,
    note: q.note,
    createdAt: Date.now(),
  };
  data.transactions.push(tx);
  if (!saveData()) return;
  viewMonth = month;
  renderCurrentPage();

  const crossing = q.type === 'expense' ? budgetCrossing(q.categoryId, month, before) : null;
  const message = `已记：${quickLabel(q)}${crossing ? `\n${crossing.text}` : ''}`;
  showToast(message, crossing ? crossing.level : '', {
    label: '撤销',
    onClick() {
      data.transactions = data.transactions.filter((t) => t.id !== tx.id);
      saveData();
      renderCurrentPage();
      showToast('已撤销');
    },
  });
}

function openQuickManage() {
  const renderList = () => {
    const items = data.quickItems || [];
    $('qm-list').innerHTML = items.length ? items.map((q) => `
      <div class="history-row">
        <span class="h-main">${escapeHtml(quickLabel(q))}<div class="h-date">${q.type === 'income' ? '收入' : '支出'} · ${escapeHtml(findAccount(q.accountId)?.name || '账户已删除')}</div></span>
        <button type="button" class="h-del" data-quick-del="${q.id}" aria-label="删除这个快捷按钮" title="删除">✕</button>
      </div>`).join('') : '<p class="chart-empty">没有快捷按钮了</p>';
  };
  openEditor({
    title: '⚡ 管理快捷按钮',
    withNameIcon: false,
    submitLabel: '完成',
    extraHtml: `<div id="qm-list"></div>
      <p class="field-hint">想添加新的：点「记一笔」，填好后点「⚡ 同时存为快捷按钮」再保存。</p>`,
    onSave() { return ''; },
  });
  renderList();
  $('qm-list').addEventListener('click', (e) => {
    const del = e.target.closest('[data-quick-del]');
    if (!del) return;
    data.quickItems = data.quickItems.filter((q) => q.id !== del.dataset.quickDel);
    saveData();
    renderList();
    renderQuickChips();
  });
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
  renderBackupStatus();
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

/* ---------- 备份：导出 / 导入 ---------- */

const BACKUP_REMIND_DAYS = 14;

/** 距离上次备份过了几天；从没备份过返回 null */
function daysSinceBackup() {
  if (!data.lastBackupAt) return null;
  return Math.floor((Date.now() - data.lastBackupAt) / 86400000);
}

function renderBackupStatus() {
  const days = daysSinceBackup();
  const el = $('backup-status');
  if (days === null) {
    el.textContent = '⚠️ 还从来没有备份过';
  } else {
    const d = new Date(data.lastBackupAt);
    const when = days === 0 ? '今天' : `${days} 天前`;
    el.textContent = `上次备份：${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${when}）`;
  }
  el.classList.toggle('overdue', days === null || days >= BACKUP_REMIND_DAYS);
}

/** 明细页顶部的备份提醒：有记录、并且很久没备份时显示 */
function renderBackupReminder() {
  const days = daysSinceBackup();
  const show = data.transactions.length > 0 && (days === null || days >= BACKUP_REMIND_DAYS);
  const el = $('backup-reminder');
  el.hidden = !show;
  if (show) {
    el.textContent = days === null
      ? '💾 你还没有备份过数据，点这里去备份 ›'
      : `💾 已经 ${days} 天没备份了，点这里去备份 ›`;
  }
}

function markBackedUp() {
  data.lastBackupAt = Date.now();
  saveData();
  renderBackupStatus();
  renderBackupReminder();
}

function exportBackup() {
  const filename = `记账本备份-${todayStr()}.json`;
  const backup = {
    app: '记账本',
    exportedAt: new Date().toISOString(),
    data: { ...data, lastBackupAt: Date.now() },
  };
  const json = JSON.stringify(backup, null, 2);

  // 手机上：打开系统的「分享」菜单，可以选「存储到文件」或隔空投送
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const file = typeof File === 'function' ? new File([json], filename, { type: 'application/json' }) : null;
  if (isTouch && file && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: filename })
      .then(() => {
        markBackedUp();
        showToast('备份完成 ✓');
      })
      .catch((e) => {
        if (e && e.name === 'AbortError') showToast('已取消，没有备份');
        else downloadBackup(json, filename);
      });
    return;
  }
  downloadBackup(json, filename);
}

/** 电脑上：直接下载备份文件 */
function downloadBackup(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  markBackedUp();
  showToast('备份文件已下载 ✓ 在「下载」文件夹里');
}

/** 检查备份文件内容是否正确；正确返回数据，不正确抛出带说明的错误 */
function validateBackup(obj) {
  const d = obj && obj.data ? obj.data : obj;
  const bad = (msg) => { throw new Error(msg); };
  if (!d || typeof d !== 'object') bad('文件内容不对');
  if (!Array.isArray(d.accounts) || !Array.isArray(d.categories) || !Array.isArray(d.transactions)) {
    bad('这不是记账本的备份文件');
  }
  if (d.accounts.length === 0) bad('备份里没有账户');
  for (const a of d.accounts) {
    if (!a || typeof a.id !== 'string' || typeof a.name !== 'string' || !Number.isInteger(a.initialBalance)) {
      bad('备份里的账户数据有问题');
    }
  }
  for (const c of d.categories) {
    if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || !['expense', 'income'].includes(c.type)) {
      bad('备份里的分类数据有问题');
    }
  }
  for (const t of d.transactions) {
    if (!t || typeof t.id !== 'string'
      || !['expense', 'income', 'transfer'].includes(t.type)
      || !Number.isInteger(t.amount) || t.amount <= 0
      || typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
      bad('备份里的记录数据有问题');
    }
  }
  if (d.budgets !== undefined) {
    if (!d.budgets || typeof d.budgets !== 'object' || Array.isArray(d.budgets)
      || !Object.values(d.budgets).every((v) => Number.isInteger(v) && v > 0)) {
      bad('备份里的预算数据有问题');
    }
  }
  if (d.goals !== undefined) {
    const okGoal = (g) => g && typeof g.id === 'string' && typeof g.name === 'string'
      && Number.isInteger(g.target) && g.target > 0 && Array.isArray(g.deposits)
      && g.deposits.every((x) => x && Number.isInteger(x.amount) && /^\d{4}-\d{2}-\d{2}$/.test(x.date));
    if (!Array.isArray(d.goals) || !d.goals.every(okGoal)) bad('备份里的存钱目标数据有问题');
  }
  if (d.quickItems !== undefined) {
    const okQuick = (q) => q && typeof q.id === 'string' && ['expense', 'income'].includes(q.type)
      && Number.isInteger(q.amount) && q.amount > 0;
    if (!Array.isArray(d.quickItems) || !d.quickItems.every(okQuick)) bad('备份里的快捷按钮数据有问题');
  }
  if (d.merchantRules !== undefined && (!d.merchantRules || typeof d.merchantRules !== 'object')) {
    bad('备份里的商家分类数据有问题');
  }
  return d;
}

function importBackupFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let imported;
    try {
      imported = validateBackup(JSON.parse(reader.result));
    } catch (e) {
      alert(`导入失败：${e instanceof SyntaxError ? '文件内容不是正确的备份格式' : e.message}。\n现在的数据没有任何改动。`);
      return;
    }
    const message = `备份文件里有 ${imported.transactions.length} 条记录、${imported.accounts.length} 个账户。\n\n`
      + `导入后，现在的 ${data.transactions.length} 条记录会被替换掉。\n确定要导入吗？`;
    if (!confirm(message)) return;

    // 导入前先把当前数据另存一份在浏览器里，以防万一
    try { localStorage.setItem(`${STORAGE_KEY}-before-import`, JSON.stringify(data)); } catch (e) { /* 存不下就算了 */ }

    data = imported;
    if (saveData()) showToast(`导入成功 ✓ 共 ${data.transactions.length} 条记录`);
    renderCurrentPage();
  };
  reader.onerror = () => alert('读取文件失败，请重试。');
  reader.readAsText(file);
}

/* ---------- 图表页（自己画的 SVG 图，不用联网） ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';
const PIE_MAX_SLICES = 8; // 超过 8 类时，小的合并成「其余」

function renderCharts() {
  const [y, m] = viewMonth.split('-').map(Number);
  $('c-month-label').textContent = `${y}年${m}月`;
  $('pie-title').textContent = `${m}月支出构成`;
  renderPie();
  renderTrend();
}

/** 简短金额，用在坐标轴上：$1.2k、$500 */
function formatMoneyShort(cents) {
  const d = cents / 100;
  if (d >= 1000) return `$${(d / 1000).toFixed(d >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return `$${Math.round(d)}`;
}

/* ----- 饼图：本月支出按分类 ----- */

function pieSlices() {
  const spent = spentByCategory(viewMonth);
  // 按分类列表的顺序排，这样同一个分类每个月的位置和颜色尽量不变
  let slices = data.categories
    .filter((c) => c.type === 'expense' && spent.get(c.id) > 0)
    .map((c) => ({ id: c.id, name: c.name, icon: c.icon, amount: spent.get(c.id) }));
  // 分类被删掉的旧记录
  const known = new Set(slices.map((s) => s.id));
  let unknown = 0;
  for (const [id, amt] of spent) if (!known.has(id)) unknown += amt;

  if (slices.length > PIE_MAX_SLICES || (unknown && slices.length >= PIE_MAX_SLICES)) {
    const keep = new Set([...slices].sort((a, b) => b.amount - a.amount)
      .slice(0, PIE_MAX_SLICES - 1).map((s) => s.id));
    unknown += slices.filter((s) => !keep.has(s.id)).reduce((s, x) => s + x.amount, 0);
    slices = slices.filter((s) => keep.has(s.id));
  }
  slices.forEach((s, i) => { s.color = `var(--cat-${i + 1})`; });
  if (unknown) slices.push({ id: '__other', name: '其余', icon: '…', amount: unknown, color: 'var(--cat-other)' });
  return slices;
}

function arcPath(cx, cy, rOut, rIn, a0, a1) {
  const pt = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = pt(rOut, a0);
  const [x1, y1] = pt(rOut, a1);
  const [x2, y2] = pt(rIn, a1);
  const [x3, y3] = pt(rIn, a0);
  return `M${x0},${y0} A${rOut},${rOut} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${rIn},${rIn} 0 ${large} 0 ${x3},${y3} Z`;
}

function renderPie() {
  const area = $('pie-area');
  const slices = pieSlices();
  const total = slices.reduce((s, x) => s + x.amount, 0);
  if (!total) {
    area.innerHTML = '<p class="chart-empty">这个月还没有支出记录</p>';
    return;
  }

  let angle = 0;
  const paths = slices.map((s, i) => {
    // 只有一类时画成完整圆环（两个半圆拼起来）
    const sweep = (s.amount / total) * Math.PI * 2;
    const d = slices.length === 1
      ? arcPath(100, 100, 92, 58, 0, Math.PI) + arcPath(100, 100, 92, 58, Math.PI, Math.PI * 2 - 1e-6)
      : arcPath(100, 100, 92, 58, angle, angle + sweep);
    angle += sweep;
    return `<path class="pie-slice" data-i="${i}" d="${d}" fill="${s.color}"><title>${escapeHtml(s.name)} ${formatMoney(s.amount)}</title></path>`;
  }).join('');

  const legendOrder = slices.map((s, i) => ({ ...s, i })).sort((a, b) => b.amount - a.amount);
  area.innerHTML = `
    <div class="pie-wrap">
      <svg class="pie-svg" viewBox="0 0 200 200" role="img" aria-label="本月支出按分类的环形图">
        ${paths}
        <text class="pie-center-label" x="100" y="92" text-anchor="middle" id="pie-c-label">总支出</text>
        <text class="pie-center-value" x="100" y="118" text-anchor="middle" id="pie-c-value">${formatMoney(total)}</text>
      </svg>
      <ul class="pie-legend">
        ${legendOrder.map((s) => `
          <li data-i="${s.i}">
            <i class="swatch" style="background:${s.color}"></i>
            <span class="lg-name">${s.icon} ${escapeHtml(s.name)}</span>
            <span class="lg-amt">${formatMoney(s.amount)}</span>
            <span class="lg-pct">${Math.round((s.amount / total) * 100)}%</span>
          </li>`).join('')}
      </ul>
    </div>`;

  // 鼠标移上去 / 手指点一下：突出这一类，中间显示它的金额；再点一下取消
  let focused = null;
  const setFocus = (i) => {
    focused = i;
    const svg = area.querySelector('.pie-svg');
    svg.classList.toggle('has-focus', i !== null);
    area.querySelectorAll('[data-i]').forEach((el) => el.classList.toggle('focus', i !== null && Number(el.dataset.i) === i));
    const s = i === null ? null : slices[i];
    $('pie-c-label').textContent = s ? `${s.name} · ${Math.round((s.amount / total) * 100)}%` : '总支出';
    $('pie-c-value').textContent = formatMoney(s ? s.amount : total);
  };
  area.querySelectorAll('[data-i]').forEach((el) => {
    const i = Number(el.dataset.i);
    el.addEventListener('mouseenter', () => setFocus(i));
    el.addEventListener('mouseleave', () => setFocus(null));
    el.addEventListener('click', () => setFocus(focused === i ? null : i));
  });
}

/* ----- 柱状图：最近 6 个月收入和支出 ----- */

function trendData() {
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(viewMonth, -i));
  const rows = months.map((month) => ({ month, income: 0, expense: 0 }));
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  for (const t of data.transactions) {
    const r = byMonth.get(t.date.slice(0, 7));
    if (!r) continue;
    if (t.type === 'income') r.income += t.amount;
    else if (t.type === 'expense') r.expense += t.amount;
  }
  return rows;
}

/** 找一个好看的刻度间隔（1、2、5 × 10 的幂） */
function niceStep(max, count) {
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** 顶部是 4px 圆角、底部贴着横线的柱子 */
function barPath(x, yTop, w, yBase) {
  const h = yBase - yTop;
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${yBase} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${yBase} Z`;
}

function renderTrend() {
  const rows = trendData();
  const box = $('trend-chart');
  const W = Math.max(280, box.clientWidth || 320);
  const H = 220;
  const pad = { top: 12, right: 4, bottom: 28, left: 48 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const max = Math.max(...rows.map((r) => Math.max(r.income, r.expense)));
  const step = max > 0 ? niceStep(max, 4) : 10000;
  const top = max > 0 ? Math.ceil(max / step) * step : step * 4;
  const yOf = (v) => pad.top + plotH - (v / top) * plotH;

  let svg = '';
  for (let v = 0; v <= top + 1; v += step) {
    const y = yOf(v);
    svg += `<line class="grid-line" x1="${pad.left}" x2="${W - pad.right}" y1="${y}" y2="${y}"/>`;
    svg += `<text class="axis-label" x="${pad.left - 8}" y="${y + 4}" text-anchor="end">${formatMoneyShort(v)}</text>`;
  }

  const groupW = plotW / rows.length;
  const barW = Math.min(28, (groupW - 16) / 2);
  const baseY = yOf(0);
  const thisMonth = currentMonthStr();
  rows.forEach((r, i) => {
    const cx = pad.left + groupW * i + groupW / 2;
    // 收入在左、支出在右，中间留 2px 缝
    svg += `<path d="${barPath(cx - barW - 1, yOf(r.income), barW, baseY)}" fill="var(--c-income)"/>`;
    svg += `<path d="${barPath(cx + 1, yOf(r.expense), barW, baseY)}" fill="var(--c-expense)"/>`;
    const m = Number(r.month.slice(5));
    const cls = r.month === thisMonth ? 'axis-label current' : 'axis-label';
    svg += `<text class="${cls}" x="${cx}" y="${H - 8}" text-anchor="middle">${m}月</text>`;
    svg += `<rect class="hit" data-i="${i}" x="${pad.left + groupW * i}" y="${pad.top}" width="${groupW}" height="${plotH}" rx="6"/>`;
  });

  box.innerHTML = `<svg xmlns="${SVG_NS}" viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="最近 6 个月收入和支出柱状图">${svg}</svg>
    <div class="chart-tooltip" hidden></div>`;

  // 鼠标移上去 / 手指点一下某个月：显示这个月的具体数字
  const tip = box.querySelector('.chart-tooltip');
  let shown = null;
  const show = (i) => {
    shown = i;
    box.querySelectorAll('.hit').forEach((h) => h.classList.toggle('focus', Number(h.dataset.i) === i));
    if (i === null) { tip.hidden = true; return; }
    const r = rows[i];
    const [yy, mm] = r.month.split('-').map(Number);
    const net = r.income - r.expense;
    tip.innerHTML = `<b>${yy}年${mm}月</b>
      <div class="row"><i class="swatch" style="background:var(--c-income)"></i>收入 ${formatMoney(r.income)}</div>
      <div class="row"><i class="swatch" style="background:var(--c-expense)"></i>支出 ${formatMoney(r.expense)}</div>
      <div class="row">结余 ${formatMoney(net)}</div>`;
    tip.hidden = false;
    const cx = pad.left + groupW * i + groupW / 2;
    const left = Math.max(0, Math.min(W - tip.offsetWidth, cx - tip.offsetWidth / 2));
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, pad.top - 4)}px`;
  };
  box.querySelectorAll('.hit').forEach((h) => {
    const i = Number(h.dataset.i);
    h.addEventListener('mouseenter', () => show(i));
    h.addEventListener('mouseleave', () => show(null));
    h.addEventListener('click', () => show(shown === i ? null : i));
  });

  // 数字表格
  $('trend-table').innerHTML = `<table>
    <thead><tr><th>月份</th><th>收入</th><th>支出</th><th>结余</th></tr></thead>
    <tbody>${rows.slice().reverse().map((r) => {
      const [yy, mm] = r.month.split('-').map(Number);
      const net = r.income - r.expense;
      return `<tr><td>${String(yy).slice(2)}年${mm}月</td><td>${formatMoney(r.income)}</td><td>${formatMoney(r.expense)}</td>
        <td class="${net < 0 ? 'expense' : ''}">${formatMoney(net)}</td></tr>`;
    }).join('')}</tbody></table>`;
}

/* ---------- 存钱目标页 ---------- */

function goalSaved(goal) {
  return goal.deposits.reduce((s, d) => s + d.amount, 0);
}

/** 从今天到目标日期还剩几个月（不足一个月算 1 个月）；没设日期返回 null，已过期返回 0 */
function monthsUntil(dateStr) {
  if (!dateStr) return null;
  if (dateStr < todayStr()) return 0;
  const [y, m] = dateStr.split('-').map(Number);
  const now = new Date();
  return Math.max(1, (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()));
}

function formatDateCn(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

function goalInfoHtml(goal, saved) {
  if (saved >= goal.target) return '🎉 目标已达成！';
  const left = goal.target - saved;
  let text = `还差 ${formatMoney(left)}`;
  const months = monthsUntil(goal.deadline);
  if (months === 0) {
    text += ` · <span class="late">已过目标日期（${formatDateCn(goal.deadline)}）</span>`;
  } else if (months !== null) {
    text += ` · 到 ${formatDateCn(goal.deadline)} 每月需存 <b>${formatMoney(Math.ceil(left / months))}</b>`;
  }
  return text;
}

function renderGoals() {
  renderSavingsAdvice();
  const goals = data.goals || [];
  const totalSaved = goals.reduce((s, g) => s + goalSaved(g), 0);
  const doneCount = goals.filter((g) => goalSaved(g) >= g.target).length;
  $('goals-summary').innerHTML = goals.length ? `
      <span class="summary-label">所有目标一共已存</span>
      <span class="net-value">${formatMoney(totalSaved)}</span>
      <div class="net-sub"><span>目标 <b>${goals.length}</b> 个</span><span>已完成 <b>${doneCount}</b> 个</span></div>`
    : `<div class="empty-icon">🐷</div><span class="summary-label">还没有存钱目标，点下面按钮新建一个吧</span>`;

  $('goal-list').innerHTML = goals.map((g) => {
    const saved = goalSaved(g);
    const done = saved >= g.target;
    const pct = Math.round((saved / g.target) * 100);
    const history = g.deposits.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    return `<section class="goal-card ${done ? 'done' : ''}" data-goal="${g.id}">
        <div class="goal-head">
          <span class="record-icon">${g.icon}</span>
          <span class="goal-name">${escapeHtml(g.name)}</span>
          <button class="icon-btn" data-goal-edit aria-label="修改目标" title="修改目标">✏️</button>
        </div>
        <div class="goal-nums">
          <span class="goal-saved">${formatMoney(saved)}</span>
          <span class="goal-target">目标 ${formatMoney(g.target)} · ${pct}%</span>
        </div>
        ${barHtml(saved, g.target)}
        <p class="goal-info">${goalInfoHtml(g, saved)}</p>
        <div class="action-row">
          <button class="btn btn-primary" data-goal-deposit="in">＋ 存入</button>
          <button class="btn btn-plain" data-goal-deposit="out" ${saved <= 0 ? 'disabled' : ''}>－ 取出</button>
        </div>
        ${history.length ? `
        <details class="goal-history">
          <summary>存取记录（${history.length} 笔）</summary>
          ${history.map((d) => `
            <div class="history-row">
              <span class="h-main">
                <div>${d.amount > 0 ? '存入' : '取出'}${d.note ? ' · ' + escapeHtml(d.note) : ''}</div>
                <div class="h-date">${formatDateCn(d.date)}</div>
              </span>
              <span class="h-amt ${d.amount > 0 ? 'income' : 'expense'}">${d.amount > 0 ? '+' : '-'}${formatMoney(Math.abs(d.amount))}</span>
              <button class="h-del" data-deposit-del="${d.id}" aria-label="删除这笔" title="删除这笔">✕</button>
            </div>`).join('')}
        </details>` : ''}
      </section>`;
  }).join('');
}

function editGoal(goal) {
  openEditor({
    title: goal ? '修改存钱目标' : '新建存钱目标',
    name: goal ? goal.name : '',
    icon: goal ? goal.icon : '🐷',
    namePlaceholder: '比如：日本旅行',
    extraHtml: `
      <label class="field">
        <span class="field-label">目标金额</span>
        <input id="e-target" type="text" inputmode="decimal" class="input" placeholder="比如 5000" autocomplete="off"
          value="${goal ? (goal.target / 100).toFixed(2) : ''}">
      </label>
      <label class="field">
        <span class="field-label">希望哪天之前存够（可不填）</span>
        <input id="e-deadline" type="date" class="input" value="${goal && goal.deadline ? goal.deadline : ''}">
        <p class="field-hint">填了日期，会帮你算出每个月需要存多少。</p>
      </label>`,
    onSave({ name, icon }) {
      const target = parseAmount($('e-target').value);
      if (target === null) return '请输入正确的目标金额，比如 5000';
      const deadline = $('e-deadline').value || null;
      if (goal) {
        Object.assign(goal, { name, icon, target, deadline });
        showToast('目标已修改 ✓');
      } else {
        data.goals = data.goals || [];
        data.goals.push({ id: newId('goal'), name, icon, target, deadline, deposits: [], createdAt: Date.now() });
        showToast('目标已创建 ✓ 点「存入」开始存钱吧');
      }
      return '';
    },
    onDelete: goal ? () => {
      const saved = goalSaved(goal);
      const extra = goal.deposits.length ? `\n它的 ${goal.deposits.length} 笔存取记录（共 ${formatMoney(saved)}）也会一起删除。` : '';
      if (!confirm(`确定删除目标「${goal.name}」吗？${extra}`)) return false;
      data.goals = data.goals.filter((g) => g !== goal);
      showToast('目标已删除');
      return '';
    } : null,
  });
}

/** direction: 'in' 存入，'out' 取出 */
function editDeposit(goal, direction) {
  const saved = goalSaved(goal);
  const isIn = direction === 'in';
  openEditor({
    title: `${goal.icon} ${goal.name} · ${isIn ? '存入' : '取出'}`,
    withNameIcon: false,
    extraHtml: `
      <label class="amount-field">
        <span class="currency">$</span>
        <input id="e-dep-amount" type="text" inputmode="decimal" placeholder="0.00" autocomplete="off" aria-label="金额">
      </label>
      <p class="field-hint" style="margin:-6px 2px 14px">
        ${isIn ? `已存 ${formatMoney(saved)}，还差 ${formatMoney(Math.max(0, goal.target - saved))}` : `目前已存 ${formatMoney(saved)}，最多能取出这么多`}
      </p>
      <label class="field">
        <span class="field-label">日期</span>
        <input id="e-dep-date" type="date" class="input" value="${todayStr()}">
      </label>
      <label class="field">
        <span class="field-label">备注（可不填）</span>
        <input id="e-dep-note" type="text" class="input" maxlength="50" placeholder="${isIn ? '比如：发工资存一笔' : '比如：临时急用'}">
      </label>`,
    onSave() {
      const amount = parseAmount($('e-dep-amount').value);
      const date = $('e-dep-date').value;
      if (amount === null) return '请输入正确的金额，比如 100';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '请选择日期';
      if (!isIn && amount > saved) return `最多只能取出 ${formatMoney(saved)}`;
      goal.deposits.push({
        id: newId('dep'),
        amount: isIn ? amount : -amount,
        date,
        note: $('e-dep-note').value.trim(),
        createdAt: Date.now(),
      });
      const nowSaved = goalSaved(goal);
      if (isIn && saved < goal.target && nowSaved >= goal.target) {
        showToast(`🎉 恭喜！「${goal.name}」目标达成！`, 'done');
      } else {
        showToast(isIn ? `已存入 ${formatMoney(amount)} ✓` : `已取出 ${formatMoney(amount)}`);
      }
      return '';
    },
  });
  setTimeout(() => $('e-dep-amount')?.focus(), 50);
}

function deleteDeposit(goal, depositId) {
  const dep = goal.deposits.find((d) => d.id === depositId);
  if (!dep) return;
  const remaining = goalSaved(goal) - dep.amount;
  if (remaining < 0) {
    alert('删除这笔存入后，已存金额会变成负数。请先删除后面的取出记录。');
    return;
  }
  const what = `${dep.amount > 0 ? '存入' : '取出'} ${formatMoney(Math.abs(dep.amount))}（${formatDateCn(dep.date)}）`;
  if (!confirm(`确定删除这笔${what}吗？`)) return;
  goal.deposits = goal.deposits.filter((d) => d !== dep);
  saveData();
  showToast('已删除');
  renderGoals();
}

/* ---------- 理财助手：自动预算、存钱建议、每日小知识 ----------
   都是按通用规则在本地计算，不联网，也不是个人投资建议。 */

const SAVE_RATE = 0.2;          // 50/30/20：建议存下收入的 20%
const SPEND_RATE = 0.8;         // 必需 + 想要 最多占收入的 80%
const MIN_WANT_KEEP = 0.5;      // 「想要」类最多压缩到原来的一半，压太狠不现实
const EMERGENCY_MONTHS = 3;     // 应急金 = 3 个月生活费（用户选的）
const NEED_CATEGORY_IDS = new Set(['cat-food', 'cat-transport', 'cat-housing', 'cat-medical']);

/** 分类是「必需」(need) 还是「想要」(want)；用户可以在自动预算里改 */
function categoryKind(c) {
  return c.kind || (NEED_CATEGORY_IDS.has(c.id) ? 'need' : 'want');
}

/** 把「分」向上取整到 $10 */
function roundUp10(cents) {
  return Math.ceil(cents / 1000) * 1000;
}

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return `${y}年${m}月`;
}

/**
 * 最近的收支情况：优先用本月之前 3 个整月里有记录的月份。
 * 一个整月都没有时，退而用本月到目前为止的数据（partial = true）。
 */
function recentStats() {
  const thisMonth = currentMonthStr();
  const candidates = [1, 2, 3].map((i) => shiftMonth(thisMonth, -i));
  const hasData = new Set(data.transactions.filter((t) => t.type !== 'transfer').map((t) => t.date.slice(0, 7)));
  let months = candidates.filter((m) => hasData.has(m));
  const partial = months.length === 0;
  if (partial) months = hasData.has(thisMonth) ? [thisMonth] : [];

  const n = months.length;
  const monthSet = new Set(months);
  let income = 0;
  let expense = 0;
  const byCat = new Map();
  for (const t of data.transactions) {
    if (!monthSet.has(t.date.slice(0, 7))) continue;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') {
      expense += t.amount;
      byCat.set(t.categoryId, (byCat.get(t.categoryId) || 0) + t.amount);
    }
  }
  const avgByCat = new Map();
  for (const [id, sum] of byCat) avgByCat.set(id, n ? Math.round(sum / n) : 0);
  return {
    n,
    months: months.slice().sort(),
    partial,
    avgIncome: n ? Math.round(income / n) : 0,
    avgExpense: n ? Math.round(expense / n) : 0,
    avgByCat,
  };
}

function statsSourceText(stats) {
  if (!stats.n) return '';
  if (stats.partial) return `⚠️ 只有本月（${monthLabel(stats.months[0])}）到今天的记录，数据较少，建议仅供参考。记满一个月后会更准。`;
  const range = stats.n === 1 ? monthLabel(stats.months[0]) : `${monthLabel(stats.months[0])} ~ ${monthLabel(stats.months[stats.n - 1])}`;
  return `参考了 ${range} 的记录（${stats.n} 个月平均）${stats.n < 3 ? '，记录再多一些会更准' : ''}。`;
}

/**
 * 按 50/30/20 给出每个分类的建议预算。
 * 先按近期平均花费；如果 必需+想要 超过收入的 80%，按比例压缩「想要」类（最多压到一半）。
 */
function suggestBudgets(income, rows) {
  const needs = rows.filter((r) => r.kind === 'need').reduce((s, r) => s + r.avg, 0);
  const wants = rows.filter((r) => r.kind === 'want').reduce((s, r) => s + r.avg, 0);
  let wantFactor = 1;
  if (income > 0 && wants > 0 && needs + wants > income * SPEND_RATE) {
    const allowed = Math.max(0, income * SPEND_RATE - needs);
    wantFactor = Math.max(MIN_WANT_KEEP, allowed / wants);
  }
  for (const r of rows) {
    // 被压缩的「想要」类向下取整，避免取整后又超过 80%
    r.suggested = r.kind === 'want' && wantFactor < 1
      ? Math.max(1000, Math.floor((r.avg * wantFactor) / 1000) * 1000)
      : roundUp10(r.avg);
  }
  return wantFactor;
}

function openAutoBudget() {
  const stats = recentStats();
  const rows = data.categories
    .filter((c) => c.type === 'expense' && stats.avgByCat.get(c.id) > 0)
    .map((c) => ({ cat: c, kind: categoryKind(c), avg: stats.avgByCat.get(c.id) }));
  if (!rows.length) {
    alert('还没有支出记录，没法给出建议。\n先记一段时间的账（最好满一个月），再来试试。');
    return;
  }

  const renderRows = (income) => {
    const wantFactor = suggestBudgets(income, rows);
    $('ab-rows').innerHTML = rows.map((r, i) => `
      <div class="ab-row">
        <div class="ab-top">
          <span class="ab-name">${r.cat.icon} ${escapeHtml(r.cat.name)}</span>
          <button type="button" class="kind-tag ${r.kind}" data-kind-i="${i}" title="点一下切换">${r.kind === 'need' ? '必需' : '想要'}</button>
        </div>
        <div class="ab-bottom">
          <span class="ab-avg">月均花 ${formatMoney(r.avg)}</span>
          <label class="ab-input"><span>$</span><input type="text" inputmode="decimal" data-ab-i="${i}" value="${(r.suggested / 100).toFixed(0)}" aria-label="${escapeHtml(r.cat.name)}的预算"></label>
        </div>
      </div>`).join('');
    $('ab-note').textContent = wantFactor < 1
      ? `你最近的开销超过了收入的 80%，所以「想要」类的预算已经按比例减少（约减 ${Math.round((1 - wantFactor) * 100)}%）。`
      : '';
    updateAutoBudgetSummary();
  };

  openEditor({
    title: '✨ 自动设置预算',
    withNameIcon: false,
    submitLabel: '应用这个预算',
    extraHtml: `
      <p class="field-hint" style="margin:0 2px 12px">${statsSourceText(stats)}</p>
      <label class="field">
        <span class="field-label">你每月的收入（税后，可以改）</span>
        <input id="ab-income" type="text" inputmode="decimal" class="input" value="${(stats.avgIncome / 100).toFixed(0)}" autocomplete="off">
      </label>
      <div class="ab-summary" id="ab-summary"></div>
      <p class="field-hint" id="ab-note"></p>
      <div class="field-label" style="margin-top:12px">每个分类的建议预算（可以改）</div>
      <div class="ab-rows" id="ab-rows"></div>
      <p class="field-hint">按常见的「50/30/20 方法」：必需开销约 50%、想要的开销约 30%、存下 20%。点「必需 / 想要」可以切换分类的类型。<br>这只是通用参考，不是专业理财建议。</p>`,
    onSave() {
      const budgets = data.budgets || {};
      for (const [i, r] of rows.entries()) {
        const input = document.querySelector(`[data-ab-i="${i}"]`);
        const cents = input.value.trim() === '' ? 0 : parseAmount(input.value, true);
        if (cents === null || cents < 0) return `「${r.cat.name}」的预算金额不对`;
        if (cents > 0) budgets[r.cat.id] = cents;
        else delete budgets[r.cat.id];
        r.cat.kind = r.kind;
      }
      data.budgets = budgets;
      showToast('预算已自动设置 ✓');
      return '';
    },
  });

  const incomeInput = $('ab-income');
  incomeInput.addEventListener('input', () => renderRows(parseAmount(incomeInput.value) || 0));
  $('ab-rows').addEventListener('input', updateAutoBudgetSummary);
  $('ab-rows').addEventListener('click', (e) => {
    const tag = e.target.closest('[data-kind-i]');
    if (!tag) return;
    const r = rows[Number(tag.dataset.kindI)];
    r.kind = r.kind === 'need' ? 'want' : 'need';
    renderRows(parseAmount(incomeInput.value) || 0);
  });
  renderRows(stats.avgIncome);

  function updateAutoBudgetSummary() {
    const income = parseAmount($('ab-income').value) || 0;
    let needs = 0;
    let wants = 0;
    rows.forEach((r, i) => {
      const v = parseAmount(document.querySelector(`[data-ab-i="${i}"]`).value) || 0;
      if (r.kind === 'need') needs += v;
      else wants += v;
    });
    const save = income - needs - wants;
    const pct = (v) => (income > 0 ? `${Math.round((v / income) * 100)}%` : '—');
    const level = save < 0 ? 'over' : (income > 0 && save < income * SAVE_RATE ? 'warn' : 'ok');
    const msg = !income
      ? '填上每月收入，就能算出每月能存多少。'
      : level === 'over' ? '⚠️ 预算加起来超过了收入，需要减少一些开销。'
        : level === 'warn' ? `能存的钱少于建议的 20%（${formatMoney(Math.round(income * SAVE_RATE))}），可以试着调低「想要」类的预算。`
          : '👍 按这个预算，能存下收入的 20% 以上。';
    $('ab-summary').className = `ab-summary lvl-${level}`;
    $('ab-summary').innerHTML = `
      <div class="ab-sum-grid">
        <div><span>必需</span><b>${formatMoney(needs)}</b><small>${pct(needs)}</small></div>
        <div><span>想要</span><b>${formatMoney(wants)}</b><small>${pct(wants)}</small></div>
        <div><span>每月能存</span><b class="ab-save">${formatMoney(save)}</b><small>${pct(save)}</small></div>
      </div>
      <p>${msg}</p>`;
  }
}

/* ----- 存钱建议（存钱页顶部） ----- */

function findEmergencyGoal() {
  return (data.goals || []).find((g) => g.kind === 'emergency');
}

function renderSavingsAdvice() {
  const stats = recentStats();
  const el = $('savings-advice');
  if (!stats.n || (!stats.avgIncome && !stats.avgExpense)) {
    el.innerHTML = `<h2 class="chart-title">💡 存钱建议</h2>
      <p class="field-hint" style="margin:0">记一段时间的收入和支出后，这里会帮你算出：每月建议存多少、应急金需要多少。</p>`;
    return;
  }

  const suggested = Math.round(stats.avgIncome * SAVE_RATE);
  const left = stats.avgIncome - stats.avgExpense;
  const emergencyTarget = roundUp10(stats.avgExpense * EMERGENCY_MONTHS);
  const goal = findEmergencyGoal();

  let verdict;
  if (!stats.avgIncome) verdict = '还没有收入记录，记一笔工资后建议会更准确。';
  else if (left <= 0) verdict = '⚠️ 最近的支出超过了收入。可以先去「预算」页点「✨ 帮我自动设置预算」，控制一下开销。';
  else if (left < suggested) verdict = `按最近的开销，每月只剩 ${formatMoney(left)}，比建议少一些。可以试试「预算」页的自动设置，减少「想要」类开销。`;
  else verdict = `👍 按最近的开销，每月能剩 ${formatMoney(left)}，已经做到了。记得及时把钱存进下面的存钱目标。`;

  let emergencyHtml;
  if (!stats.avgExpense) {
    emergencyHtml = '';
  } else if (!goal) {
    emergencyHtml = `<button class="btn btn-primary btn-block" id="create-emergency">🛟 创建「应急金」目标（${formatMoney(emergencyTarget)}）</button>`;
  } else {
    const differs = Math.abs(goal.target - emergencyTarget) > goal.target * 0.1;
    emergencyHtml = `<p class="field-hint" style="margin:8px 0 0">已有「${escapeHtml(goal.name)}」目标：已存 ${formatMoney(goalSaved(goal))} / ${formatMoney(goal.target)}。</p>
      ${differs ? `<button class="btn btn-plain btn-block" id="update-emergency">按最新生活费更新目标为 ${formatMoney(emergencyTarget)}</button>` : ''}`;
  }

  el.innerHTML = `
    <h2 class="chart-title">💡 存钱建议</h2>
    <div class="advice-grid">
      <div><span>月均收入</span><b>${formatMoney(stats.avgIncome)}</b></div>
      <div><span>月均生活费</span><b>${formatMoney(stats.avgExpense)}</b></div>
      <div class="hl"><span>建议每月存</span><b>${formatMoney(suggested)}</b></div>
    </div>
    <p class="advice-text">建议每月存收入的 20%（50/30/20 方法）。${verdict}</p>
    ${stats.avgExpense ? `<p class="advice-text"><b>应急金：</b>建议存够 ${EMERGENCY_MONTHS} 个月的生活费，约 <b>${formatMoney(emergencyTarget)}</b>，用来应付失业、生病等意外。
      <a href="https://moneysmart.gov.au/saving/save-for-an-emergency-fund" target="_blank" rel="noopener">了解更多 ›</a></p>` : ''}
    ${emergencyHtml}
    <p class="field-hint" style="margin:10px 0 0">${statsSourceText(stats)} 这只是通用参考，不是专业理财建议。</p>`;
}

function createOrUpdateEmergencyGoal() {
  const stats = recentStats();
  const target = roundUp10(stats.avgExpense * EMERGENCY_MONTHS);
  const monthly = Math.round(stats.avgIncome * SAVE_RATE);
  let goal = findEmergencyGoal();
  if (goal) {
    goal.target = target;
    showToast(`应急金目标已更新为 ${formatMoney(target)} ✓`);
  } else {
    // 如果按建议每月存 20%，大约多久能存够 → 作为目标日期
    let deadline = null;
    if (monthly > 0) {
      const months = Math.max(1, Math.ceil(target / monthly));
      const d = new Date();
      d.setMonth(d.getMonth() + months);
      deadline = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    goal = { id: newId('goal'), kind: 'emergency', name: '应急金', icon: '🛟', target, deadline, deposits: [], createdAt: Date.now() };
    data.goals = data.goals || [];
    data.goals.unshift(goal);
    showToast('已创建「应急金」目标 ✓');
  }
  saveData();
  renderGoals();
}

/* ----- 每日理财小知识（明细页顶部） ----- */

function todayTip() {
  if (typeof DAILY_TIPS === 'undefined' || !DAILY_TIPS.length) return null;
  const d = new Date();
  const dayNumber = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  return DAILY_TIPS[dayNumber % DAILY_TIPS.length];
}

function renderDailyTip() {
  const el = $('daily-tip');
  const tip = todayTip();
  const hiddenToday = data.settings && data.settings.tipHiddenDate === todayStr();
  el.hidden = !tip || hiddenToday || viewMonth !== currentMonthStr();
  if (el.hidden) return;
  el.innerHTML = `
    <div class="tip-head">
      <span class="tip-label">💡 今日理财小知识</span>
      <button class="tip-close" id="tip-close" aria-label="今天不再显示" title="今天不再显示">✕</button>
    </div>
    <div class="tip-title">${escapeHtml(tip.title)}</div>
    <p class="tip-text">${escapeHtml(tip.text)}</p>
    <a class="tip-link" href="${tip.link}" target="_blank" rel="noopener">了解更多（澳洲政府网站，英文）›</a>`;
}

/* ---------- 预算页 ---------- */

/** 某个月每个分类花了多少（分） */
function spentByCategory(month) {
  const spent = new Map();
  for (const t of data.transactions) {
    if (t.type === 'expense' && t.date.startsWith(month)) {
      spent.set(t.categoryId, (spent.get(t.categoryId) || 0) + t.amount);
    }
  }
  return spent;
}

/** 根据已用和预算算出状态：ok 正常 / warn 用了 80% 以上 / over 超支 */
function budgetLevel(spent, budget) {
  if (spent > budget) return 'over';
  if (spent >= budget * 0.8) return 'warn';
  return 'ok';
}

const LEVEL_RANK = { ok: 0, warn: 1, over: 2 };

/** 某分类某月的预算情况；没设预算返回 null */
function budgetInfo(categoryId, month) {
  const budget = (data.budgets || {})[categoryId];
  if (!budget) return null;
  const spent = spentByCategory(month).get(categoryId) || 0;
  return { budget, spent, level: budgetLevel(spent, budget) };
}

/** 如果这个分类刚刚跨过 80% 或超支，返回提醒文字和级别；否则返回 null */
function budgetCrossing(categoryId, month, before) {
  const after = budgetInfo(categoryId, month);
  if (!after || after.level === 'ok') return null;
  if (before && LEVEL_RANK[before.level] >= LEVEL_RANK[after.level]) return null;
  const cat = findCategory(categoryId);
  const pct = Math.round((after.spent / after.budget) * 100);
  if (after.level === 'over') {
    return { level: 'over', text: `🚨 「${cat.name}」超支了！\n已花 ${formatMoney(after.spent)}，超出预算 ${formatMoney(after.spent - after.budget)}` };
  }
  return { level: 'warn', text: `⚠️ 「${cat.name}」预算已用 ${pct}%\n只剩 ${formatMoney(after.budget - after.spent)} 了` };
}

/** 记账后，如果这个分类刚刚跨过 80% 或超支，弹出醒目提醒 */
function warnIfBudgetCrossed(categoryId, month, before) {
  const crossing = budgetCrossing(categoryId, month, before);
  if (crossing) showToast(crossing.text, crossing.level);
}

/** 某月所有设了预算的分类，按紧急程度排序 */
function budgetRows(month) {
  const spent = spentByCategory(month);
  const budgets = data.budgets || {};
  return data.categories
    .filter((c) => c.type === 'expense' && budgets[c.id])
    .map((c) => {
      const s = spent.get(c.id) || 0;
      return { cat: c, budget: budgets[c.id], spent: s, level: budgetLevel(s, budgets[c.id]) };
    })
    .sort((a, b) => (LEVEL_RANK[b.level] - LEVEL_RANK[a.level]) || (b.spent / b.budget - a.spent / a.budget));
}

function budgetStateText(row) {
  if (row.level === 'over') return `🚨 超支 ${formatMoney(row.spent - row.budget)}`;
  if (row.level === 'warn') return `⚠️ 剩 ${formatMoney(row.budget - row.spent)}`;
  return `剩 ${formatMoney(row.budget - row.spent)}`;
}

function barHtml(spent, budget) {
  const pct = Math.min(100, budget ? (spent / budget) * 100 : 0);
  return `<div class="bar"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>`;
}

function renderBudget() {
  const [y, m] = viewMonth.split('-').map(Number);
  $('b-month-label').textContent = `${y}年${m}月`;

  const rows = budgetRows(viewMonth);
  const spent = spentByCategory(viewMonth);

  // 总览
  if (rows.length) {
    const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
    const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
    const level = budgetLevel(totalSpent, totalBudget);
    const left = totalBudget - totalSpent;
    $('budget-total').className = `budget-total lvl-${level}`;
    $('budget-total').innerHTML = `
      <div class="summary-label">${m}月预算${left >= 0 ? '还剩' : '已超出'}</div>
      <div class="budget-total-top">
        <span class="budget-total-left ${left < 0 ? 'expense' : ''}">${formatMoney(Math.abs(left))}</span>
        <span class="budget-total-sub">已用 ${formatMoney(totalSpent)} / ${formatMoney(totalBudget)}</span>
      </div>
      ${barHtml(totalSpent, totalBudget)}`;
  } else {
    $('budget-total').innerHTML = '';
  }

  $('budget-list').innerHTML = rows.map((r) => `
    <button class="record budget-row lvl-${r.level}" data-budget-cat="${r.cat.id}">
      <span class="record-icon">${r.cat.icon}</span>
      <span class="record-main">
        <div class="record-cat">${escapeHtml(r.cat.name)}</div>
        <div class="budget-nums">${formatMoney(r.spent)} / ${formatMoney(r.budget)} · ${Math.round((r.spent / r.budget) * 100)}%</div>
        ${barHtml(r.spent, r.budget)}
      </span>
      <span class="budget-state">${budgetStateText(r)}</span>
    </button>`).join('');
  $('budget-empty-hint').hidden = rows.length > 0;

  const budgets = data.budgets || {};
  $('no-budget-list').innerHTML = data.categories
    .filter((c) => c.type === 'expense' && !budgets[c.id])
    .map((c) => `
      <button class="record" data-budget-cat="${c.id}">
        <span class="record-icon">${c.icon}</span>
        <span class="record-main">
          <div class="record-cat">${escapeHtml(c.name)}</div>
          <div class="record-sub">本月已花 ${formatMoney(spent.get(c.id) || 0)}</div>
        </span>
        <span class="chevron chevron-text">设置 ›</span>
      </button>`).join('');
}

/** 明细页顶部：本月有分类快超支或已超支时显示 */
function renderBudgetAlert() {
  const rows = budgetRows(viewMonth).filter((r) => r.level !== 'ok');
  const el = $('budget-alert');
  el.hidden = rows.length === 0;
  if (!rows.length) return;
  const over = rows.filter((r) => r.level === 'over');
  const warn = rows.filter((r) => r.level === 'warn');
  const lines = [];
  if (over.length) lines.push(`🚨 已超支：${over.map((r) => escapeHtml(r.cat.name)).join('、')}`);
  if (warn.length) lines.push(`⚠️ 快用完：${warn.map((r) => escapeHtml(r.cat.name)).join('、')}`);
  el.innerHTML = `${lines.join('<br>')} <b>›</b>`;
  el.classList.toggle('only-warn', over.length === 0);
}

/** 底部「预算」按钮上的小圆点：本月有超支显示红点，快用完显示黄点 */
function renderBudgetDot() {
  const rows = budgetRows(currentMonthStr());
  const dot = $('budget-dot');
  const hasOver = rows.some((r) => r.level === 'over');
  const hasWarn = rows.some((r) => r.level === 'warn');
  dot.hidden = !hasOver && !hasWarn;
  dot.classList.toggle('warn', !hasOver && hasWarn);
}

function editBudget(category) {
  const current = (data.budgets || {})[category.id];
  const spent = spentByCategory(viewMonth).get(category.id) || 0;
  const [, m] = viewMonth.split('-').map(Number);
  openEditor({
    title: `${category.icon} ${category.name} 的每月预算`,
    withNameIcon: false,
    extraHtml: `
      <label class="amount-field">
        <span class="currency">$</span>
        <input id="e-budget" type="text" inputmode="decimal" placeholder="0.00" autocomplete="off"
          value="${current ? (current / 100).toFixed(2) : ''}" aria-label="每月预算金额">
      </label>
      <p class="field-hint">${m}月已经花了 ${formatMoney(spent)}。<br>每个月都按这个金额计算，每月 1 号重新开始。</p>`,
    deleteLabel: '取消预算',
    onSave() {
      const amount = parseAmount($('e-budget').value);
      if (amount === null) return '请输入正确的金额，比如 500';
      data.budgets = data.budgets || {};
      data.budgets[category.id] = amount;
      showToast('预算已设置 ✓');
      return '';
    },
    onDelete: current ? () => {
      delete data.budgets[category.id];
      showToast('已取消这个分类的预算');
      return '';
    } : null,
  });
  setTimeout(() => $('e-budget')?.focus(), 50);
}

/* ---------- 通用编辑弹窗（账户、分类、预算共用） ---------- */

let editor = null; // { onSave, onDelete, icon, withNameIcon }

/**
 * 打开编辑弹窗。
 * withNameIcon 为 true 时显示「名称」和「图标」；extraHtml 是额外的输入框。
 * onSave(values) 返回错误文字表示失败，返回空表示成功
 */
function openEditor({
  title, name = '', icon, withNameIcon = true, namePlaceholder = '比如：外卖',
  extraHtml = '', onSave, onDelete, deleteLabel = '删除', submitLabel = '保存',
}) {
  $('edit-submit').textContent = submitLabel;
  $('edit-submit').disabled = false;
  editor = { onSave, onDelete, icon, withNameIcon };
  $('edit-title').textContent = title;
  $('edit-body').innerHTML = (withNameIcon ? `
    <label class="field">
      <span class="field-label">名称</span>
      <input id="e-name" type="text" class="input" maxlength="12" value="${escapeHtml(name)}" placeholder="${escapeHtml(namePlaceholder)}" autocomplete="off">
    </label>
    <div class="field">
      <span class="field-label">图标</span>
      <div class="icon-grid">${ICON_CHOICES.map((ic) =>
        `<button type="button" class="icon-choice ${ic === icon ? 'active' : ''}" data-icon="${ic}">${ic}</button>`).join('')}
      </div>
    </div>` : '') + extraHtml;
  $('edit-error').textContent = '';
  $('edit-delete').hidden = !onDelete;
  $('edit-delete').textContent = deleteLabel;
  openModal('edit-modal');
  if (withNameIcon && !name) setTimeout(() => $('e-name')?.focus(), 50);
}

function submitEditor(event) {
  event.preventDefault();
  let name = '';
  if (editor.withNameIcon) {
    name = $('e-name').value.trim();
    if (!name) {
      $('edit-error').textContent = '请填写名称';
      return;
    }
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
    namePlaceholder: '比如：储蓄卡',
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
      if (data.budgets) delete data.budgets[category.id];
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

  // 预算页
  $('b-prev-month').addEventListener('click', () => { viewMonth = shiftMonth(viewMonth, -1); renderBudget(); });
  $('b-next-month').addEventListener('click', () => { viewMonth = shiftMonth(viewMonth, 1); renderBudget(); });
  $('b-month-label').addEventListener('click', () => { viewMonth = currentMonthStr(); renderBudget(); });
  for (const id of ['budget-list', 'no-budget-list']) {
    $(id).addEventListener('click', (e) => {
      const row = e.target.closest('[data-budget-cat]');
      if (row) editBudget(findCategory(row.dataset.budgetCat));
    });
  }
  $('budget-alert').addEventListener('click', () => showPage('budget'));

  // 图表页
  $('c-prev-month').addEventListener('click', () => { viewMonth = shiftMonth(viewMonth, -1); renderCharts(); });
  $('c-next-month').addEventListener('click', () => { viewMonth = shiftMonth(viewMonth, 1); renderCharts(); });
  $('c-month-label').addEventListener('click', () => { viewMonth = currentMonthStr(); renderCharts(); });
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (currentPage === 'charts') renderTrend(); }, 150);
  });

  // 快捷记账、导入银行账单
  $('quick-chips').addEventListener('click', (e) => {
    if (e.target.closest('#quick-manage')) { openQuickManage(); return; }
    const chip = e.target.closest('[data-quick]');
    const q = chip && (data.quickItems || []).find((x) => x.id === chip.dataset.quick);
    if (q) quickAdd(q);
  });
  $('f-save-quick').addEventListener('click', () => {
    form.saveQuick = !form.saveQuick;
    renderFormChoices();
  });
  $('bank-import-btn').addEventListener('click', () => $('bank-file').click());
  $('bank-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // 清空，这样同一个文件可以再选一次
    if (file) openBankImport(file);
  });

  // 理财助手
  $('auto-budget-btn').addEventListener('click', openAutoBudget);
  $('savings-advice').addEventListener('click', (e) => {
    if (e.target.closest('#create-emergency, #update-emergency')) createOrUpdateEmergencyGoal();
  });
  $('daily-tip').addEventListener('click', (e) => {
    if (!e.target.closest('#tip-close')) return;
    data.settings = { ...(data.settings || {}), tipHiddenDate: todayStr() };
    saveData();
    renderDailyTip();
  });

  // 存钱目标页
  $('add-goal-btn').addEventListener('click', () => editGoal(null));
  $('goal-list').addEventListener('click', (e) => {
    const card = e.target.closest('[data-goal]');
    if (!card) return;
    const goal = data.goals.find((g) => g.id === card.dataset.goal);
    if (!goal) return;
    const dep = e.target.closest('[data-goal-deposit]');
    const del = e.target.closest('[data-deposit-del]');
    if (e.target.closest('[data-goal-edit]')) editGoal(goal);
    else if (dep) editDeposit(goal, dep.dataset.goalDeposit);
    else if (del) deleteDeposit(goal, del.dataset.depositDel);
  });

  // 账户页
  $('transfer-btn').addEventListener('click', () => openRecordForm(null, 'transfer'));
  $('add-account-btn').addEventListener('click', () => editAccount(null));
  $('account-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-account]');
    if (row) editAccount(findAccount(row.dataset.account));
  });

  // 设置页
  $('backup-reminder').addEventListener('click', () => showPage('settings'));
  $('export-btn').addEventListener('click', exportBackup);
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // 清空，这样同一个文件可以再选一次
    if (file) importBackupFile(file);
  });
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

// 放在网站上时，开启离线功能（双击本地文件打开时不需要）
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 不影响正常使用 */ });
}
if (!storageOk) showToast('⚠️ 浏览器禁止了本地存储，记录可能无法保存');
