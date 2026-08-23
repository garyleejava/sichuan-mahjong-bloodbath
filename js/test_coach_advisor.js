const MJ = require('./engine.js');
const MJAI = require('./ai.js');
const G = require('./game.js');

console.log('====================================================');
console.log('🧪 开始 雀神 AI 教练深度教学与可解释性测试套件');
console.log('====================================================');

let passCount = 0;
let failCount = 0;

function assert(condition, desc) {
  if (condition) {
    console.log(`✅ PASS: ${desc}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${desc}`);
    failCount++;
  }
}

// 场景 1: 定缺未打完时，强制推荐打缺门牌并给出明确规则解释
{
  const game = G.createGame({ aiLevel: 'normal', round: 1, dealer: 0 });
  game.players[0].lack = 'm'; // 定缺万
  game.players[0].hand = ['m1', 'm9', 'p2', 'p3', 'p4', 's5', 's6', 's7', 'p6', 'p7', 'p8', 's2', 's2', 's3'];
  game.turn = 0;
  game.phase = 'turn_act';

  const advice = MJAI.analyzeHandAdvice(game, 0);
  assert(advice.bestDiscard === 'm1' || advice.bestDiscard === 'm9', `定缺花色推荐打出万字牌 (实际推荐: ${advice.bestDiscard})`);
  assert(advice.bestAdvice.tag.includes('强制打缺') || advice.bestAdvice.tag.includes('缺门'), '打缺标签明确');
  assert(advice.bestAdvice.reason.includes('定缺') || advice.bestAdvice.reason.includes('缺门'), '理由包含定缺与清门解释');
  assert(advice.bestAdvice.reason.includes('查花猪') || advice.macroStrategy.includes('查花猪'), '包含查花猪满番风险提示');
}

// 场景 2: 听牌决策推荐 (打出某张立即听牌并列出全部有效胡牌张)
{
  const game = G.createGame({ aiLevel: 'normal', round: 1, dealer: 0 });
  game.players[0].lack = 'm';
  // 筒子 234 678, 条子 456 789 2 + 筒9 (打出筒9即单钓条2)
  game.players[0].hand = ['p2', 'p3', 'p4', 'p6', 'p7', 'p8', 's4', 's5', 's6', 's7', 's8', 's9', 's2', 'p9'];
  game.turn = 0;
  game.phase = 'turn_act';

  const advice = MJAI.analyzeHandAdvice(game, 0);
  assert(advice.bestDiscard === 'p9', `单钓听牌推荐打出孤张筒9 (实际推荐: ${advice.bestDiscard})`);
  assert(advice.bestAdvice.afterShantenText === '听牌' || advice.bestAdvice.tag.includes('听牌'), '进入听牌状态');
  assert(advice.bestAdvice.reason.includes('听牌'), '可解释性理由说明立即进入听牌');
  assert(advice.ranking.length >= 2, '候选打法对比排行榜包含多张候选牌');
}

// 场景 3: 真实高纯度清一色大番走向推荐 (门清且条子达到9张，杂门牌优先舍弃)
{
  const game = G.createGame({ aiLevel: 'hard', round: 1, dealer: 0 });
  game.players[0].lack = 'm';
  // 条子 10张: s1,s2,s3, s4,s5,s6, s7,s8,s9, s9, 筒子 4张: p1, p9, p5, p5 (共14张)
  game.players[0].hand = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's9', 'p1', 'p9', 'p5', 'p5'];
  game.turn = 0;
  game.phase = 'turn_act';

  const advice = MJAI.analyzeHandAdvice(game, 0);
  assert(advice.bestDiscard.startsWith('p'), `高纯度清一色规划推荐打出杂门筒子 (实际推荐: ${advice.bestDiscard})`);
  assert(advice.macroStrategy.includes('清一色') || advice.bestAdvice.tag.includes('清一色'), '识别出清一色大番潜力');
  assert(advice.bestAdvice.reason.includes('清一色') || advice.bestAdvice.reason.includes('4番/8分'), '解释清一色翻倍收益');
}

// 场景 4: 暗七对保护机制 (门清且持有4-5个对子，推荐打掉单张保护对子)
{
  const game = G.createGame({ aiLevel: 'hard', round: 1, dealer: 0 });
  game.players[0].lack = 'm';
  // 5个对子: p1p1, p3p3, p7p7, s2s2, s5s5, 单张: s8, p9, p4, s9 (14张)
  game.players[0].hand = ['p1', 'p1', 'p3', 'p3', 'p7', 'p7', 's2', 's2', 's5', 's5', 's8', 'p9', 'p4', 's9'];
  game.turn = 0;
  game.phase = 'turn_act';

  const advice = MJAI.analyzeHandAdvice(game, 0);
  const isDiscardSingle = ['s8', 'p9', 'p4', 's9'].includes(advice.bestDiscard);
  assert(isDiscardSingle, `暗七对阶段推荐打出单张 (实际推荐: ${advice.bestDiscard})`);
  assert(advice.macroStrategy.includes('暗七对') || advice.bestAdvice.tag.includes('暗七对'), '识别出暗七对保护意图');
}

// 场景 5 [专项修复测试]: 副露牌与手牌杂牌过多时，绝不误判清一色
{
  const game = G.createGame({ aiLevel: 'hard', round: 1, dealer: 0 });
  game.players[0].lack = 'p'; // 缺筒
  // 手牌: 6张万字 (m1,m2,m3, m4,m5,m6) + 4张条子 (s2,s3, s7,s8)
  // 副露: 1 组万字刻子 (m8,m8,m8)
  game.players[0].hand = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 's2', 's3', 's7', 's8'];
  game.players[0].melds = [{ type: 'pung', tiles: ['m8', 'm8', 'm8'] }];
  game.turn = 0;
  game.phase = 'turn_act';

  const advice = MJAI.analyzeHandAdvice(game, 0);
  assert(advice.qingSuit === null || advice.qingSuit === undefined, '手牌杂牌较多(4张条子)时正确不判定为清一色');
  assert(!advice.bestAdvice.tag.includes('清一色大番规划'), `不给出误导性的清一色推荐 (实际标签: ${advice.bestAdvice.tag})`);
}

// 场景 6 [专项修复测试]: 副露存在杂门花色时，绝对禁止判定为清一色
{
  const game = G.createGame({ aiLevel: 'hard', round: 1, dealer: 0 });
  game.players[0].lack = 'p'; // 缺筒
  // 手牌: 9张万字 + 1张条子
  // 副露: 1 组条子刻子 (s5,s5,s5) -> 既然碰了条子，就绝对无法做万字清一色！
  game.players[0].hand = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 's1'];
  game.players[0].melds = [{ type: 'pung', tiles: ['s5', 's5', 's5'] }];
  game.turn = 0;
  game.phase = 'turn_act';

  const advice = MJAI.analyzeHandAdvice(game, 0);
  assert(advice.qingSuit === null || advice.qingSuit === undefined, '副露含有杂门花色时严格禁止判定为清一色');
}

console.log(`\n====================================================`);
console.log(`🏆 雀神 AI 教练测试完成: ${passCount} 通过, ${failCount} 失败`);
console.log(`====================================================`);

if (failCount > 0) process.exit(1);
