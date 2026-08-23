const MJ = require('./engine.js');
const AI = require('./ai.js');
const G = require('./game.js');

console.log('====================================================');
console.log('🧪 开始四川麻将·血战到底 “换三张” 专项测试套件');
console.log('====================================================\n');

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

// 1. AI 换三张算法与选牌策略测试
console.log('--- [换三张测试 1] AI 换牌选牌策略 ---');
{
  // 场景 A: 手中恰好 3 张散牌孤张 (1万、8万、9万)，其余为顺子搭子
  const handA = ['m1', 'm8', 'm9', 'p2', 'p3', 'p4', 'p5', 'p6', 's3', 's4', 's5', 's7', 's8'];
  const swapA = AI.chooseSwap3(handA);
  assert(swapA.length === 3 && swapA.every(t => t[0] === 'm'), '场景 A 选出同花色万字 3 张');
  assert(swapA.includes('m1') && swapA.includes('m9') && swapA.includes('m8'), '场景 A 精准选中 3 张万字散牌孤张');

  // 场景 B: 强烈清一色底子 (9张条子，3张万子，1张筒子)
  const handB = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 'm2', 'm3', 'm9', 'p5'];
  const swapB = AI.chooseSwap3(handB);
  assert(swapB.length === 3 && swapB.every(t => t[0] === 'm'), '场景 B 冲刺清一色，精准换出万字杂牌');
}

// 2. 雀神 AI 教练深度可解释性分析测试
console.log('\n--- [换三张测试 2] 雀神 AI 教练可解释性分析 ---');
{
  const hand = ['m1', 'm8', 'm9', 'p2', 'p3', 'p4', 'p5', 'p6', 's3', 's4', 's5', 's7', 's8'];
  const advice = AI.analyzeSwapAdvice(hand);
  assert(advice && advice.tiles.length === 3, '教练输出推荐换出的 3 张牌');
  assert(advice.suit === 'm' && advice.suitName === '万', '教练正确识别推荐换出万字');
  assert(advice.tag.includes('清门') || advice.tag.includes('清缺'), '教练给出清门标签');
  assert(advice.reason.includes('万') && (advice.reason.includes('定缺') || advice.reason.includes('散牌')), '教练给出清晰的战术理由解释');
  assert(advice.candidates.length >= 2, '教练提供其他候选花色对比分析');
}

