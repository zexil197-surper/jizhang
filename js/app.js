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
    transactions: [],
  };
}

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

/** 把用户输入的金额文字变成「分」；不合法返回 null */
function parseAmount(text) {
  const cleaned = String(text).replace(/[,\s$]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
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

const $ = (id) => document.getElementById(id);

let toastTimer = null;
function showToast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- 程序状态 ---------- */

let data = loadData();
let viewMonth = currentMonthStr();

// 正在填写的表单
const form = {
  editingId: null,
  type: 'expense',
  categoryId: null,
  accountId: null,
};

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
  const cat = findCategory(t.categoryId) || { name: '未分类', icon: '❓' };
  const acc = findAccount(t.accountId);
  const subParts = [];
  if (acc) subParts.push(acc.name);
  if (t.note) subParts.push(t.note);
  const sign = t.type === 'income' ? '+' : '-';
  return `<button class="record" data-id="${t.id}">
      <span class="record-icon">${cat.icon}</span>
      <span class="record-main">
        <div class="record-cat">${escapeHtml(cat.name)}</div>
        <div class="record-sub">${escapeHtml(subParts.join(' · '))}</div>
      </span>
      <span class="record-amount ${t.type}">${sign}${formatMoney(t.amount)}</span>
    </button>`;
}

/* ---------- 记一笔 / 编辑 弹窗 ---------- */

function openRecordForm(tx) {
  form.editingId = tx ? tx.id : null;
  form.type = tx ? tx.type : 'expense';
  form.categoryId = tx ? tx.categoryId : null;
  form.accountId = tx ? tx.accountId : (data.lastAccountId || data.accounts[0]?.id);

  $('form-title').textContent = tx ? '修改记录' : '记一笔';
  $('f-amount').value = tx ? (tx.amount / 100).toFixed(2) : '';
  $('f-date').value = tx ? tx.date : defaultDateForForm();
  $('f-note').value = tx ? tx.note || '' : '';
  $('delete-btn').hidden = !tx;
  $('form-error').textContent = '';

  renderFormChoices();
  $('record-modal').hidden = false;
  document.body.style.overflow = 'hidden';
  // 新记录时自动聚焦金额（手机上会弹出数字键盘）
  if (!tx) setTimeout(() => $('f-amount').focus(), 50);
}

/** 如果正在看别的月份，新记录默认日期放在那个月；否则用今天 */
function defaultDateForForm() {
  if (viewMonth === currentMonthStr()) return todayStr();
  return `${viewMonth}-01`;
}

function closeRecordForm() {
  $('record-modal').hidden = true;
  document.body.style.overflow = '';
}

function renderFormChoices() {
  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === form.type);
  });

  const cats = data.categories.filter((c) => c.type === form.type);
  $('f-categories').innerHTML = cats.map((c) => `
    <button type="button" class="chip ${c.id === form.categoryId ? 'active' : ''}" data-cat="${c.id}">
      <span class="chip-icon">${c.icon}</span><span>${escapeHtml(c.name)}</span>
    </button>`).join('');

  $('f-accounts').innerHTML = data.accounts.map((a) => `
    <button type="button" class="chip ${a.id === form.accountId ? 'active' : ''}" data-acc="${a.id}">
      <span>${a.icon}</span><span>${escapeHtml(a.name)}</span>
    </button>`).join('');
}

function submitRecordForm(event) {
  event.preventDefault();
  const amount = parseAmount($('f-amount').value);
  const date = $('f-date').value;
  const note = $('f-note').value.trim();

  let error = '';
  if (amount === null) error = '请输入正确的金额，比如 12.50';
  else if (!form.categoryId) error = '请选择一个分类';
  else if (!form.accountId) error = '请选择一个账户';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) error = '请选择日期';
  if (error) {
    $('form-error').textContent = error;
    return;
  }

  if (form.editingId) {
    const tx = data.transactions.find((t) => t.id === form.editingId);
    Object.assign(tx, { type: form.type, amount, categoryId: form.categoryId, accountId: form.accountId, date, note });
  } else {
    data.transactions.push({
      id: newId('tx'),
      type: form.type,
      amount,
      categoryId: form.categoryId,
      accountId: form.accountId,
      date,
      note,
      createdAt: Date.now(),
    });
  }
  data.lastAccountId = form.accountId;

  if (saveData()) showToast(form.editingId ? '已修改 ✓' : '已记一笔 ✓');
  viewMonth = date.slice(0, 7); // 跳到这条记录所在的月份
  closeRecordForm();
  renderRecords();
}

function deleteCurrentRecord() {
  if (!form.editingId) return;
  if (!confirm('确定删除这条记录吗？删除后无法恢复。')) return;
  data.transactions = data.transactions.filter((t) => t.id !== form.editingId);
  if (saveData()) showToast('已删除');
  closeRecordForm();
  renderRecords();
}

/* ---------- 绑定按钮 ---------- */

function bindEvents() {
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

  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (form.type === btn.dataset.type) return;
      form.type = btn.dataset.type;
      form.categoryId = null; // 收入和支出的分类不一样，切换后要重新选
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

  $('record-form').addEventListener('submit', submitRecordForm);
  $('delete-btn').addEventListener('click', deleteCurrentRecord);
  $('close-modal').addEventListener('click', closeRecordForm);
  $('record-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeRecordForm(); // 点弹窗外面的灰色区域关闭
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('record-modal').hidden) closeRecordForm();
  });
}

/* ---------- 启动 ---------- */

bindEvents();
renderRecords();
if (!storageOk) showToast('⚠️ 浏览器禁止了本地存储，记录可能无法保存');
