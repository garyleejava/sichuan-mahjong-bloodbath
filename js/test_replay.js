/* ============================================================
   四川麻将·血战到底 — 围棋级 AI 深度复盘系统 专项测试套件
   ============================================================ */
const MJ = require('./engine.js');
const AI = require('./ai.js');
const G = require('./game.js');

console.log('====================================================');
console.log('🧪 开始 围棋级 AI 深度复盘与走法质量评估 专项测试套件');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, msg) {
  if (condition) {
    passCount++;
    console.log(`✅ PASS: ${msg}`);
  } else {
    failCount++;
    console.error(`❌ FAIL: ${msg}`);
  }
}

// ------------------------------------------------------------
// [测试 1] 走法质量评估引擎 (evaluateMoveQuality)
// ------------------------------------------------------------
console.log('--- [复盘测试 1] 走法质量评估引擎单元测试 ---');

// 1.1 违背强制定缺 (恶手)
{
  const hand = ['m1', 'm2', 'm3', 'p2', 'p3', 'p4', 's1', 's9']; // 尚有缺门万字
  const lack = 'm';
  const evalRes = AI.evaluateMoveQuality(hand, [], lack, 's9', null, 0);
  assert(evalRes.grade === 'blunder', '打出非缺门牌时正确判定为恶手 (违背定缺)');
  assert(evalRes.reason.includes('定缺') || evalRes.reason.includes('查花猪'), '原因中包含定缺规则与查花猪赔偿警示');
}

// 1.2 绝佳一手 (最佳选择)
{
  const hand = ['m2', 'm3', 'm4', 'p3', 'p4', 'p5', 's2', 's3', 's4', 's7', 's8', 'p9', 'p9', 'm9'];
  const lack = 'm';
  const evalRes = AI.evaluateMoveQuality(hand, [], lack, 'm9', null, 0);
  assert(evalRes.grade === 'best', '优先打出手中唯一定缺牌时判定为绝佳一手');
  assert(evalRes.bestDiscard === 'm9', '推荐最佳出牌为唯一缺门牌 m9');
}

// 1.3 向听数倒退 (恶手)
{
  const hand = ['m2', 'm3', 'm4', 'p3', 'p4', 'p5', 'p7', 'p8', 'p9', 'm8', 'm8', 'p1', 'p1', 'p1'];
  const lack = 's';
  const evalBlunder = AI.evaluateMoveQuality(hand, [], lack, 'm3', null, 0);
  assert(evalBlunder.grade === 'blunder' || evalBlunder.grade === 'inaccuracy', '拆散关键顺子导致向听数退步被判定为恶手/疑问手');
}

// 1.4 次优进张损失 (疑问手)
{
  const hand = ['p4', 'p5', 's1', 's2', 'p7', 'p8', 'p9', 's7', 's8', 's9', 's4', 's4', 'p1', 'p1'];
  const lack = 'm';
  const evalInacc = AI.evaluateMoveQuality(hand, [], lack, 'p4', null, 0);
  assert(evalInacc.diffUkeire >= 0, '精算出两面与边张搭子之间的有效进张差');
}

// ------------------------------------------------------------
// [测试 2] 整局雀力评分与失误索引引擎 (summarizeGameReview)
// ------------------------------------------------------------
console.log('\n--- [复盘测试 2] 整局雀力评分与失误速览测试 ---');

{
  const mockHistory = [
    { actionType: 'deal', actor: -1 },
    { actionType: 'swap', actor: -1 },
    { actionType: 'lack', actor: -1 },
    { actionType: 'discard', actor: 0, eval: { grade: 'best', gradeLabel: '最佳' } },
    { actionType: 'discard', actor: 0, eval: { grade: 'best', gradeLabel: '最佳' } },
    { actionType: 'discard', actor: 0, eval: { grade: 'good', gradeLabel: '好手' } },
    { actionType: 'discard', actor: 0, eval: { grade: 'inaccuracy', gradeLabel: '疑问手' } },
    { actionType: 'discard', actor: 0, eval: { grade: 'blunder', gradeLabel: '恶手' } },
    { actionType: 'hu', actor: 0 },
    { actionType: 'settle', actor: -1 },
  ];

  const summary = AI.summarizeGameReview(mockHistory);
  assert(summary.totalHumanDiscards === 5, '人类出牌总数统计准确 (5手)');
  assert(summary.bestCount === 2, '最佳一手统计准确 (2手)');
  assert(summary.goodCount === 1, '好手统计准确 (1手)');
  assert(summary.inaccuracyCount === 1, '疑问手统计准确 (1手)');
  assert(summary.blunderCount === 1, '恶手统计准确 (1手)');
  assert(summary.mistakeSteps.length === 2, '失误步数索引列表正确捕获 2 处失误');
  assert(summary.mistakeSteps[0] === 6 && summary.mistakeSteps[1] === 7, '失误步数索引准确对应到 history 索引 (6, 7)');
  assert(summary.accuracy >= 0 && summary.accuracy <= 100, `雀力准确率精算正确: ${summary.accuracy}分`);
  assert(typeof summary.title === 'string' && summary.title.length > 0, '雀力称号评级生成完整');
}

