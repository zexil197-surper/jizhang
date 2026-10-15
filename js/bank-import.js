'use strict';

/* =========================================================
   导入银行账单（CSV 文件）
   - 优先适配 CommBank NetBank 导出的格式：没有标题行，每行是
     日期, 金额(带 +/-), 描述, 余额
   - 也能识别带标题行的格式（ANZ / Westpac / NAB 等常见格式）
   - 文件只在本机读取，不会上传到任何地方
   ========================================================= */

/* ---------- 商家关键词 → 分类（按顺序匹配，整词匹配） ---------- */

const MERCHANT_KEYWORDS = [
  ['cat-food', ['uber eats', 'ubereats', 'doordash', 'menulog', 'deliveroo', 'woolworths', 'woolies', 'coles',
    'aldi', 'iga', 'harris farm', 'foodworks', 'costco', 'mcdonald', 'mcdonalds', 'kfc', 'hungry jacks',
    'subway', 'domino', 'dominos', 'guzman', 'grill d', 'nando', 'nandos', 'oporto', 'red rooster',
    'starbucks', 'gloria jeans', 'cafe', 'coffee', 'bakery', 'bakehouse', 'sushi', 'restaurant', 'pizza',
    'noodle', 'noodles', 'dumpling', 'dumplings', 'kitchen', 'bistro', 'eatery', 'thai', 'ramen', 'bbq',
    'burger', 'burgers', 'chicken', 'tea', 'bubble tea']],
  ['cat-transport', ['uber trip', 'uber', 'didi', 'ola', '13cabs', 'taxi', 'cabcharge', 'opal', 'myki',
    'translink', 'go card', 'transperth', 'metrocard', 'shell', 'caltex', 'ampol', 'bp', 'united petroleum',
    'eg fuel', 'linkt', 'citylink', 'eastlink', 'e toll', 'etoll', 'parking', 'carpark', 'secure parking',
    'wilson parking']],
  ['cat-housing', ['rent', 'real estate', 'realestate', 'agl', 'origin energy', 'energyaustralia',
    'energy australia', 'red energy', 'alinta', 'simply energy', 'lumo', 'powershop', 'sydney water',
    'yarra valley water', 'south east water', 'sa water', 'water corporation', 'council', 'strata',
    'telstra', 'optus', 'vodafone', 'tpg', 'aussie broadband', 'iinet', 'belong', 'amaysim', 'boost mobile']],
  ['cat-fun', ['netflix', 'spotify', 'disney', 'disney plus', 'stan', 'binge', 'kayo', 'youtube', 'apple music',
    'steam', 'playstation', 'xbox', 'nintendo', 'hoyts', 'event cinemas', 'village cinemas', 'reading cinemas',
    'ticketek', 'ticketmaster', 'anytime fitness', 'fitness', 'gym', 'goodlife', 'f45', 'timezone', 'bowling']],
  ['cat-medical', ['chemist', 'chemist warehouse', 'pharmacy', 'priceline', 'terrywhite', 'amcal', 'medical',
    'medical centre', 'doctor', 'dental', 'dentist', 'physio', 'physiotherapy', 'hospital', 'pathology',
    'bupa', 'medibank', 'hcf', 'nib', 'ahm', 'optometrist', 'specsavers']],
  ['cat-shopping', ['kmart', 'target', 'big w', 'bunnings', 'jb hi fi', 'officeworks', 'harvey norman',
    'the good guys', 'myer', 'david jones', 'uniqlo', 'zara', 'cotton on', 'rebel', 'amazon', 'ebay',
    'apple com', 'ikea', 'temu', 'shein', 'daiso', 'dan murphy', 'dan murphys', 'bws', 'liquorland']],
];

const INCOME_KEYWORDS = [
  ['cat-salary', ['salary', 'payroll', 'pay', 'wage', 'wages']],
  ['cat-bonus', ['bonus']],
];

// 看起来像自己账户之间转账、或者还信用卡：默认不勾选
const TRANSFER_KEYWORDS = ['transfer to', 'transfer from', 'fast transfer', 'tfr', 'xfer',
  'payment received', 'thank you', 'thankyou'];

/* ---------- 读 CSV ---------- */

/** 把 CSV 文本拆成二维数组（支持引号里的逗号、换行） */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

