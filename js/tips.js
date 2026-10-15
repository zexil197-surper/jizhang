'use strict';

/* =========================================================
   每日理财小知识
   通用的理财常识，适合在澳洲生活的人。不是针对个人的投资建议。
   每天按日期轮换一条。链接都是澳洲政府网站（英文），2026 年 10 月核对过都能打开。
   想加新的知识，照格式往下加一条就行。
   ========================================================= */

const MS = 'https://moneysmart.gov.au';

const DAILY_TIPS = [
  {
    title: '先存钱，再花钱',
    text: '发工资当天，先把要存的钱转进储蓄账户，剩下的才是这个月能花的。比"月底剩多少存多少"容易坚持得多。',
    link: `${MS}/budgeting/how-to-do-a-budget`,
  },
  {
    title: '50/30/20 方法',
    text: '一个常见的预算思路：收入的 50% 用于必需开销（房租、交通、买菜），30% 用于想要的东西（外出吃饭、娱乐、购物），20% 存起来。不必死守比例，当作参考就好。',
    link: `${MS}/budgeting/budget-planner`,
  },
  {
    title: '应急金：3 个月生活费',
    text: '应急金是给失业、生病、车坏了这类意外准备的钱。一个好的目标是存够 3 个月的生活开销，并且单独放、不随便动用。',
    link: `${MS}/saving/save-for-an-emergency-fund`,
  },
  {
    title: '信用卡尽量每月全额还',
    text: '很多信用卡有免息期：在到期日前还清整张账单的欠款，就不用付利息。只还"最低还款额"的话，剩下的欠款会按很高的利率计息。',
    link: `${MS}/credit-cards/pay-off-your-credit-card`,
  },
  {
    title: '复利：时间是你的朋友',
    text: '复利就是"利息也能生利息"。举例：每月存 $100，年利率 5%，10 年后大约有 $15,500，其中本金只有 $12,000。越早开始，效果越明显。',
    link: `${MS}/saving/compound-interest`,
  },
  {
    title: '先看清楚储蓄账户的奖励利率',
    text: '很多高息储蓄账户的"奖励利率"有条件，比如每月要存入一定金额、当月不能取钱。达不到条件就只有很低的基础利率。',
    link: `${MS}/banking/savings-accounts`,
  },
  {
    title: '24 小时冷静期',
    text: '想买不是必需的东西时，先放进购物车，等 24 小时再决定。很多冲动消费第二天就不想要了。',
    link: `${MS}/budgeting/avoiding-sales-pressure`,
  },
  {
    title: '检查一遍你的订阅',
    text: '视频、音乐、App、健身房……每个月几块到几十块，加起来可能不少。每隔几个月翻一下银行账单，取消不用的订阅。',
    link: `${MS}/budgeting/track-your-spending`,
  },
  {
    title: '买菜看"单价"',
    text: '澳洲大型超市的价签上会标单价（比如每 100 克多少钱）。比较单价，才知道大包装是不是真的更便宜。买菜前列清单，也能少买不需要的东西。',
    link: `${MS}/budgeting/ways-to-save-on-food-and-fuel`,
  },
  {
    title: '比较一下电费和燃气套餐',
    text: '政府有免费的比较网站：大多数州用 Energy Made Easy，维州用 Victorian Energy Compare。换一个更合适的套餐，一年可能省下不少。',
    link: 'https://www.energymadeeasy.gov.au/',
  },
  {
    title: '先还利率最高的债',
    text: '如果有好几笔欠款，除了每笔都按时还最低额，多出来的钱优先还利率最高的那笔（通常是信用卡），这样总共付的利息最少。',
    link: `${MS}/managing-debt/get-debt-under-control`,
  },
  {
    title: '"先买后付"也是借钱',
    text: 'Afterpay 这类"先买后付"看起来不收利息，但逾期会有罚款，而且容易让人不知不觉花超。用之前想清楚到期时手里有没有钱。',
    link: `${MS}/other-ways-to-borrow/buy-now-pay-later-services`,
  },
  {
    title: '了解你的 Super（养老金）',
    text: 'Super 是澳洲的退休养老金。如果你是雇员，雇主一般要按工资的一定比例（从 2025 年 7 月起是 12%）帮你存进 Super。记得看看自己的账户和费用。',
    link: `${MS}/how-super-works`,
  },
  {
    title: '找回"丢失"的 Super',
    text: '换过几份工作的人，可能有好几个 Super 账户，或者有被遗忘的钱。可以登录 myGov 关联澳洲税务局（ATO）查看和合并。',
    link: `${MS}/how-super-works/find-lost-super`,
  },
  {
    title: '费用会悄悄吃掉收益',
    text: '投资产品和 Super 的管理费看起来只有 1% 左右，但长期复利下来差别很大。比较产品时，费用和收益一样重要。',
    link: `${MS}/how-to-invest/choose-your-investments`,
  },
  {
    title: '不要把鸡蛋放在一个篮子里',
    text: '"分散投资"是降低风险的常见方法：不把所有钱放在一只股票、一个行业或一种资产上。分散不能保证不亏，但能减少单一风险。',
    link: `${MS}/how-to-invest/investment-diversification`,
  },
  {
    title: '短期要用的钱，不适合拿去投资',
    text: '股票等投资的价格会上下波动。几年内就要用的钱（比如应急金、买房首付），一般更适合放在储蓄账户或定期存款里。',
    link: `${MS}/how-to-invest/develop-an-investing-plan`,
  },
  {
    title: '投资前先做个计划',
    text: '先想清楚：投资是为了什么？多久以后要用？能接受亏多少？想好这些，再去了解具体产品，就不容易被别人的推荐带着走。',
    link: `${MS}/how-to-invest/develop-an-investing-plan`,
  },
  {
    title: '警惕"保证高回报、没风险"',
    text: '承诺"稳赚不赔""高回报零风险"的投资，几乎一定是骗局。陌生人主动联系你、催你马上决定，也是常见的危险信号。',
    link: `${MS}/check-and-report-scams`,
  },
  {
    title: '找理财顾问前，先查执照',
    text: '在澳洲，提供个人理财建议需要执照。可以在 ASIC 的"理财顾问名单"（Financial Advisers Register）里查对方是否持牌。',
    link: `${MS}/financial-advice/financial-advisers-register`,
  },
  {
    title: '理财顾问怎么选',
    text: '见顾问前，问清楚收费方式、能给哪些方面的建议、会不会收产品佣金。好的顾问会先了解你的情况和目标。',
    link: `${MS}/financial-advice/choosing-a-financial-adviser`,
  },
  {
    title: '税表：记得保留收据',
    text: '和工作相关的支出（比如工作用的工具、部分培训）可能可以抵税。平时保留收据，报税时会轻松很多。自己报税的截止日一般是 10 月 31 日。',
    link: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim',
  },
  {
    title: '钱不够用时，有免费帮助',
    text: '如果还不上账单或欠款，可以打全国债务求助热线 National Debt Helpline：1800 007 007，有免费的理财咨询师（financial counsellor）帮你。',
    link: `${MS}/managing-debt/financial-counselling`,
  },
  {
    title: '看看自己的净资产',
    text: '净资产 = 你拥有的（存款、Super 等）减去你欠的（贷款、信用卡）。每隔几个月算一次，比只看工资更能看出自己的财务是否在进步。',
    link: `${MS}/managing-debt/net-worth-calculator`,
  },
  {
    title: '小钱也值得存',
    text: '每周存 $20，一年就超过 $1,000。别因为金额小就不开始，重要的是养成习惯。',
    link: `${MS}/saving`,
  },
  {
    title: '收入不固定也能做预算',
    text: '如果是临时工或收入不稳定，可以按"收入最少的月份"来做预算，收入多的月份把多出来的钱存起来，留给收入少的月份用。',
    link: `${MS}/budgeting/managing-on-a-casual-income`,
  },
];