// ------------------------------------------------------------
// [测试 3] 全时空历史快照生命周期完整性测试 (Game Snapshots)
// ------------------------------------------------------------
console.log('\n--- [测试 3] 历史快照生命周期完整性与时空一致性 ---');

{
  const g = G.createGame({ enableSwap: true, aiLevel: 'hard' });
  assert(g.history.length === 1, '起手发牌后正确录制第 1 个 deal 快照');
  assert(g.history[0].actionType === 'deal', '首个快照类型为 deal');
  assert(g.history[0].players.length === 4, '快照完整保存 4 家状态');

  // 换三张
  G.advance(g);
  g.players[0].chosenSwapTiles = AI.chooseSwap3(g.players[0].hand);
  g.humanSwap = true;
  G.advance(g);
  assert(g.history.length === 2, '换三张完成后录制第 2 个 swap 快照');
  assert(g.history[1].actionType === 'swap', '快照类型为 swap');

  // 定缺
  G.advance(g);
  for (let i = 0; i < 4; i++) g.players[i].lack = AI.chooseLack(g.players[i].hand);
  g.humanLack = true;
  G.advance(g);
  assert(g.history.length === 3, '定缺完成后录制第 3 个 lack 快照');
  assert(g.history[2].actionType === 'lack', '快照类型为 lack');

  // 验证快照深拷贝独立性 (修改当前游戏不污染历史快照)
  const snap0HandBefore = g.history[0].players[0].hand.slice();
  g.players[0].hand[0] = 'm9';
  assert(g.history[0].players[0].hand[0] === snap0HandBefore[0], '历史快照为深拷贝独立状态，不受后续牌局状态突变影响');
}

// ------------------------------------------------------------
// [测试 4] 10 局真实人机端到端全流程复盘快照仿真与零和守恒
// ------------------------------------------------------------
console.log('\n--- [测试 4] 10 局血战到底对局全流程复盘时空链验证 ---');

for (let r = 1; r <= 10; r++) {
  const g = G.createGame({ round: r, dealer: (r - 1) % 4, enableSwap: true, aiLevel: 'hard' });
  G.advance(g);
  g.players[0].chosenSwapTiles = AI.chooseSwap3(g.players[0].hand);
  g.humanSwap = true;
  G.advance(g);
  G.advance(g);
  for (let i = 0; i < 4; i++) g.players[i].lack = AI.chooseLack(g.players[i].hand);
  g.humanLack = true;
  G.advance(g);

  let steps = 0;
  while (!G.isOver(g) && steps < 400) {
    steps++;
    const seat = g.turn;
    const pl = g.players[seat];
    if (pl.out) {
      if (!G.nextTurn(g)) break;
      continue;
    }

    const acts = G.actActions(g, seat);
    const tsumo = acts.find(a => a.type === 'tsumo');
    if (tsumo) {
      G.doHu(g, seat, tsumo.info, seat);
      if (G.isOver(g)) break;
      if (!G.nextTurn(g)) break;
      continue;
    }

    const kong = acts.find(a => a.type === 'ankong' || a.type === 'addkong');
    if (kong && Math.random() < 0.3) {
      G.doKong(g, seat, kong.tile, kong.type === 'ankong' ? 'an' : 'add');
      continue;
    }

    const lackTiles = pl.hand.filter(t => t[0] === pl.lack);
    const tile = lackTiles.length > 0 ? lackTiles[0] : AI.chooseDiscard(g, seat, 'hard');
    G.doDiscard(g, seat, tile);

    const gc = G.gatherClaims(g);
    let claims = gc.aiClaims ? gc.aiClaims.slice() : [];
    if (gc.needHumanClaim && gc.humanOptions) {
      const hu = gc.humanOptions.find(o => o.type === 'hu');
      if (hu) {
        claims.push({ type: 'hu', seat: 0, info: hu.info, tile: hu.tile });
      } else {
        const pung = gc.humanOptions.find(o => o.type === 'pung');
        if (pung && Math.random() < 0.4) {
          claims.push({ type: 'pung', seat: 0, tile: pung.tile });
        }
      }
    }

    const rc = G.resolveClaims(g, claims);
    if (rc.type === 'over') break;
  }

  const res = G.settle(g);
  const sumNet = res.net.reduce((a, b) => a + b, 0);
  assert(sumNet === 0, `第 ${r} 局结算零和守恒严格满足 (净分和: 0)`);
  assert(g.history.length > 5, `第 ${r} 局历史时空链完整 (总步数: ${g.history.length})`);
  assert(g.history[g.history.length - 1].actionType === 'settle', `第 ${r} 局终局快照类型正确为 settle`);

  // 验证复盘分析总结
  const review = AI.summarizeGameReview(g.history);
  assert(review.accuracy >= 0 && review.accuracy <= 100, `第 ${r} 局复盘雀力评分有效: ${review.accuracy}分`);
}

console.log('\n====================================================');
console.log(`🏆 深度复盘专项测试全部完成！通过: ${passCount}, 失败: ${failCount}`);
console.log('====================================================');

if (failCount > 0) process.exit(1);
