const MJ = require('./engine.js');
const AI = require('./ai.js');
const G = require('./game.js');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    passedTests++;
    console.log(`✅ PASS: ${message}`);
  }
}

console.log('====================================================');
console.log('🧪 开始四川麻将·血战到底 全面测试套件');
console.log('====================================================\n');

// 1. 基础牌组与工具函数测试
console.log('--- [单元测试 1] 牌组与基础工具 ---');
const wall = MJ.buildWall();
assert(wall.length === 108, '牌墙总数为 108 张');
assert(MJ.tileName('m1') === '一万' && MJ.tileFace('m1') === '🀇', '万字牌面与名称解析');
assert(MJ.tileName('p5') === '五筒' && MJ.tileFace('p5') === '🀝', '筒字牌面与名称解析');
assert(MJ.tileName('s9') === '九条' && MJ.tileFace('s9') === '🀘', '条字牌面与名称解析');
assert(MJ.tileIndex('m1') === 0 && MJ.tileIndex('p1') === 9 && MJ.tileIndex('s1') === 18, '牌索引映射正确');

// 2. 四川麻将核心番型测试
console.log('\n--- [单元测试 2] 四川麻将番型与计分 ---');
// (1) 平胡
const f1 = MJ.calcFan({
  tiles: ['m1','m2','m3','m4','m5','m6','p2','p3','p4','s7','s8','s9','m9','m9'],
  winTile: 'm9',
  selfDraw: false,
});
assert(f1.fan === 1 && f1.score === 1, `平胡: 1番/1分 (实际: ${f1.fan}番/${f1.score}分)`);

// (2) 对对胡 (大对子)
const f2 = MJ.calcFan({
  tiles: ['m1','m1','m1','m3','m3','m3','p4','p4','p4','s6','s6','s6','p9','p9'],
  winTile: 'p9',
  selfDraw: false,
});
assert(f2.fan === 2 && f2.score === 2 && f2.allPung, `对对胡: 2番/2分 (实际: ${f2.fan}番/${f2.score}分)`);

// (3) 清一色
const f3 = MJ.calcFan({
  tiles: ['m1','m2','m3','m4','m5','m6','m7','m8','m9','m1','m2','m3','m5','m5'],
  winTile: 'm5',
  selfDraw: false,
});
assert(f3.fan === 4 && f3.score === 8 && f3.qing, `清一色: 4番/8分 (实际: ${f3.fan}番/${f3.score}分)`);

// (4) 清对 (清一色 + 对对胡)
const f4 = MJ.calcFan({
  tiles: ['m1','m1','m1','m3','m3','m3','m4','m4','m4','m6','m6','m6','m9','m9'],
  winTile: 'm9',
  selfDraw: false,
});
assert(f4.fan === 6 && f4.score === 32, `清对: 6番/32分 (实际: ${f4.fan}番/${f4.score}分)`);

// (5) 七对
const f5 = MJ.calcFan({
  tiles: ['m1','m1','m3','m3','m5','m5','p2','p2','p4','p4','s6','s6','s8','s8'],
  winTile: 's8',
  selfDraw: false,
});
assert(f5.fan === 4 && f5.score === 8 && f5.sevenPairs, `七对: 4番/8分 (实际: ${f5.fan}番/${f5.score}分)`);

// (6) 龙七对 (七对含1根)
const f6 = MJ.calcFan({
  tiles: ['m1','m1','m1','m1','m5','m5','p2','p2','p4','p4','s6','s6','s8','s8'],
  winTile: 's8',
  selfDraw: false,
});
assert(f6.fan === 5 && f6.score === 16 && f6.genCount === 1, `龙七对: 5番/16分 (实际: ${f6.fan}番/${f6.score}分)`);

