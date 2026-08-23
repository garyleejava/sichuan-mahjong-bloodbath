/* ============================================================
   四川麻将·血战到底 — 核心状态机引擎
   4人(0=你, 1=小川, 2=阿蓉, 3=老李), 庄家轮转, 定缺, 碰杠胡, 血战到底
   状态流转: lack -> turn_act / pung_act -> claim_phase -> turn_act ... -> over
   ============================================================ */
(function (root) {
  'use strict';
  const MJ = (typeof require !== 'undefined') ? require('./engine.js') : root.MJ;
  const AI = (typeof require !== 'undefined') ? require('./ai.js') : root.MJAI;

  const PLAYER_NAMES = ['你', '小川 (下家)', '阿蓉 (对家)', '老李 (上家)'];
  const SEAT_WINDS = ['东', '南', '西', '北'];

  function createGame(opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const aiLevel = opts.aiLevel || 'normal';
    const baseScore = opts.baseScore || 1;
    const round = opts.round || 1;
    const dealer = opts.dealer !== undefined ? opts.dealer : 0;

    const g = {
      round,
      dealer,
      wall: [],
      wallPtr: 0,
      wallEnd: 0,
      players: [],
      turn: dealer,
      phase: 'lack', // lack | turn_act | pung_act | claim_phase | over
      pendingDiscard: null,
      discardFrom: -1,
      lastDraw: null,
      afterKong: false,
      turnCount: 0,
      kongTurnRecord: null, // 当前轮次杠牌收益记录 (用于呼叫转移)
      gangTransactions: [], // 历史刮风下雨记录
      log: [],
      winners: [],
      results: null,
      aiLevel,
      baseScore,
      humanLack: false,
    };

    for (let i = 0; i < 4; i++) {
      g.players.push({
        seat: i,
        name: PLAYER_NAMES[i],
        wind: SEAT_WINDS[(i - dealer + 4) % 4],
        hand: [],
        melds: [],
        discards: [],
        lack: null,
        isHuman: (i === 0),
        hu: null,
        out: false,
        score: 0,
        gangGain: 0,
      });
    }

    // 洗牌与发牌
    g.wall = MJ.buildWall();
    MJ.shuffle(g.wall, rng);

    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 13; k++) {
        g.players[i].hand.push(g.wall[g.wallPtr++]);
      }
    }
    // 庄家起手摸第14张牌
    const dealerFirstDraw = g.wall[g.wallPtr++];
    g.players[dealer].hand.push(dealerFirstDraw);
    g.lastDraw = dealerFirstDraw;

    for (let i = 0; i < 4; i++) sortHand(g.players[i].hand);

    return g;
  }

  function sortHand(hand) {
    hand.sort((a, b) => {
      if (a[0] !== b[0]) return MJ.SUITS.indexOf(a[0]) - MJ.SUITS.indexOf(b[0]);
      return +a[1] - +b[1];
    });
  }

  // ---- 定缺 ----
  function autoLack(game) {
    for (let i = 0; i < 4; i++) {
      if (game.players[i].lack) continue;
      if (game.players[i].isHuman) continue;
      game.players[i].lack = AI.chooseLack(game.players[i].hand);
    }
  }

  function setHumanLack(game, suit) {
    game.players[0].lack = suit;
    game.humanLack = true;
  }

  function allLackSet(game) {
    return game.players.every(p => !!p.lack);
  }

  // ---- 牌墙与摸牌 ----
  function wallCount(game) {
    return Math.max(0, game.wall.length - game.wallPtr - game.wallEnd);
  }

  function drawTile(game) {
    if (wallCount(game) <= 0) return null;
    return game.wall[game.wallPtr++];
  }

  function drawTail(game) {
    if (wallCount(game) <= 0) return null;
    const t = game.wall[game.wall.length - 1 - game.wallEnd];
    game.wallEnd++;
    return t;
  }

  function meldCount(pl) {
    return pl.melds.length;
  }

  // ---- 胡牌检查 ----
  function checkTsumo(game, seat) {
    const pl = game.players[seat];
    if (pl.out) return null;
    const mc = meldCount(pl);
    const need = 14 - 3 * mc;
    if (pl.hand.length !== need) return null;

    // 手里有缺门牌则不能胡 (花猪)
    if (pl.lack && pl.hand.some(t => t[0] === pl.lack)) return null;

    const r = MJ.canHu(MJ.toCounts(pl.hand), mc);
    if (!r.ok) return null;

    const winTile = game.lastDraw || pl.hand[pl.hand.length - 1];
    const isTian = (game.turnCount === 0 && seat === game.dealer);
    const isDi = (game.turnCount <= 1 && seat !== game.dealer);
    const isHaiDi = (wallCount(game) === 0);

    return MJ.calcFan({
      tiles: pl.hand,
      melds: pl.melds,
      winTile,
      selfDraw: true,
      afterKong: game.afterKong,
      isTianHu: isTian,
      isDiHu: isDi,
      isHaiDi,
    });
  }

  function checkHuOnDiscard(game, seat, tile, isRobbedKong) {
    const pl = game.players[seat];
    if (pl.out) return null;
    const mc = meldCount(pl);
    const need = 13 - 3 * mc;
    if (pl.hand.length !== need) return null;

    // 缺门花色判定
    if (pl.lack && (pl.hand.some(t => t[0] === pl.lack) || tile[0] === pl.lack)) return null;

    const all = pl.hand.concat(tile);
    const r = MJ.canHu(MJ.toCounts(all), mc);
    if (!r.ok) return null;

    const isDi = (game.turnCount <= 1 && seat !== game.dealer);
    const isHaiDi = (wallCount(game) === 0);

    return MJ.calcFan({
      tiles: all,
      melds: pl.melds,
      winTile: tile,
      selfDraw: false,
      afterKong: game.afterKong,
      robbedKong: !!isRobbedKong,
      isDiHu: isDi,
      isHaiDi,
    });
  }

  // ---- 玩家可执行动作 ----
  function actActions(game, seat) {
    const pl = game.players[seat];
    const acts = [];
    if (pl.out) return acts;

    // 仅在 turn_act 状态可自摸或暗杠 (碰牌后 pung_act 只能出牌)
    if (game.phase === 'turn_act') {
      const tsumo = checkTsumo(game, seat);
      if (tsumo) acts.push({ type: 'tsumo', info: tsumo });

      // 暗杠 (手里4张相同的非缺门牌)
      const counts = MJ.toCounts(pl.hand);
      for (let i = 0; i < 27; i++) {
        if (counts[i] === 4) {
          const t = MJ.indexToTile(i);
          if (t[0] !== pl.lack) {
            acts.push({ type: 'ankong', tile: t });
          }
        }
      }

      // 补杠 (已碰的牌手里又摸到第4张)
      for (const m of pl.melds) {
        if (m.type === 'pung') {
          const t = m.tiles[0];
          if (pl.hand.includes(t) && t[0] !== pl.lack) {
            acts.push({ type: 'addkong', tile: t });
          }
        }
      }
    }

    return acts;
  }

  function claimActions(game, seat) {
    const pl = game.players[seat];
    if (pl.out) return [];
    const tile = game.pendingDiscard;
    if (!tile || tile[0] === pl.lack) return [];

    const opts = [];
    const hu = checkHuOnDiscard(game, seat, tile, false);
    if (hu) opts.push({ type: 'hu', info: hu, tile });

    const counts = MJ.toCounts(pl.hand);
    const idx = MJ.tileIndex(tile);
    if (counts[idx] >= 3) opts.push({ type: 'kong', tile });
    if (counts[idx] >= 2) opts.push({ type: 'pung', tile });

    return opts;
  }

  // ---- 执行动作 ----
  function doDiscard(game, seat, tile) {
    const pl = game.players[seat];
    const idx = pl.hand.indexOf(tile);
    if (idx < 0) throw new Error('弃牌不在手中: ' + tile);

    pl.hand.splice(idx, 1);
    pl.discards.push(tile);
    game.pendingDiscard = tile;
    game.discardFrom = seat;
    game.phase = 'claim_phase';
    game.lastDraw = null;
    game.turnCount++;

    pushLog(game, seat, '打出 ' + MJ.tileName(tile));
  }

  function doPung(game, seat, tile) {
    const pl = game.players[seat];
    let removed = 0;
    pl.hand = pl.hand.filter(t => {
      if (t === tile && removed < 2) {
        removed++;
        return false;
      }
      return true;
    });

    const from = game.discardFrom;
    const di = game.players[from].discards.lastIndexOf(tile);
    if (di >= 0) game.players[from].discards.splice(di, 1);

    pl.melds.push({ type: 'pung', tiles: [tile, tile, tile], from });
    game.pendingDiscard = null;
    game.afterKong = false;
    game.kongTurnRecord = null;
    game.turn = seat;
    game.phase = 'pung_act';
    pushLog(game, seat, '碰 ' + MJ.tileName(tile));
  }

  function doKong(game, seat, tile, mode) {
    const pl = game.players[seat];
    const currentGangRecord = { seat, type: mode, tile, trans: [] };

    if (mode === 'ming') {
      let removed = 0;
      pl.hand = pl.hand.filter(t => {
        if (t === tile && removed < 3) {
          removed++;
          return false;
        }
        return true;
      });
      const from = game.discardFrom;
      const di = game.players[from].discards.lastIndexOf(tile);
      if (di >= 0) game.players[from].discards.splice(di, 1);

      pl.melds.push({ type: 'kong', tiles: [tile, tile, tile, tile], from, concealed: false });
      pushLog(game, seat, '明杠 ' + MJ.tileName(tile) + ' (刮风 +2分)');

      const amount = 2 * game.baseScore;
      currentGangRecord.trans.push({ from, to: seat, amount, reason: '明杠(刮风)' });
      pl.gangGain += amount;
      game.players[from].gangGain -= amount;

    } else if (mode === 'an') {
      let removed = 0;
      pl.hand = pl.hand.filter(t => {
        if (t === tile && removed < 4) {
          removed++;
          return false;
        }
        return true;
      });
      pl.melds.push({ type: 'kong', tiles: [tile, tile, tile, tile], from: seat, concealed: true });
      pushLog(game, seat, '暗杠 ' + MJ.tileName(tile) + ' (下雨 各+2分)');

      const amount = 2 * game.baseScore;
      for (let j = 0; j < 4; j++) {
        if (j !== seat && !game.players[j].out) {
          currentGangRecord.trans.push({ from: j, to: seat, amount, reason: '暗杠(下雨)' });
          pl.gangGain += amount;
          game.players[j].gangGain -= amount;
        }
      }

    } else if (mode === 'add') {
      let removed = 0;
      pl.hand = pl.hand.filter(t => {
        if (t === tile && removed < 1) {
          removed++;
          return false;
        }
        return true;
      });
      const mi = pl.melds.findIndex(m => m.type === 'pung' && m.tiles[0] === tile);
      if (mi >= 0) {
        pl.melds[mi] = { type: 'kong', tiles: [tile, tile, tile, tile], from: pl.melds[mi].from, concealed: false };
      }
      pushLog(game, seat, '补杠 ' + MJ.tileName(tile) + ' (刮风 各+1分)');

      const amount = 1 * game.baseScore;
      for (let j = 0; j < 4; j++) {
        if (j !== seat && !game.players[j].out) {
          currentGangRecord.trans.push({ from: j, to: seat, amount, reason: '补杠(刮风)' });
          pl.gangGain += amount;
          game.players[j].gangGain -= amount;
        }
      }
    }

    game.gangTransactions.push(currentGangRecord);
    game.kongTurnRecord = currentGangRecord;
    game.pendingDiscard = null;

    // 杠后从尾部摸牌
    const drawn = drawTail(game);
    if (drawn) {
      pl.hand.push(drawn);
      sortHand(pl.hand);
      game.afterKong = true;
      game.lastDraw = drawn;
      game.turn = seat;
      game.phase = 'turn_act';
    } else {
      game.phase = 'over';
    }
  }

  function doHu(game, seat, info, fromSeat) {
    const pl = game.players[seat];
    info.selfDraw = (fromSeat === seat);
    info.fromSeat = fromSeat;
    info.winTile = info.winTile || game.pendingDiscard || game.lastDraw;
    pl.hu = info;
    pl.out = true;
    pl.score = info.score;
    game.winners.push(seat);

    // 呼叫转移 (杠上炮)
    if (fromSeat !== seat && game.afterKong && game.kongTurnRecord && game.kongTurnRecord.seat === fromSeat) {
      const gangRec = game.kongTurnRecord;
      let totalTransferred = 0;
      for (const tr of gangRec.trans) {
        totalTransferred += tr.amount;
        tr.to = seat;
        tr.reason += ' [呼叫转移至' + pl.name + ']';
      }
      if (totalTransferred > 0) {
        game.players[fromSeat].gangGain -= totalTransferred;
        pl.gangGain += totalTransferred;
        pushLog(game, fromSeat, '呼叫转移: 杠分 ' + totalTransferred + '分 转移给 ' + pl.name);
      }
    }

    if (fromSeat === seat) {
      pushLog(game, seat, '🎉 自摸胡! ' + info.desc.join(' ') + ' (' + info.score + '分)');
    } else {
      pushLog(game, seat, '🎉 胡 ' + MJ.tileName(info.winTile) + '! ' + info.desc.join(' ') + ' (' + info.score + '分)');
    }
  }

  function pushLog(game, seat, msg) {
    game.log.push({ seat, msg, t: Date.now() });
    if (game.log.length > 60) game.log.shift();
  }

  // ---- 游戏结束判断 ----
  function isOver(game) {
    if (game.phase === 'over') return true;
    const remaining = game.players.filter(p => !p.out);
    if (remaining.length <= 1 && game.winners.length >= 1) return true;
    // 只有在摸牌/出牌/副露阶段均已处理完毕且牌墙用尽时才结束
    if (wallCount(game) <= 0 && game.phase !== 'turn_act' && game.phase !== 'pung_act' && game.phase !== 'claim_phase') {
      return true;
    }
    return false;
  }

  // 摸牌并推进到指定座位的 turn_act 阶段
  function playerDraw(game, seat) {
    const pl = game.players[seat];
    if (pl.out) return null;
    const t = drawTile(game);
    if (!t) return null;

    pl.hand.push(t);
    sortHand(pl.hand);
    game.lastDraw = t;
    game.afterKong = false;
    game.kongTurnRecord = null;
    game.turn = seat;
    game.phase = 'turn_act';
    pushLog(game, seat, '摸牌');
    return t;
  }

  // 转向下一位未胡牌玩家并摸牌
  function nextTurn(game) {
    if (isOver(game)) {
      game.phase = 'over';
      return false;
    }
    let next = (game.turn + 1) % 4;
    while (game.players[next].out) {
      next = (next + 1) % 4;
    }
    game.pendingDiscard = null;
    const t = playerDraw(game, next);
    if (!t) {
      game.phase = 'over';
      return false;
    }
    return true;
  }

  // 收集副露声明
  function gatherClaims(game) {
    const claims = [];
    let humanOpts = null;

    for (let i = 0; i < 4; i++) {
      const seat = (game.discardFrom + 1 + i) % 4;
      if (seat === game.discardFrom) continue;
      const pl = game.players[seat];
      if (pl.out) continue;

      const opts = claimActions(game, seat);
      if (!opts.length) continue;

      if (pl.isHuman) {
        humanOpts = opts;
        continue;
      }

      const decision = AI.claim(game, seat, game.aiLevel);
      if (decision.type !== 'pass') {
        decision.seat = seat;
        const matchingOpt = opts.find(o => o.type === decision.type);
        if (matchingOpt) {
          decision.info = matchingOpt.info;
          decision.tile = matchingOpt.tile;
          claims.push(decision);
        }
      }
    }

    if (humanOpts) {
      return { needHumanClaim: true, humanOptions: humanOpts, aiClaims: claims };
    }
    return { needHumanClaim: false, humanOptions: [], aiClaims: claims };
  }

  // 解析并执行副露声明 (碰/杠/胡/过)
  function resolveClaims(game, allClaims) {
    allClaims = allClaims || [];

    // 1. 胡牌 (支持一炮多响)
    const hus = allClaims.filter(c => c.type === 'hu');
    if (hus.length > 0) {
      const from = game.discardFrom;
      for (const h of hus) {
        const info = h.info;
        info.selfDraw = false;
        info.fromSeat = from;
        info.winTile = game.pendingDiscard;
        doHu(game, h.seat, info, from);
      }
      game.pendingDiscard = null;

      if (isOver(game)) {
        game.phase = 'over';
        return { type: 'over' };
      }

      // 点炮后由点炮者下家摸牌继续
      game.turn = from;
      if (!nextTurn(game)) {
        return { type: 'over' };
      }
      return { type: 'hu', winners: hus.map(h => h.seat), nextTurn: game.turn, drawnTile: game.lastDraw };
    }

    // 2. 直杠 (明杠)
    const kong = allClaims.find(c => c.type === 'kong');
    if (kong) {
      doKong(game, kong.seat, kong.tile, 'ming');
      if (isOver(game)) {
        return { type: 'over' };
      }
      return { type: 'kong', seat: kong.seat, drawnTile: game.lastDraw };
    }

    // 3. 碰牌
    const pung = allClaims.find(c => c.type === 'pung');
    if (pung) {
      doPung(game, pung.seat, pung.tile);
      return { type: 'pung', seat: pung.seat };
    }

    // 4. 无人副露，下家摸牌
    game.turn = game.discardFrom;
    if (!nextTurn(game)) {
      return { type: 'over' };
    }
    return { type: 'next_turn', seat: game.turn, drawnTile: game.lastDraw };
  }

  // ---- 推进阶段 (开局定缺) ----
  function advance(game) {
    if (game.phase === 'lack') {
      autoLack(game);
      if (!game.players[0].lack) return { need: 'humanLack' };
      if (allLackSet(game)) {
        game.phase = 'turn_act';
        game.turn = game.dealer;
        pushLog(game, -1, '定缺完成: ' + game.players.map(p => p.name + '缺' + MJ.SUIT_NAMES[p.lack]).join(', '));
        return { need: 'turn_act', seat: game.turn };
      }
      return { need: 'humanLack' };
    }
    return { need: 'none' };
  }

  // ---- 血战到底终局结算 ----
  function settle(game) {
    const res = {
      payouts: [],
      fanList: [],
      net: [0, 0, 0, 0],
      isDraw: (wallCount(game) <= 0),
    };
    const players = game.players;

    // 1. 各家听牌/花猪状态
    for (let i = 0; i < 4; i++) {
      const pl = players[i];
      if (pl.out) {
        res.fanList.push({
          seat: i,
          hu: true,
          desc: pl.hu.desc,
          score: pl.hu.score,
          fan: pl.hu.fan,
          winTile: pl.hu.winTile,
          selfDraw: pl.hu.selfDraw,
          fromSeat: pl.hu.fromSeat,
        });
        continue;
      }

      const waits = MJ.tenpai(pl.hand, meldCount(pl), pl.lack);
      const isHuaZhu = isHuaZhuCheck(pl);
      let maxScore = 0;
      let maxFan = 0;

      if (!isHuaZhu && waits.length > 0) {
        for (const w of waits) {
          const f = MJ.calcFan({
            tiles: pl.hand.concat(w),
            melds: pl.melds,
            winTile: w,
            selfDraw: false,
          });
          if (f.score > maxScore) {
            maxScore = f.score;
            maxFan = f.fan;
          }
        }
      }

      res.fanList.push({
        seat: i,
        hu: false,
        waits,
        isHuaZhu,
        isTing: (!isHuaZhu && waits.length > 0),
        maxScore,
        maxFan,
        desc: isHuaZhu ? ['花猪 (手持缺门)'] : (waits.length ? [`已叫: 听${waits.map(MJ.tileShortName).join('/')} (最大${maxScore}分)`] : ['未叫 (未听牌)']),
      });
    }

    // 2. 自摸支付
    for (let i = 0; i < 4; i++) {
      const pl = players[i];
      if (pl.out && pl.hu.selfDraw) {
        for (let j = 0; j < 4; j++) {
          if (j === i) continue;
          if (!players[j].out) {
            res.payouts.push({ from: j, to: i, amount: pl.hu.score, reason: '自摸胡牌' });
          }
        }
      }
    }

    // 3. 点炮支付
    for (let i = 0; i < 4; i++) {
      const pl = players[i];
      if (pl.out && !pl.hu.selfDraw) {
        const from = pl.hu.fromSeat;
        res.payouts.push({ from, to: i, amount: pl.hu.score, reason: '点炮胡牌' });
      }
    }

    // 4. 刮风下雨杠分
    for (const rec of game.gangTransactions) {
      for (const tr of rec.trans) {
        res.payouts.push({ from: tr.from, to: tr.to, amount: tr.amount, reason: tr.reason });
      }
    }

    // 5. 流局结算 (查花猪、查大叫、退税)
    if (res.isDraw) {
      // 查花猪 (赔满番 16分)
      for (let i = 0; i < 4; i++) {
        const infoI = res.fanList.find(f => f.seat === i);
        if (!infoI.hu && infoI.isHuaZhu) {
          for (let j = 0; j < 4; j++) {
            if (j === i) continue;
            const infoJ = res.fanList.find(f => f.seat === j);
            if (!infoJ.isHuaZhu) {
              res.payouts.push({ from: i, to: j, amount: 16 * game.baseScore, reason: '查花猪赔偿' });
            }
          }
        }
      }

      // 查大叫 (赔已叫最大番)
      for (let i = 0; i < 4; i++) {
        const infoI = res.fanList.find(f => f.seat === i);
        if (!infoI.hu && !infoI.isHuaZhu && !infoI.isTing) {
          for (let j = 0; j < 4; j++) {
            if (j === i) continue;
            const infoJ = res.fanList.find(f => f.seat === j);
            if (!infoJ.hu && !infoJ.isHuaZhu && infoJ.isTing) {
              const amt = Math.max(1, infoJ.maxScore) * game.baseScore;
              res.payouts.push({ from: i, to: j, amount: amt, reason: '未叫查大叫赔偿' });
            }
          }
        }
      }

      // 退税 (未听牌与花猪退还杠分)
      for (let i = 0; i < 4; i++) {
        const infoI = res.fanList.find(f => f.seat === i);
        if (!infoI.hu && (!infoI.isTing || infoI.isHuaZhu)) {
          for (const rec of game.gangTransactions) {
            if (rec.seat === i) {
              for (const tr of rec.trans) {
                res.payouts.push({ from: i, to: tr.from, amount: tr.amount, reason: '流局未叫退税' });
              }
            }
          }
        }
      }
    }

    // 6. 净分汇总
    for (const p of res.payouts) {
      res.net[p.from] -= p.amount;
      res.net[p.to] += p.amount;
    }

    game.results = res;
    game.phase = 'over';
    return res;
  }

  function isHuaZhuCheck(pl) {
    if (pl.out) return false;
    return pl.hand.some(t => t[0] === pl.lack);
  }

  const G = {
    createGame,
    sortHand,
    autoLack,
    setHumanLack,
    allLackSet,
    wallCount,
    drawTile,
    drawTail,
    meldCount,
    actActions,
    claimActions,
    doDiscard,
    doPung,
    doKong,
    doHu,
    advance,
    playerDraw,
    nextTurn,
    gatherClaims,
    resolveClaims,
    isOver,
    settle,
    isHuaZhuCheck,
    checkTsumo,
    checkHuOnDiscard,
    PLAYER_NAMES,
    SEAT_WINDS,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  root.MJG = G;
})(typeof window !== 'undefined' ? window : globalThis);