const MONTHS_EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** 银行日期 → YYYY-MM-DD。澳洲银行是「日/月/年」 */
function parseBankDate(s) {
  if (!s) return null;
  s = s.trim();
  let y;
  let m;
  let d;
  let match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (match) [, d, m, y] = match.map(Number);
  else if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [, y, m, d] = match.map(Number);
  else if ((match = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{2}|\d{4})$/))) {
    d = Number(match[1]);
    m = MONTHS_EN[match[2].toLowerCase()];
    y = Number(match[3]);
  } else return null;
  if (y < 100) y += 2000;
  if (!m || m > 12 || !d || d > 31) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 银行金额 → 分（带正负）。支持 "-12.50"、"+1,234.56"、"$12.50"、"(12.50)" */
function parseBankAmount(s) {
  if (s === undefined || s === null) return null;
  let t = String(s).replace(/[$,\s"]/g, '');
  if (!t) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(t)) { sign = -1; t = t.slice(1, -1); }
  if (t.startsWith('-')) { sign = -sign; t = t.slice(1); }
  else if (t.startsWith('+')) t = t.slice(1);
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return sign * Math.round(parseFloat(t) * 100);
}

/** 找出每一列分别是什么；看不懂返回 null */
function detectColumns(rows) {
  const first = rows[0] || [];
  const findCol = (re) => first.findIndex((c) => re.test(c));
  const looksLikeHeader = first.some((c) => /date/i.test(c)) && !parseBankDate(first[0]);
  if (looksLikeHeader) {
    const date = findCol(/^(transaction )?date$/i) >= 0 ? findCol(/^(transaction )?date$/i) : findCol(/date/i);
    const amount = findCol(/^amount/i);
    const debit = findCol(/debit/i);
    const credit = findCol(/credit/i);
    let desc = findCol(/description|narrative|transaction details|details|memo/i);
    if (desc < 0) desc = findCol(/merchant|payee/i);
    if (date < 0 || desc < 0 || (amount < 0 && debit < 0 && credit < 0)) return null;
    return { header: true, date, amount, debit, credit, desc };
  }
  // 没有标题行（CommBank、ANZ）：日期, 金额, 描述, [余额]
  if (parseBankDate(first[0]) && parseBankAmount(first[1]) !== null && first.length >= 3) {
    return { header: false, date: 0, amount: 1, debit: -1, credit: -1, desc: 2 };
  }
  return null;
}

/* ---------- 整理描述、猜分类 ---------- */

/** 去掉卡号、Value Date 等杂讯；顺便取出 CommBank 的实际消费日期（Value Date） */
function cleanBankDescription(desc) {
  let valueDate = null;
  const vd = desc.match(/value date:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (vd) valueDate = parseBankDate(vd[1]);
  const text = desc
    .replace(/value date:?\s*\S+/ig, ' ')
    .replace(/\bcard\s*x+\d+/ig, ' ')
    .replace(/\bx{2,}\d{2,}\b/ig, ' ')
    .replace(/\s+(aus?|australia)\s*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { text: text || desc.trim(), valueDate };
}

function normalizeText(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** 商家名的「指纹」：去掉数字后的前两个词，用来记住你改过的分类 */
function merchantKey(cleanText) {
  return normalizeText(cleanText).split(' ').filter((w) => w && !/^\d+$/.test(w)).slice(0, 2).join(' ');
}

function matchesKeyword(normText, keyword) {
  return new RegExp(`(^| )${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(normText);
}

function fallbackCategory(type) {
  const preferred = type === 'income' ? 'cat-other-inc' : 'cat-other-exp';
  if (findCategory(preferred)) return preferred;
  const first = data.categories.find((c) => c.type === type);
  return first ? first.id : null;
}

/** 猜分类：先用你以前改过的；再按商家关键词；都没有就归到「其他」 */
function guessCategory(type, cleanText) {
  const learned = (data.merchantRules || {})[merchantKey(cleanText)];
  const learnedCat = learned && findCategory(learned);
  if (learnedCat && learnedCat.type === type) return learned;
  const norm = normalizeText(cleanText);
  for (const [catId, words] of (type === 'income' ? INCOME_KEYWORDS : MERCHANT_KEYWORDS)) {
    if (findCategory(catId) && words.some((w) => matchesKeyword(norm, w))) return catId;
  }
  return fallbackCategory(type);
}

/* ---------- 生成待导入清单 ---------- */

function daysBetween(a, b) {
  return Math.abs((new Date(`${a}T00:00:00`) - new Date(`${b}T00:00:00`)) / 86400000);
}

/**
 * 把 CSV 行变成待导入的交易。status：
 *   new 新交易（默认勾选）/ imported 以前导入过（跳过）/
 *   transfer 像是转账（默认不勾）/ manual 可能已手动记过（默认不勾）
 */
function buildImportItems(rows, cols, accountId) {
  const body = cols.header ? rows.slice(1) : rows;
  const existingKeys = new Set(data.transactions.filter((t) => t.importKey).map((t) => t.importKey));
  const seen = new Map();
  const items = [];
  for (const r of body) {
    let cents;
    if (cols.amount >= 0 && r[cols.amount] !== '') cents = parseBankAmount(r[cols.amount]);
    else {
      const debit = cols.debit >= 0 ? parseBankAmount(r[cols.debit]) || 0 : 0;
      const credit = cols.credit >= 0 ? parseBankAmount(r[cols.credit]) || 0 : 0;
      cents = credit - Math.abs(debit);
    }
    const postDate = parseBankDate(r[cols.date]);
    const rawDesc = r[cols.desc] || '';
    if (!postDate || !cents) continue;

    const { text, valueDate } = cleanBankDescription(rawDesc);
    const date = valueDate && daysBetween(valueDate, postDate) <= 10 ? valueDate : postDate;
    const type = cents < 0 ? 'expense' : 'income';
    const amount = Math.abs(cents);

    // 同一天、同金额、同描述的交易可能真有好几笔（比如买了两次咖啡），用序号区分
    const base = `${accountId}|${postDate}|${cents}|${normalizeText(rawDesc)}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const importKey = `${base}#${n}`;

    let status = 'new';
    if (existingKeys.has(importKey)) status = 'imported';
    else if (TRANSFER_KEYWORDS.some((w) => matchesKeyword(normalizeText(text), w))) status = 'transfer';
    else if (data.transactions.some((t) => !t.importKey && t.type === type && t.amount === amount
      && daysBetween(t.date, date) <= 1)) status = 'manual';

    items.push({ date, type, amount, text, importKey, status, checked: status === 'new', categoryId: guessCategory(type, text) });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

/* ---------- 导入确认窗口 ---------- */

const STATUS_TAGS = {
  transfer: '像是转账/还款，默认不导入',
  manual: '可能已手动记过，默认不导入',
};

function openBankImport(file) {
  const reader = new FileReader();
  reader.onerror = () => alert('读取文件失败，请重试。');
  reader.onload = () => {
    const rows = parseCSV(String(reader.result));
    const cols = rows.length ? detectColumns(rows) : null;
    if (!cols) {
      alert('看不懂这个文件的格式。\n请确认是从网银导出的 CSV 文件（不是 PDF 或 Excel）。\n现在的数据没有任何改动。');
      return;
    }
    showImportReview(rows, cols, file.name);
  };
  reader.readAsText(file);
}

function showImportReview(rows, cols, fileName) {
  const bank = data.accounts.find((a) => a.id === 'acc-bank');
  let accountId = (bank || data.accounts[0]).id;
  let items = buildImportItems(rows, cols, accountId);
  if (!items.length) {
    alert('文件里没有找到交易记录。\n现在的数据没有任何改动。');
    return;
  }

  const catOptions = (type, selected) => data.categories.filter((c) => c.type === type)
    .map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.icon} ${escapeHtml(c.name)}</option>`).join('');

  const render = () => {
    $('imp-accounts').innerHTML = data.accounts.map((a) => `
      <button type="button" class="chip ${a.id === accountId ? 'active' : ''}" data-imp-acc="${a.id}">
        <span>${a.icon}</span><span>${escapeHtml(a.name)}</span>
      </button>`).join('');

    const visible = items.filter((it) => it.status !== 'imported');
    const importedBefore = items.length - visible.length;
    $('imp-list').innerHTML = visible.length ? visible.map((it) => {
      const i = items.indexOf(it);
      return `<div class="imp-row ${it.checked ? '' : 'off'}">
          <label class="imp-check"><input type="checkbox" data-imp-i="${i}" ${it.checked ? 'checked' : ''} aria-label="导入这一笔"></label>
          <div class="imp-main">
            <div class="imp-top">
              <span class="imp-desc">${escapeHtml(it.text)}</span>
              <span class="imp-amt ${it.type}">${it.type === 'income' ? '+' : '-'}${formatMoney(it.amount)}</span>
            </div>
            <div class="imp-date">${formatDateCn(it.date)}${STATUS_TAGS[it.status] ? ` · <span class="imp-tag">${STATUS_TAGS[it.status]}</span>` : ''}</div>
            <select class="imp-cat" data-imp-cat="${i}" aria-label="分类">${catOptions(it.type, it.categoryId)}</select>
          </div>
        </div>`;
    }).join('') : '<p class="chart-empty">这个文件里的交易都已经导入过了 👍</p>';

    $('imp-summary').innerHTML = `共 ${items.length} 笔交易：新的 <b>${visible.length}</b> 笔`
      + (importedBefore ? `，以前导入过的 ${importedBefore} 笔会自动跳过` : '') + '。';
    updateCount();
  };

  const updateCount = () => {
    const n = items.filter((it) => it.checked && it.status !== 'imported').length;
    $('edit-submit').textContent = n ? `导入选中的 ${n} 笔` : '没有选中';
    $('edit-submit').disabled = n === 0;
  };

  openEditor({
    title: '🏦 导入银行账单',
    withNameIcon: false,
    submitLabel: '导入',
    extraHtml: `
      <p class="field-hint" style="margin:0 2px 10px">文件：${escapeHtml(fileName)}</p>
      <div class="field">
        <span class="field-label">这是哪个账户的账单？</span>
        <div class="chip-row" id="imp-accounts"></div>
      </div>
      <p class="imp-summary" id="imp-summary"></p>
      <div class="imp-tools">
        <button type="button" class="btn btn-plain imp-tool" id="imp-all">全选</button>
        <button type="button" class="btn btn-plain imp-tool" id="imp-none">全不选</button>
      </div>
      <div class="imp-list" id="imp-list"></div>
      <p class="field-hint">分类是自动猜的，猜错了可以直接改；改过的商家，下次会自动用你选的分类。</p>`,
    onSave() {
      const chosen = items.filter((it) => it.checked && it.status !== 'imported');
      if (!chosen.length) return '没有选中要导入的交易';
      data.merchantRules = data.merchantRules || {};
      const now = Date.now();
      chosen.forEach((it, k) => {
        data.transactions.push({
          id: newId('tx'),
          type: it.type,
          amount: it.amount,
          categoryId: it.categoryId,
          accountId,
          toAccountId: null,
          date: it.date,
          note: it.text.slice(0, 60),
          importKey: it.importKey,
          createdAt: now + k,
        });
        const key = merchantKey(it.text);
        if (key) data.merchantRules[key] = it.categoryId;
      });
      showToast(`已导入 ${chosen.length} 笔 ✓`);
      return '';
    },
  });
  $('edit-submit').disabled = false;

  $('imp-accounts').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-imp-acc]');
    if (!chip || chip.dataset.impAcc === accountId) return;
    accountId = chip.dataset.impAcc;
    const oldChoices = new Map(items.map((it) => [it.importKey.split('|').slice(1).join('|'), it]));
    items = buildImportItems(rows, cols, accountId);
    // 换账户后保留你已经改过的分类和勾选
    for (const it of items) {
      const old = oldChoices.get(it.importKey.split('|').slice(1).join('|'));
      if (old && it.status !== 'imported') { it.categoryId = old.categoryId; it.checked = old.checked; }
    }
    render();
  });
  $('imp-list').addEventListener('change', (e) => {
    const box = e.target.closest('[data-imp-i]');
    const sel = e.target.closest('[data-imp-cat]');
    if (box) {
      items[Number(box.dataset.impI)].checked = box.checked;
      box.closest('.imp-row').classList.toggle('off', !box.checked);
      updateCount();
    } else if (sel) {
      items[Number(sel.dataset.impCat)].categoryId = sel.value;
    }
  });
  const setAll = (checked) => {
    items.forEach((it) => { if (it.status !== 'imported') it.checked = checked; });
    render();
  };
  $('imp-all').addEventListener('click', () => setAll(true));
  $('imp-none').addEventListener('click', () => setAll(false));
  render();
}
