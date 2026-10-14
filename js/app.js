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
/** 底部小提示。level 为 'warn'（黄）或 'over'（红）时更醒目、显示更久 */
function showToast(message, level = '') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast show ${level}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), level ? 4500 : 2200);
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

const PAGE_TITLES = { records: '记账本', budget: '每月预算', accounts: '我的账户', settings: '设置' };

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
  const month = date.slice(0, 7);
  const levelBefore = isTransfer ? null : budgetInfo(form.categoryId, month);
  if (form.editingId) {
    const tx = data.transactions.find((t) => t.id === form.editingId);
    Object.assign(tx, fields);
  } else {
    data.transactions.push({ id: newId('tx'), ...fields, createdAt: Date.now() });
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

function exportBackup() {
  data.lastBackupAt = Date.now();
  const backup = {
    app: '记账本',
    exportedAt: new Date().toISOString(),
    data,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `记账本备份-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  saveData();
  renderBackupStatus();
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

/** 记账后，如果这个分类刚刚跨过 80% 或超支，弹出醒目提醒 */
function warnIfBudgetCrossed(categoryId, month, before) {
  const after = budgetInfo(categoryId, month);
  if (!after || after.level === 'ok') return;
  if (before && LEVEL_RANK[before.level] >= LEVEL_RANK[after.level]) return;
  const cat = findCategory(categoryId);
  const pct = Math.round((after.spent / after.budget) * 100);
  if (after.level === 'over') {
    showToast(`🚨 「${cat.name}」超支了！\n已花 ${formatMoney(after.spent)}，超出预算 ${formatMoney(after.spent - after.budget)}`, 'over');
  } else {
    showToast(`⚠️ 「${cat.name}」预算已用 ${pct}%\n只剩 ${formatMoney(after.budget - after.spent)} 了`, 'warn');
  }
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
  setTimeout(() => $('e-budget').focus(), 50);
}

/* ---------- 通用编辑弹窗（账户、分类、预算共用） ---------- */

let editor = null; // { onSave, onDelete, icon, withNameIcon }

/**
 * 打开编辑弹窗。
 * withNameIcon 为 true 时显示「名称」和「图标」；extraHtml 是额外的输入框。
 * onSave(values) 返回错误文字表示失败，返回空表示成功
 */
function openEditor({ title, name = '', icon, withNameIcon = true, extraHtml = '', onSave, onDelete, deleteLabel = '删除' }) {
  editor = { onSave, onDelete, icon, withNameIcon };
  $('edit-title').textContent = title;
  $('edit-body').innerHTML = (withNameIcon ? `
    <label class="field">
      <span class="field-label">名称</span>
      <input id="e-name" type="text" class="input" maxlength="12" value="${escapeHtml(name)}" placeholder="比如：外卖" autocomplete="off">
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
  if (withNameIcon && !name) setTimeout(() => $('e-name').focus(), 50);
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
if (!storageOk) showToast('⚠️ 浏览器禁止了本地存储，记录可能无法保存');