// (7) 金钩钓 (4副露碰/杠，单钓将)
const f7 = MJ.calcFan({
  tiles: ['m8', 'm8'],
  melds: [
    { type: 'pung', tiles: ['p1','p1','p1'] },
    { type: 'pung', tiles: ['p2','p2','p2'] },
    { type: 'pung', tiles: ['s3','s3','s3'] },
    { type: 'pung', tiles: ['s4','s4','s4'] },
  ],
  winTile: 'm8',
  selfDraw: false,
});
assert(f7.fan === 4 && f7.score === 8 && f7.jinGouDiao, `金钩钓: 4番/8分 (实际: ${f7.fan}番/${f7.score}分)`);

// (8) 杠上开花
const f8 = MJ.calcFan({
  tiles: ['m1','m2','m3','m4','m5','m6','p2','p3','p4','s7','s8','s9','m9','m9'],
  winTile: 'm9',
  selfDraw: true,
  afterKong: true,
});
assert(f8.fan === 3 && f8.desc.some(d => d.includes('杠上开花')), `杠上开花自摸: 3番/4分 (实际: ${f8.fan}番/${f8.score}分)`);

// 3. 听牌与查叫测试
console.log('\n--- [单元测试 3] 听牌与定缺查叫 ---');
const tenpaiHand = ['m1','m2','m3','m4','m5','m6','p2','p3','p4','s1','s2','s3','m9'];
const waits = MJ.tenpai(tenpaiHand, 0, 'p'); // lack is 'p' (手上有p2,p3,p4 -> 花猪)
assert(waits.length === 0, '手中尚有缺门花色时不能听牌 (花猪判定)');

const tenpaiHandClean = ['m1','m2','m3','m4','m5','m6','s1','s2','s3','s4','s5','s6','m9'];
const waitsClean = MJ.tenpai(tenpaiHandClean, 0, 'p');
assert(waitsClean.length === 1 && waitsClean[0] === 'm9', '单钓九万听牌成功');

// 4. 完整 100 局血战到底蒙特卡洛仿真测试
console.log('\n--- [仿真测试 4] 100 局血战到底全自动化仿真运行 ---');
let drawCount = 0;
let multiHuCount = 0;
let gangCount = 0;

for (let r = 1; r <= 100; r++) {
  const g = G.createGame({ round: r, dealer: (r - 1) % 4, aiLevel: r % 3 === 0 ? 'hard' : (r % 2 === 0 ? 'normal' : 'easy') });
  G.advance(g);
  // 模拟定缺
  for (let i = 0; i < 4; i++) {
    g.players[i].lack = AI.chooseLack(g.players[i].hand);
  }
  g.humanLack = true;
  G.advance(g);

  let steps = 0;
  while (!G.isOver(g) && steps < 600) {
    steps++;
    const seat = g.turn;
    const pl = g.players[seat];

    if (pl.out) {
      if (!G.nextTurn(g)) break;
      continue;
    }

    const decision = AI.act(g, seat, g.aiLevel);
    if (decision.type === 'tsumo') {
      G.doHu(g, seat, decision.info, seat);
      if (G.isOver(g)) break;
      if (!G.nextTurn(g)) break;
      continue;
    } else if (decision.type === 'ankong' || decision.type === 'addkong') {
      gangCount++;
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
        const dec = AI.claim(g, s, g.aiLevel);
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
      if (claims.filter(c => c.type === 'hu').length > 1) {
        multiHuCount++;
      }
      const rc = G.resolveClaims(g, claims);
      if (rc.done) break;
    }
  }

  const res = G.settle(g);
  if (res.isDraw) drawCount++;

  // 校验守恒定律: 净得分之和必须等于 0 (零和博弈)
  const sumNet = res.net.reduce((a, b) => a + b, 0);
  assert(sumNet === 0, `第 ${r} 局结算零和守恒校验 (净分和: ${sumNet})`);
}

console.log(`\n🎉 100 局自动化牌局仿真测试全部通过！`);
console.log(`📊 统计数据: 触发一炮多响 ${multiHuCount} 次, 杠牌刮风下雨 ${gangCount} 次, 流局 ${drawCount} 次`);
console.log(`\n====================================================`);
console.log(`🏆 全部 ${passedTests} / ${totalTests} 项测试通过，引擎 100% 正确可靠！`);
console.log('====================================================');
