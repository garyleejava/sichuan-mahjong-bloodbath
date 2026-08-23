const MJ = require('./engine.js');
const AI = require('./ai.js');
const G = require('./game.js');

// 模拟人类和3个AI的完整对局
for (let gameIdx = 1; gameIdx <= 20; gameIdx++) {
  const g = G.createGame({ round: gameIdx, dealer: (gameIdx - 1) % 4, aiLevel: 'hard' });
  G.advance(g);
  
  // 玩家定缺
  const humanLack = AI.chooseLack(g.players[0].hand);
  G.setHumanLack(g, humanLack);
  G.advance(g);

  let step = 0;
  while (!G.isOver(g) && step < 400) {
    step++;
    const seat = g.turn;
    const pl = g.players[seat];

    if (pl.out) {
      if (!G.nextTurn(g)) break;
      continue;
    }

    if (seat === 0) {
      // 模拟人类行为
      const acts = G.actActions(g, 0);
      const tsumo = acts.find(a => a.type === 'tsumo');
      if (tsumo) {
        G.doHu(g, 0, tsumo.info, 0);
        if (G.isOver(g)) break;
        if (!G.nextTurn(g)) break;
        continue;
      }
      const kong = acts.find(a => a.type === 'ankong' || a.type === 'addkong');
      if (kong && Math.random() < 0.5) {
        G.doKong(g, 0, kong.tile, kong.type === 'ankong' ? 'an' : 'add');
        continue;
      }

      // 出牌: 检查缺门强制规则
      const lack = pl.lack;
      const lackTiles = pl.hand.filter(t => t[0] === lack);
      let discardTile = null;
      if (lackTiles.length > 0) {
        discardTile = lackTiles[0];
      } else {
        discardTile = AI.chooseDiscard(g, 0, 'hard');
      }

      G.doDiscard(g, 0, discardTile);

      // 收集副露
      const gc = G.gatherClaims(g);
      const rc = G.resolveClaims(g, gc.allClaims);
      if (rc.done) break;

    } else {
      // AI 行为
      const act = AI.act(g, seat, 'hard');
      if (act.type === 'tsumo') {
        G.doHu(g, seat, act.info, seat);
        if (G.isOver(g)) break;
        if (!G.nextTurn(g)) break;
        continue;
      } else if (act.type === 'ankong' || act.type === 'addkong') {
        G.doKong(g, seat, act.tile, act.type === 'ankong' ? 'an' : 'add');
        continue;
      } else if (act.type === 'discard') {
        G.doDiscard(g, seat, act.tile);
        const gc = G.gatherClaims(g);
        let claims = gc.allClaims || [];
        if (gc.need === 'humanClaim') {
          const humanOpts = gc.options;
          const hu = humanOpts.find(o => o.type === 'hu');
          if (hu) {
            claims.push({ type: 'hu', seat: 0, info: hu.info, tile: hu.tile });
          } else {
            const pung = humanOpts.find(o => o.type === 'pung');
            if (pung && Math.random() < 0.6) {
              claims.push({ type: 'pung', seat: 0, tile: pung.tile });
            }
          }
        }
        const rc = G.resolveClaims(g, claims);
        if (rc.done) break;
      }
    }
  }

  const res = G.settle(g);
  const sumNet = res.net.reduce((a, b) => a + b, 0);
  if (sumNet !== 0) {
    console.error(`Game ${gameIdx} net sum error:`, sumNet);
    process.exit(1);
  }
  console.log(`Game ${gameIdx} finished. Winners: [${g.winners.map(w => g.players[w].name).join(', ')}], Net: [${res.net.join(', ')}]`);
}
console.log('All 20 human-AI hybrid games passed flawlessly!');
