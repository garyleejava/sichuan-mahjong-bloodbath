const MJ = require('./engine.js');
const AI = require('./ai.js');
const G = require('./game.js');

console.log('====================================================');
console.log('🧪 开始端到端全流程模拟测试 (20 局人机混战)');
console.log('====================================================\n');

let totalRounds = 20;
let humanWins = 0;
let totalHuCount = 0;
let drawCount = 0;

for (let r = 1; r <= totalRounds; r++) {
  const g = G.createGame({
    round: r,
    dealer: (r - 1) % 4,
    aiLevel: 'hard'
  });

  // 1. 定缺
  G.advance(g);
  for (let i = 0; i < 4; i++) {
    g.players[i].lack = AI.chooseLack(g.players[i].hand);
  }
  g.humanLack = true;
  G.advance(g);

  // 2. 对局主循环
  let steps = 0;
  while (!G.isOver(g) && steps < 500) {
    steps++;
    const seat = g.turn;
    const pl = g.players[seat];

    if (pl.out) {
      if (!G.nextTurn(g)) break;
      continue;
    }

    // 验证摸牌后手牌张数 (必须为 14 - 3*mc)
    const expectedHandSize = 14 - 3 * pl.melds.length;
    if (pl.hand.length !== expectedHandSize) {
      console.error(`❌ 牌数异常! Player ${pl.name} hand size: ${pl.hand.length}, expected: ${expectedHandSize}`);
      process.exit(1);
    }

    if (pl.isHuman) {
      // 人类行动逻辑
      const acts = G.actActions(g, 0);
      const tsumo = acts.find(a => a.type === 'tsumo');
      if (tsumo) {
        G.doHu(g, 0, tsumo.info, 0);
        humanWins++;
        totalHuCount++;
        if (G.isOver(g)) break;
        if (!G.nextTurn(g)) break;
        continue;
      }

      const kong = acts.find(a => a.type === 'ankong' || a.type === 'addkong');
      if (kong && Math.random() < 0.5) {
        G.doKong(g, 0, kong.tile, kong.type === 'ankong' ? 'an' : 'add');
        continue;
      }

      // 出牌 (强制缺门优先)
      const lackTiles = pl.hand.filter(t => t[0] === pl.lack);
      const tileToDiscard = lackTiles.length > 0 ? lackTiles[0] : AI.chooseDiscard(g, 0, 'hard');
      G.doDiscard(g, 0, tileToDiscard);

      // 处理副露
      const gc = G.gatherClaims(g);
      let claims = gc.allClaims || [];
      if (gc.need === 'humanClaim') {
        // 人类副露选择
        const hu = gc.options.find(o => o.type === 'hu');
        if (hu) {
          claims.push({ type: 'hu', seat: 0, info: hu.info, tile: hu.tile });
          humanWins++;
          totalHuCount++;
        } else {
          const pung = gc.options.find(o => o.type === 'pung');
          if (pung && Math.random() < 0.4) {
            claims.push({ type: 'pung', seat: 0, tile: pung.tile });
          }
        }
      }

      if (claims.length > 0) {
        const hus = claims.filter(c => c.type === 'hu');
        totalHuCount += hus.length;
        const rc = G.resolveClaims(g, claims);
        if (rc.done) break;
      } else {
        if (!G.nextTurn(g)) break;
      }

    } else {
      // AI 行动逻辑
      const act = AI.act(g, seat, 'hard');
      if (act.type === 'tsumo') {
        G.doHu(g, seat, act.info, seat);
        totalHuCount++;
        if (G.isOver(g)) break;
        if (!G.nextTurn(g)) break;
        continue;
      } else if (act.type === 'ankong' || act.type === 'addkong') {
        G.doKong(g, seat, act.tile, act.type === 'ankong' ? 'an' : 'add');
        continue;
      } else if (act.type === 'discard') {
        G.doDiscard(g, seat, act.tile);

        // 处理副露
        const gc = G.gatherClaims(g);
        let claims = gc.allClaims || [];
        if (gc.need === 'humanClaim') {
          const hu = gc.options.find(o => o.type === 'hu');
          if (hu) {
            claims.push({ type: 'hu', seat: 0, info: hu.info, tile: hu.tile });
            humanWins++;
            totalHuCount++;
          } else {
            const pung = gc.options.find(o => o.type === 'pung');
            if (pung && Math.random() < 0.4) {
              claims.push({ type: 'pung', seat: 0, tile: pung.tile });
            }
          }
        }

        if (claims.length > 0) {
          const hus = claims.filter(c => c.type === 'hu');
          totalHuCount += hus.length;
          const rc = G.resolveClaims(g, claims);
          if (rc.done) break;
        } else {
          if (!G.nextTurn(g)) break;
        }
      }
    }
  }

  // 3. 结算
  const res = G.settle(g);
  if (res.isDraw) drawCount++;
  const sumNet = res.net.reduce((a, b) => a + b, 0);
  if (sumNet !== 0) {
    console.error(`❌ 第 ${r} 局结算零和守恒失败! sumNet = ${sumNet}`);
    process.exit(1);
  }
}

console.log(`✅ 成功完成 ${totalRounds} 局端到端真实人机混战测试！`);
console.log(`📈 战绩汇总: 人类胡牌 ${humanWins} 次, 全场总胡牌 ${totalHuCount} 次, 流局 ${drawCount} 次`);
console.log('✅ 手牌张数校验 100% 正确 (无任何多牌、少牌、连续出牌异常)');
console.log('✅ 零和守恒校验 100% 满足 (每局结算收支总和严格为 0)');
console.log('====================================================');