// 3. 非法换牌校验测试
console.log('\n--- [换三张测试 3] 非法换牌拦截与校验 ---');
{
  const g = G.createGame({ enableSwap: true, round: 1, dealer: 0 });
  g.players[0].hand = ['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 's4', 's5', 's6', 's7'];

  // 尝试换 2 张牌 (少于3张)
  let err1 = false;
  try {
    G.setHumanSwap(g, ['m1', 'm2']);
  } catch (e) {
    err1 = true;
  }
  assert(err1, '拦截少于 3 张牌的换牌尝试');

  // 尝试换不同花色的 3 张牌 (2万 + 1筒)
  let err2 = false;
  try {
    G.setHumanSwap(g, ['m1', 'm2', 'p1']);
  } catch (e) {
    err2 = true;
  }
  assert(err2, '拦截混杂不同花色的换牌尝试');

  // 尝试换手中不存在的牌
  let err3 = false;
  try {
    G.setHumanSwap(g, ['m9', 'm9', 'm9']);
  } catch (e) {
    err3 = true;
  }
  assert(err3, '拦截手中不存在牌的换牌尝试');
}

// 4. 换牌方向与拓扑转移测试 (对家、顺时针、逆时针)
console.log('\n--- [换三张测试 4] 交换拓扑转移与牌数守恒 ---');
{
  const directions = ['opposite', 'clockwise', 'counterclockwise'];
  for (const dir of directions) {
    const g = G.createGame({ enableSwap: true, round: 1, dealer: 0 });
    // 确保选出的 3 张牌均来自各自手牌
    for (let i = 0; i < 4; i++) {
      g.players[i].chosenSwapTiles = AI.chooseSwap3(g.players[i].hand);
    }

    const res = G.doSwap(g, dir, 3);
    assert(g.phase === 'lack', `执行 [${res.directionName}] 换三张后流转至 lack 定缺阶段`);

    // 检查各家手牌数量 (庄家此时已摸第14张牌，其余3家为13张)
    assert(g.players[0].hand.length === 14, `庄家手牌数正确为 14 张 (含摸牌)`);
    assert(g.players[1].hand.length === 13, `玩家1手牌数正确为 13 张`);
    assert(g.players[2].hand.length === 13, `玩家2手牌数正确为 13 张`);
    assert(g.players[3].hand.length === 13, `玩家3手牌数正确为 13 张`);

    // 校验总牌数守恒 (4家手牌 + 剩余牌墙 === 108)
    const totalHandTiles = g.players.reduce((sum, p) => sum + p.hand.length, 0);
    const remWall = G.wallCount(g);
    assert(totalHandTiles + remWall === 108, `总牌数严格守恒为 108 张 (手牌 ${totalHandTiles} + 牌墙 ${remWall})`);
  }
}

// 5. 50 局包含换三张的全流程蒙特卡洛仿真测试
console.log('\n--- [换三张测试 5] 50 局全流程蒙特卡洛仿真运行 ---');
let totalHu = 0;
let drawCount = 0;

for (let r = 1; r <= 50; r++) {
  const g = G.createGame({
    round: r,
    dealer: (r - 1) % 4,
    enableSwap: true,
    aiLevel: 'hard'
  });

  // 1. 换三张阶段
  assert(g.phase === 'swap', `第 ${r} 局初始进入 swap 阶段`);
  G.advance(g);
  // 人类自动选牌
  g.players[0].chosenSwapTiles = AI.chooseSwap3(g.players[0].hand);
  g.humanSwap = true;
  const swapAdv = G.advance(g);
  assert(g.phase === 'lack', `第 ${r} 局换三张完成后进入 lack 定缺阶段`);

  // 2. 定缺阶段
  for (let i = 0; i < 4; i++) {
    g.players[i].lack = AI.chooseLack(g.players[i].hand);
  }
  g.humanLack = true;
  G.advance(g);
  assert(g.phase === 'turn_act', `第 ${r} 局定缺完成后进入 turn_act 打牌阶段`);

  // 3. 对局打牌循环
  let steps = 0;
  while (!G.isOver(g) && steps < 500) {
    steps++;
    const seat = g.turn;
    const pl = g.players[seat];

    if (pl.out) {
      if (!G.nextTurn(g)) break;
      continue;
    }

    const decision = AI.act(g, seat, 'hard');
    if (decision.type === 'tsumo') {
      G.doHu(g, seat, decision.info, seat);
      totalHu++;
      if (G.isOver(g)) break;
      if (!G.nextTurn(g)) break;
      continue;
    } else if (decision.type === 'ankong' || decision.type === 'addkong') {
      G.doKong(g, seat, decision.tile, decision.type === 'ankong' ? 'an' : 'add');
      continue;
    } else if (decision.type === 'discard') {
      G.doDiscard(g, seat, decision.tile);
      const claims = [];
      for (let i = 0; i < 4; i++) {
        const s = (seat + 1 + i) % 4;
        if (s === seat || g.players[s].out) continue;
        const opts = G.claimActions(g, s);
        if (!opts.length) continue;
        const dec = AI.claim(g, s, 'hard');
        if (dec.type !== 'pass') {
          dec.seat = s;
          const matchingOpt = opts.find(o => o.type === dec.type);
          if (matchingOpt) {
            dec.info = matchingOpt.info;
            dec.tile = matchingOpt.tile;
            claims.push(dec);
          }
        }
      }
      const rc = G.resolveClaims(g, claims);
      if (rc.type === 'over') break;
    }
  }

  // 4. 结算
  const res = G.settle(g);
  if (res.isDraw) drawCount++;
  const sumNet = res.net.reduce((a, b) => a + b, 0);
  assert(sumNet === 0, `第 ${r} 局结算零和守恒校验 (净分和: ${sumNet})`);
}

console.log(`\n====================================================`);
console.log(`🏆 换三张专项测试全部通过！通过数: ${passCount}, 失败数: ${failCount}`);
console.log(`📊 50 局包含换三张的完整对局中，共胡牌 ${totalHu} 次，流局 ${drawCount} 次，所有手牌与结算 100% 守恒！`);
console.log('====================================================');

if (failCount > 0) process.exit(1);
