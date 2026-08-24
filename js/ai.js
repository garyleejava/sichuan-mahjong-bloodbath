/* ============================================================
   四川麻将·血战到底 — 高级人工智能决策引擎 (Master AI) & 雀神教练教学系统
   核心算法:
   1. 深度向听数精算 (Shanten Calculation, 包含标准面子手、暗七对、对对胡)
   2. 全局有效进张精算 (Uke-ire / Effective Acceptance & Tile Probability)
   3. 清一色与大番期望收益博弈模型 (Pure Suit & High-Fan EV Optimization)
   4. 攻守兼备的押拉判断 (Push-Fold Defense, 现物/熟张/绝张识别与副露威胁度评估)
   5. 智能定缺深度评估 (基于牌组分布、进张效率与大番潜力的定缺决策)
   6. 战术副露与刮风下雨收益评估 (七对保护、清一色催化碰、高收益杠牌)
   7. 雀神AI教练可解释性教学与推荐系统 (analyzeHandAdvice)
   ============================================================ */
(function (root) {
  'use strict';
  const MJ = (typeof require !== 'undefined') ? require('./engine.js') : root.MJ;

  const LEVELS = {
    easy:   { smartLevel: 0.50, defendWeight: 0.0,  qingTendency: 0.3, kongProb: 0.40 },
    normal: { smartLevel: 0.85, defendWeight: 0.45, qingTendency: 0.6, kongProb: 0.75 },
    hard:   { smartLevel: 1.00, defendWeight: 0.90, qingTendency: 0.9, kongProb: 0.95 },
  };

  // ---- 1. 牌统计与工具函数 ----
  function countVisibleTiles(game, tile) {
    if (!game || !tile) return 0;
    let count = 0;
    for (const p of game.players) {
      for (const t of p.discards) if (t === tile) count++;
      for (const m of p.melds) {
        for (const t of m.tiles) if (t === tile) count++;
      }
    }
    return count;
  }

  function getUnseenCount(game, seat, tile) {
    const pl = game ? game.players[seat] : null;
    let seen = game ? countVisibleTiles(game, tile) : 0;
    if (pl) {
      for (const t of pl.hand) if (t === tile) seen++;
    }
    return Math.max(0, 4 - seen);
  }

  // ---- 2. 向听数精算系统 (Shanten Engine) ----
  // 七对向听数 (0 = 已听牌, 1 = 一向听...)
  function calcSevenPairsShanten(counts, lack) {
    let pairs = 0;
    let unique = 0;
    for (let i = 0; i < 27; i++) {
      const t = MJ.indexToTile(i);
      if (t[0] === lack) continue;
      if (counts[i] >= 2) pairs++;
      if (counts[i] >= 1) unique++;
    }
    let shanten = 6 - pairs;
    if (unique < 7) shanten += (7 - unique);
    return Math.max(0, shanten);
  }

  // 标准面子手向听数 (4 面子 + 1 将)
  function calcRegularShanten(counts, meldCount, lack) {
    const neededMelds = 4 - meldCount;
    let minShanten = 8;

    function search(suitIdx, currentMelds, currentTaatsu, hasPair, pos) {
      if (suitIdx >= 3) {
        let m = currentMelds;
        let t = currentTaatsu;
        if (m + t > neededMelds) t = neededMelds - m;
        let sh = 2 * (neededMelds - m) - t - (hasPair ? 1 : 0);
        if (sh < minShanten) minShanten = sh;
        return;
      }

      const suit = MJ.SUITS[suitIdx];
      if (suit === lack) {
        search(suitIdx + 1, currentMelds, currentTaatsu, hasPair, 0);
        return;
      }

      const base = suitIdx * 9;
      let idx = -1;
      for (let k = pos; k < 9; k++) {
        if (counts[base + k] > 0) { idx = k; break; }
      }

      if (idx === -1) {
        search(suitIdx + 1, currentMelds, currentTaatsu, hasPair, 0);
        return;
      }

      const i = base + idx;

      // 1. 尝试刻子 (Triplet)
      if (counts[i] >= 3) {
        counts[i] -= 3;
        search(suitIdx, currentMelds + 1, currentTaatsu, hasPair, idx);
        counts[i] += 3;
      }

      // 2. 尝试顺子 (Sequence)
      if (idx <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
        counts[i]--; counts[i + 1]--; counts[i + 2]--;
        search(suitIdx, currentMelds + 1, currentTaatsu, hasPair, idx);
        counts[i]++; counts[i + 1]++; counts[i + 2]++;
      }

      // 3. 尝试搭子: 对子 (Pair as Taatsu)
      if (counts[i] >= 2) {
        counts[i] -= 2;
        search(suitIdx, currentMelds, currentTaatsu + 1, hasPair, idx);
        counts[i] += 2;
      }

      // 4. 尝试搭子: 两面/边张 (i, i+1)
      if (idx <= 7 && counts[i + 1] > 0) {
        counts[i]--; counts[i + 1]--;
        search(suitIdx, currentMelds, currentTaatsu + 1, hasPair, idx);
        counts[i]++; counts[i + 1]++;
      }

      // 5. 尝试搭子: 嵌张 (i, i+2)
      if (idx <= 6 && counts[i + 2] > 0) {
        counts[i]--; counts[i + 2]--;
        search(suitIdx, currentMelds, currentTaatsu + 1, hasPair, idx);
        counts[i]++; counts[i + 2]++;
      }

      // 6. 作为孤张跳过
      counts[i]--;
      search(suitIdx, currentMelds, currentTaatsu, hasPair, idx);
      counts[i]++;
    }

    search(0, 0, 0, false, 0);

    for (let i = 0; i < 27; i++) {
      const t = MJ.indexToTile(i);
      if (t[0] === lack) continue;
      if (counts[i] >= 2) {
        counts[i] -= 2;
        search(0, 0, 0, true, 0);
        counts[i] += 2;
      }
    }

    return Math.max(0, minShanten);
  }

  // 综合向听数
  function calcShanten(hand, meldCount, lack) {
    if (hand.length % 3 === 1) {
      const waits = MJ.tenpai(hand, meldCount, lack);
      if (waits.length > 0) return 0;
    }
    const counts = MJ.toCounts(hand);
    let reg = calcRegularShanten(counts, meldCount, lack);
    if (reg === 0 && hand.length % 3 === 1) reg = 1;
    if (meldCount === 0 && hand.length === 13) {
      const sp = calcSevenPairsShanten(counts, lack);
      return Math.min(reg, sp);
    }
    return reg;
  }

  // ---- 3. 全局有效进张与期望算力 (Uke-ire Calculator) ----
  function calcUkeire(hand, meldCount, lack, game, seat) {
    const currentShanten = calcShanten(hand, meldCount, lack);
    let effectiveCount = 0;
    const effectiveTiles = [];

    if (currentShanten === 0) {
      const waits = MJ.tenpai(hand, meldCount, lack);
      for (const w of waits) {
        const unseen = getUnseenCount(game, seat, w);
        effectiveCount += unseen;
        effectiveTiles.push({ tile: w, unseen });
      }
      return { shanten: 0, ukeire: effectiveCount, effectiveTiles };
    }

    const counts = MJ.toCounts(hand);

    for (let i = 0; i < 27; i++) {
      const t = MJ.indexToTile(i);
      if (t[0] === lack) continue;

      counts[i]++;
      const newHand = hand.concat(t);

      let improves = false;
      const newCounts = counts.slice();
      for (let j = 0; j < 27; j++) {
        if (newCounts[j] <= 0) continue;
        newCounts[j]--;
        const tempHand = newHand.filter((x, idx) => idx !== newHand.indexOf(MJ.indexToTile(j)));
        const sh = calcShanten(tempHand, meldCount, lack);
        if (sh < currentShanten) {
          improves = true;
          break;
        }
        newCounts[j]++;
      }

      counts[i]--;

      if (improves) {
        const unseen = getUnseenCount(game, seat, t);
        effectiveCount += unseen;
        effectiveTiles.push({ tile: t, unseen });
      }
    }

    return {
      shanten: currentShanten,
      ukeire: effectiveCount,
      effectiveTiles,
    };
  }

  // ---- 4. 智能定缺深度评估 (chooseLack) ----
  function chooseLack(hand) {
    const bySuit = { m: [], p: [], s: [] };
    for (const t of hand) {
      if (t && bySuit[t[0]]) bySuit[t[0]].push(t);
    }

    for (const s of MJ.SUITS) {
      if (bySuit[s].length === 0) return s;
    }
    for (const s of MJ.SUITS) {
      if (bySuit[s].length === 1) return s;
    }

    let worstSuit = 's';
    let minScore = Infinity;

    for (const s of MJ.SUITS) {
      const tiles = bySuit[s];
      const count = tiles.length;

      const remainingHand = hand.filter(t => t[0] !== s);
      const remainingShanten = calcShanten(remainingHand, 0, s);
      const structuralValue = evalSuitStructure(tiles);

      const isQingPotential = (count >= 8 && structuralValue >= 50);
      const qingPenalty = isQingPotential ? 1000 : 0;

      const score = (count * 20 + structuralValue * 1.2 + qingPenalty) - remainingShanten * 15;

      if (score < minScore) {
        minScore = score;
        worstSuit = s;
      }
    }

    return worstSuit;
  }

  function evalSuitStructure(tiles) {
    if (tiles.length === 0) return 0;
    const counts = MJ.toCounts(tiles);
    let v = 0;
    for (let i = 0; i < 27; i++) {
      if (counts[i] === 0) continue;
      const inSuit = i % 9;
      if (counts[i] >= 3) v += 35;
      else if (counts[i] === 2) v += 18;

      if (inSuit <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) v += 25;
      else if (inSuit <= 7 && counts[i + 1] > 0) v += (inSuit === 0 || inSuit === 7) ? 10 : 16;
      else if (inSuit <= 6 && counts[i + 2] > 0) v += 9;
    }
    return v;
  }

  // ---- 5. 攻守兼备防守与危险度模型 (Push-Fold Defense) ----
  function evalTileDanger(game, seat, tile, lack) {
    if (!game || tile[0] === lack) return 0;

    const visible = countVisibleTiles(game, tile);
    if (visible >= 3) return 1;
    if (visible === 2) return 6;

    let danger = 25;
    const n = +tile[1];
    const s = tile[0];

    if (n === 1 || n === 9) danger -= 10;
    else if (n === 2 || n === 8) danger -= 5;
    else danger += 15;

    for (let p = 0; p < 4; p++) {
      if (p === seat || game.players[p].out) continue;
      const opp = game.players[p];
      const mCount = opp.melds.length;

      if (mCount >= 1 && opp.melds.every(m => m.tiles[0][0] === s)) {
        danger += mCount * 30;
      } else if (mCount >= 2) {
        danger += mCount * 12;
      }

      if (opp.discards.slice(-3).includes(tile)) {
        danger -= 18;
      }
    }

    const wallRem = (typeof game.wall !== 'undefined') ? (game.wall.length - game.wallPtr - game.wallEnd) : 30;
    if (wallRem < 20) danger *= 1.4;
    if (wallRem < 10) danger *= 1.8;

    return Math.max(1, danger);
  }

  function calcPushFoldWeight(handShanten, expectedFan, threatLevel, level) {
    const L = LEVELS[level] || LEVELS.normal;
    if (handShanten === 0) {
      if (expectedFan >= 4) return 0.05;
      return threatLevel >= 5 ? 0.4 : 0.15;
    }
    if (handShanten === 1) {
      return threatLevel >= 4 ? (0.65 * L.defendWeight) : (0.3 * L.defendWeight);
    }
    return Math.min(1.0, 0.85 * L.defendWeight);
  }

  // 判定手牌是否具备合理的清一色可行性 (避免手牌杂牌过多或已碰杂门牌时误判)
  function evalQingPotential(hand, melds, lack) {
    const nonLackSuits = MJ.SUITS.filter(s => s !== lack);
    if (!nonLackSuits || nonLackSuits.length < 2) return null;

    const meldCount = melds.length;

    for (const s of nonLackSuits) {
      // 1. 若已有任何非目标花色的副露，则绝对无法做该花色的清一色！
      const hasClutterMeld = melds.some(m => m.tiles[0][0] !== s);
      if (hasClutterMeld) continue;

      const inHand = hand.filter(t => t[0] === s).length;
      const inMelds = melds.filter(m => m.tiles[0][0] === s).length * 3;
      const totalSuitCount = inHand + inMelds;
      const otherSuit = nonLackSuits.find(x => x !== s);
      const otherInHand = hand.filter(t => t[0] === otherSuit).length;

      // 2. 根据手牌中杂牌（另一门）数量及手牌纯度判定清一色可行性：
      // - 门清 (0副露，手牌13~14张)：手牌中该花色必须 >= 9 张（杂牌 <= 4 张，且手牌纯度 >= 69%）
      // - 1副露 (手牌10~11张)：手牌中该花色必须 >= 8 张（杂牌 <= 2~3 张，手牌纯度 >= 75%）
      // - 2副露 (手牌7~8张)：手牌中该花色必须 >= 6 张（杂牌 <= 1~2 张，手牌纯度 >= 80%）
      // - 3副露 (手牌4~5张)：手牌中该花色必须 >= 3~4 张（杂牌 <= 1 张）
      let isViable = false;
      if (meldCount === 0) {
        if (inHand >= 9 && otherInHand <= 4) isViable = true;
        else if (inHand >= 8 && otherInHand <= 3) isViable = true;
      } else if (meldCount === 1) {
        if (inHand >= 8 && otherInHand <= 3) isViable = true;
      } else if (meldCount === 2) {
        if (inHand >= 6 && otherInHand <= 2) isViable = true;
      } else if (meldCount >= 3) {
        if (inHand >= 3 && otherInHand <= 1) isViable = true;
      }

      if (isViable) {
        return {
          suit: s,
          inHand,
          inMelds,
          totalSuitCount,
          otherSuit,
          otherInHand,
        };
      }
    }
    return null;
  }

  // ---- 6. 核心弃牌决策引擎 (chooseDiscard) ----
  function chooseDiscard(game, seat, level) {
    const L = LEVELS[level] || LEVELS.normal;
    const pl = game.players[seat];
    const hand = pl.hand.slice();
    const lack = pl.lack;

    const lackTiles = hand.filter(t => t[0] === lack);
    if (lackTiles.length > 0) {
      lackTiles.sort((a, b) => {
        const countA = hand.filter(x => x === a).length;
        const countB = hand.filter(x => x === b).length;
        if (countA !== countB) return countA - countB;
        const distA = Math.min(Math.abs(+a[1] - 1), Math.abs(+a[1] - 9));
        const distB = Math.min(Math.abs(+b[1] - 1), Math.abs(+b[1] - 9));
        return distA - distB;
      });
      return lackTiles[0];
    }

    const meldCount = pl.melds.length;
    const nonLackSuits = MJ.SUITS.filter(s => s !== lack);

    const qingInfo = evalQingPotential(hand, pl.melds, lack);

    let threat = 0;
    for (let p = 0; p < 4; p++) {
      if (p === seat || game.players[p].out) continue;
      threat += game.players[p].melds.length * 1.5;
    }

    const currentShanten = calcShanten(hand, meldCount, lack);
    const defendWeight = calcPushFoldWeight(currentShanten, 2, threat, level);

    const candidates = [...new Set(hand)];
    let bestDiscard = candidates[0];
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      const cIdx = hand.indexOf(candidate);
      const tempHand = hand.slice();
      tempHand.splice(cIdx, 1);

      const ukeInfo = calcUkeire(tempHand, meldCount, lack, game, seat);
      const afterShanten = ukeInfo.shanten;
      const ukeire = ukeInfo.ukeire;

      let attackScore = (8 - afterShanten) * 1000 + ukeire * 15;

      // 清一色战略加分 (仅在符合严苛清一色可行性时触发)
      if (qingInfo && candidate[0] === qingInfo.otherSuit && Math.random() < L.qingTendency) {
        attackScore += 350;
      }

      const counts = MJ.toCounts(tempHand);
      for (let i = 0; i < 27; i++) {
        if (counts[i] === 4) attackScore += 80;
        else if (counts[i] === 3) attackScore += 40;
      }

      const danger = evalTileDanger(game, seat, candidate, lack);
      const defenseScore = -danger * 18;

      let totalScore = (1 - defendWeight) * attackScore + defendWeight * defenseScore;

      if (level !== 'hard' && Math.random() > L.smartLevel) {
        totalScore += (Math.random() - 0.5) * 200;
      }

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestDiscard = candidate;
      }
    }

    return bestDiscard;
  }

  // ---- 7. 自摸与杠牌决策 (act) ----
  function act(game, seat, level) {
    const L = LEVELS[level] || LEVELS.normal;
    const G = (typeof root.MJG !== 'undefined' ? root.MJG : require('./game.js'));
    const acts = G.actActions(game, seat);

    const tsumo = acts.find(a => a.type === 'tsumo');
    if (tsumo) return tsumo;

    const kong = acts.find(a => a.type === 'ankong' || a.type === 'addkong');
    if (kong && Math.random() < L.kongProb) {
      return kong;
    }

    return { type: 'discard', tile: chooseDiscard(game, seat, level) };
  }

  // ---- 8. 副露决策 (碰 / 杠 / 胡 / 过) ----
  function claim(game, seat, level) {
    const L = LEVELS[level] || LEVELS.normal;
    const G = (typeof root.MJG !== 'undefined' ? root.MJG : require('./game.js'));
    const opts = G.claimActions(game, seat);
    if (!opts.length) return { type: 'pass' };

    const pl = game.players[seat];
    const tile = game.pendingDiscard;
    if (!tile || tile[0] === pl.lack) return { type: 'pass' };

    const hu = opts.find(o => o.type === 'hu');
    if (hu) return hu;

    const kong = opts.find(o => o.type === 'kong');
    if (kong && Math.random() < L.kongProb) {
      return kong;
    }

    const pung = opts.find(o => o.type === 'pung');
    if (pung) {
      const counts = MJ.toCounts(pl.hand);

      let pairCount = 0;
      for (let i = 0; i < 27; i++) if (counts[i] >= 2) pairCount++;
      if (pl.melds.length === 0 && pairCount >= 4) {
        return { type: 'pass' };
      }

      const qingInfo = evalQingPotential(pl.hand, pl.melds, pl.lack);
      if (qingInfo && tile[0] !== qingInfo.suit) {
        return { type: 'pass' }; // 正在冲刺清一色，拒碰杂门牌
      }
      if (qingInfo && tile[0] === qingInfo.suit) {
        return pung; // 碰目标清一色花色，催化清一色
      }

      const currentSh = calcShanten(pl.hand, pl.melds.length, pl.lack);
      const tempHand = pl.hand.filter(t => t !== tile);
      const countInHand = pl.hand.filter(t => t === tile).length;
      for (let k = 0; k < countInHand - 2; k++) tempHand.push(tile);

      const afterSh = calcShanten(tempHand, pl.melds.length + 1, pl.lack);

      if (afterSh <= currentSh && Math.random() < L.smartLevel) {
        return pung;
      }
    }

    return { type: 'pass' };
  }

  // ============================================================
  // ---- 8.5 换三张深度策略引擎 (chooseSwap3 & analyzeSwapAdvice) ----
  // ============================================================
  function evalTileKeepValue(tile, handInSuit) {
    const n = +tile[1];
    const counts = MJ.toCounts(handInSuit);
    const idx = MJ.tileIndex(tile);
    const inSuit = idx % 9;

    let value = 0;
    if (counts[idx] >= 3) value += 40;
    else if (counts[idx] === 2) value += 20;

    const hasPrev2 = (inSuit >= 2 && counts[idx - 2] > 0);
    const hasPrev1 = (inSuit >= 1 && counts[idx - 1] > 0);
    const hasNext1 = (inSuit <= 7 && counts[idx + 1] > 0);
    const hasNext2 = (inSuit <= 6 && counts[idx + 2] > 0);

    if (hasPrev1 && hasNext1) value += 30; // 顺子中张 (如4在345)
    if (hasPrev2 && hasPrev1) value += 28; // 顺子边张 (如5在345)
    if (hasNext1 && hasNext2) value += 28; // 顺子边张 (如3在345)

    if (inSuit >= 1 && inSuit <= 7 && (hasPrev1 || hasNext1)) {
      if (inSuit >= 2 && inSuit <= 6) value += 16; // 优质两面搭子 (如34, 45, 56)
      else value += 12; // 23 或 78 搭子
    }
    if (hasPrev2 || hasNext2) value += 8; // 嵌张搭子 (如13, 24)
    if ((inSuit === 0 && hasNext1) || (inSuit === 8 && hasPrev1)) value += 6; // 边张搭子 (如12, 89)

    // 孤张判定 (1/9 幺九最易舍弃换出)
    if (inSuit === 0 || inSuit === 8) value -= 5;
    else if (inSuit === 1 || inSuit === 7) value -= 2;
    else value += 2;

    return value;
  }

  function chooseSwap3InSuit(handInSuit) {
    const scored = handInSuit.map(t => ({
      tile: t,
      val: evalTileKeepValue(t, handInSuit),
      n: +t[1],
      dist: Math.min(Math.abs(+t[1] - 1), Math.abs(+t[1] - 9))
    }));

    scored.sort((a, b) => {
      if (a.val !== b.val) return a.val - b.val;
      if (a.dist !== b.dist) return a.dist - b.dist;
      return a.n - b.n;
    });

    return scored.slice(0, 3).map(s => s.tile);
  }

  function evaluateSuitForSwap(suit, hand) {
    const handInSuit = hand.filter(t => t[0] === suit);
    if (handInSuit.length < 3) return null;

    const count = handInSuit.length;
    const picked3 = chooseSwap3InSuit(handInSuit);
    const suitStructure = evalSuitStructure(handInSuit);

    let otherMaxSuitCount = 0;
    for (const s of MJ.SUITS) {
      if (s !== suit) {
        const c = hand.filter(t => t[0] === s).length;
        if (c > otherMaxSuitCount) otherMaxSuitCount = c;
      }
    }

    let desirability = 1000;
    let tag = "✨ 优化牌姿";
    let reason = "";

    if (count === 3) {
      desirability += 600;
      tag = "🚀 完美清门 (开局清缺)";
      const tileNames = picked3.map(MJ.tileName).join("、");
      reason = "推荐换出【" + MJ.SUIT_NAMES[suit] + "】花色的【" + tileNames + "】。你手中仅有 3 张" + MJ.SUIT_NAMES[suit] + "字散牌（无成型顺子/刻子搭子），全数换出后手牌该门彻底归零，定缺直接清空该门，开局两门牌运转极度顺畅，极速上听！";
    } else if (otherMaxSuitCount >= 8) {
      desirability += 500;
      tag = "💎 冲刺清一色 (除杂留纯)";
      const tileNames = picked3.map(MJ.tileName).join("、");
      let dominant = MJ.SUITS.find(s => s !== suit && hand.filter(t => t[0] === s).length === otherMaxSuitCount) || "s";
      reason = "你手牌中【" + MJ.SUIT_NAMES[dominant] + "】花色多达 " + otherMaxSuitCount + " 张，具备顶级清一色底子！果断换出杂门【" + MJ.SUIT_NAMES[suit] + "】（【" + tileNames + "】），剔除杂牌，全力冲刺【清一色】(4番/8分，满盘翻8倍)！";
    } else if (count <= 5) {
      desirability += 200;
      tag = "🛡️ 弃弱留强 (削减杂门)";
      const tileNames = picked3.map(MJ.tileName).join("、");
      reason = "手牌中【" + MJ.SUIT_NAMES[suit] + "】花色共有 " + count + " 张，换出其中最弱的 3 张孤张/边张【" + tileNames + "】后，剩余手牌顺子与对子搭子极其完整，手牌张力最大化！";
    } else {
      const tileNames = picked3.map(MJ.tileName).join("、");
      reason = "换出【" + MJ.SUIT_NAMES[suit] + "】花色的【" + tileNames + "】，整体保留手牌关键搭子。";
    }

    desirability -= suitStructure * 2.5;
    if (count >= 7) desirability -= 800;
    if (count >= 9) desirability -= 2000;

    return {
      suit,
      suitName: MJ.SUIT_NAMES[suit],
      count,
      tiles: picked3,
      tag,
      score: desirability,
      reason,
    };
  }

  function chooseSwap3(hand) {
    const candidates = [];
    for (const s of MJ.SUITS) {
      const evalRes = evaluateSuitForSwap(s, hand);
      if (evalRes) candidates.push(evalRes);
    }
    if (!candidates.length) return [];
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].tiles;
  }

  function analyzeSwapAdvice(hand) {
    const candidates = [];
    for (const s of MJ.SUITS) {
      const evalRes = evaluateSuitForSwap(s, hand);
      if (evalRes) candidates.push(evalRes);
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    return {
      tiles: best.tiles,
      suit: best.suit,
      suitName: best.suitName,
      tag: best.tag,
      star: "★★★★★",
      reason: best.reason,
      macroStrategy: "🎯 换三张核心策略：优先换出恰好3张的孤张杂门，彻底清空一门定缺；若单门极长(>=8张)，坚决换出杂门冲刺清一色大番！",
      candidates,
    };
  }

  // ============================================================
  // ---- 9. 雀神 AI 教练可解释性教学与推荐系统 (analyzeHandAdvice) ----
  // ============================================================
  function analyzeHandAdvice(game, seat) {
    seat = seat !== undefined ? seat : 0;
    const pl = game.players[seat];
    const hand = pl.hand.slice();
    const lack = pl.lack;
    const meldCount = pl.melds.length;
    const nonLackSuits = MJ.SUITS.filter(s => s !== lack);

    // 1. 缺门检查
    const lackTiles = hand.filter(t => t[0] === lack);
    if (lackTiles.length > 0) {
      const uniqueLacks = [...new Set(lackTiles)];
      const rankedLacks = uniqueLacks.map(t => {
        const count = hand.filter(x => x === t).length;
        const dist = Math.min(Math.abs(+t[1] - 1), Math.abs(+t[1] - 9));
        return { tile: t, count, dist, name: MJ.tileName(t) };
      }).sort((a, b) => a.count !== b.count ? a.count - b.count : a.dist - b.dist);

      const best = rankedLacks[0].tile;
      const advice = {
        tile: best,
        tileName: MJ.tileName(best),
        tileFace: MJ.tileFace(best),
        tag: '🚫 强制打缺',
        star: '★★★★★',
        reason: `手牌中仍有定缺花色【${MJ.SUIT_NAMES[lack]}】共 ${lackTiles.length} 张。四川麻将核心规则强制要求：有缺门牌必须优先出完才能胡牌。建议先打出孤张/幺九【${MJ.tileName(best)}】，迅速清门！`,
        afterShantenText: '出缺阶段',
        ukeireCount: 0,
        effectiveTiles: [],
        dangerText: '缺门必出',
        macroStrategy: `当前阶段为【清缺阶段】。请尽快将手中所有【${MJ.SUIT_NAMES[lack]}】打出，防止终局流局被判【查花猪】(赔 16 分满番)。`,
      };

      return {
        bestDiscard: best,
        bestAdvice: advice,
        ranking: rankedLacks.map(r => ({
          tile: r.tile,
          tileName: r.name,
          tileFace: MJ.tileFace(r.tile),
          tag: '🚫 强制打缺',
          star: '★★★★★',
          score: 100 - r.count * 10 - r.dist,
          afterShanten: 9,
          afterShantenText: '清缺中',
          ukeireCount: 0,
          danger: 0,
          dangerText: '缺门必出',
          reason: `手牌中仍有定缺花色【${MJ.SUIT_NAMES[lack]}】共 ${lackTiles.length} 张。四川麻将规则强制要求有缺先打，避免终局流局【查花猪】(赔16分满番)。建议打出孤张/幺九【${r.name}】！`,
        })),
        macroStrategy: advice.macroStrategy,
      };
    }

    // 2. 统计大番走向与严谨的清一色可行性判定
    const qingInfo = evalQingPotential(hand, pl.melds, lack);
    const qingSuit = qingInfo ? qingInfo.suit : null;

    const counts = MJ.toCounts(hand);
    let pairCount = 0;
    for (let i = 0; i < 27; i++) if (counts[i] >= 2) pairCount++;
    const isSevenPairPotential = (meldCount === 0 && pairCount >= 4);

    let maxOppMeld = 0;
    let threateningOpp = null;
    for (let p = 0; p < 4; p++) {
      if (p === seat || game.players[p].out) continue;
      const mc = game.players[p].melds.length;
      if (mc > maxOppMeld) {
        maxOppMeld = mc;
        threateningOpp = game.players[p];
      }
    }

    const currentShanten = calcShanten(hand, meldCount, lack);
    const candidates = [...new Set(hand)];
    const rankedList = [];

    for (const candidate of candidates) {
      const cIdx = hand.indexOf(candidate);
      const tempHand = hand.slice();
      tempHand.splice(cIdx, 1);

      const ukeInfo = calcUkeire(tempHand, meldCount, lack, game, seat);
      const afterShanten = ukeInfo.shanten;
      const ukeire = ukeInfo.ukeire;
      const danger = evalTileDanger(game, seat, candidate, lack);
      const visible = countVisibleTiles(game, candidate);

      let attackScore = (8 - afterShanten) * 1000 + ukeire * 15;
      const isQingDiscard = qingSuit && candidate[0] !== qingSuit;
      if (isQingDiscard) attackScore += 350;

      let score = attackScore - danger * 12;

      let tag = '🚀 进张最大化';
      let reason = '';
      const cName = MJ.tileName(candidate);
      const cFace = MJ.tileFace(candidate);

      const shantenMap = ['听牌', '一向听', '二向听', '三向听', '四向听'];
      const shantenStr = shantenMap[afterShanten] || (afterShanten + '向听');

      if (afterShanten === 0) {
        tag = '⚡ 立即听牌';
        const waitsStr = ukeInfo.effectiveTiles.map(e => `${MJ.tileShortName(e.tile)}(余${e.unseen}张)`).join('、');
        reason = `打出【${cName}】后立即进入【听牌】状态！胡牌张为：${waitsStr} (共 ${ukeire} 张)。胡牌概率极高，建议立即打出！`;
      } else if (qingInfo && isSevenPairPotential && isQingDiscard) {
        tag = '💎 清七对极品规划';
        reason = `手中已有 ${pairCount} 个对子且【${MJ.SUIT_NAMES[qingSuit]}】占比极高，极有希望做出顶级大番【清七对】(6番/32分)！打出杂门单张【${cName}】，兼顾暗七对与清一色双重收益！`;
      } else if (qingInfo && isQingDiscard) {
        tag = '💎 清一色大番规划';
        const meldText = qingInfo.inMelds > 0 ? `（含已副露 ${qingInfo.inMelds} 张，共 ${qingInfo.totalSuitCount} 张）` : '';
        reason = `手牌中已有 ${qingInfo.inHand} 张【${MJ.SUIT_NAMES[qingSuit]}】${meldText}，杂门仅剩 ${qingInfo.otherInHand} 张！果断打出杂门牌【${cName}】，全力冲刺【清一色】(4番/8分，满盘翻8倍)，收益远超混门平胡！`;
      } else if (isSevenPairPotential && counts[MJ.tileIndex(candidate)] === 1) {
        tag = '🀄 暗七对单张取舍';
        reason = `当前门清且已持有 ${pairCount} 个对子，正处于【暗七对】(4番) 黄金成型期！打出单张【${cName}】，完整保护手中全部对子，向暗七对稳步推进。`;
      } else if (danger <= 5 && maxOppMeld >= 2) {
        tag = '🛡️ 绝张安全防守';
        reason = `【${threateningOpp ? threateningOpp.name : '对手'}】副露较多疑似听牌！手中【${cName}】场上已现 ${visible} 张（绝张/极熟张），打出安全性极高，有效避免在未叫时给对手放炮！`;
      } else {
        const topEff = ukeInfo.effectiveTiles.slice(0, 4).map(e => `${MJ.tileShortName(e.tile)}(余${e.unseen})`).join('、');
        reason = `打出【${cName}】后进入【${shantenStr}】，全场有效进张共 ${ukeire} 张 (${topEff}${ukeInfo.effectiveTiles.length > 4 ? '等' : ''})。此打法进张面最宽、手牌运转最顺畅！`;
      }

      let star = '★★★★★';
      if (afterShanten >= 2) star = '★★★★☆';
      if (afterShanten >= 3) star = '★★★☆☆';

      rankedList.push({
        tile: candidate,
        tileName: cName,
        tileFace: cFace,
        tag,
        star,
        score,
        afterShanten,
        afterShantenText: shantenStr,
        ukeireCount: ukeire,
        effectiveTiles: ukeInfo.effectiveTiles,
        danger,
        dangerText: danger <= 6 ? '极安全' : (danger <= 25 ? '一般' : '较危险'),
        reason,
      });
    }

    rankedList.sort((a, b) => b.score - a.score);
    const best = rankedList[0];

    let macro = '当前阶段以【快速上听】为主，尽量保留两面顺子搭子与对子。';
    if (qingInfo && isSevenPairPotential) {
      macro = `🎯 核心战略：你手牌同时具备【暗七对】(${pairCount}对) 与【清一色】(${qingInfo.totalSuitCount}张${MJ.SUIT_NAMES[qingSuit]}) 双重底子，建议冲刺顶级大番【清七对】(6番/32分)！保持门清不碰牌，单张杂牌依次舍出。`;
    } else if (qingInfo) {
      const meldText = qingInfo.inMelds > 0 ? `（含已副露 ${qingInfo.inMelds} 张，共 ${qingInfo.totalSuitCount} 张）` : '';
      macro = `🎯 核心战略：你手牌中的【${MJ.SUIT_NAMES[qingSuit]}】花色占比极高${meldText}，建议坚定走【清一色】(4番/8分) 路线，将仅剩的杂牌尽数打出！`;
    } else if (isSevenPairPotential) {
      macro = `🎯 核心战略：你手中已有 ${pairCount} 个对子，建议坚持【暗七对】(4番) 路线，不碰牌、留对子，单张多余牌逐一舍出。`;
    } else if (maxOppMeld >= 3) {
      macro = `⚠️ 防守预警：【${threateningOpp ? threateningOpp.name : '对手'}】已副露 3 组牌，牌局进入深水区，若自身未听牌，建议优先跟打熟张防守！`;
    }

    return {
      bestDiscard: best.tile,
      bestAdvice: best,
      ranking: rankedList,
      macroStrategy: macro,
      currentShanten,
      pairCount,
      qingSuit,
    };
  }


  // ============================================================
  // ---- 10. 复盘走法质量评估与整局雀力分析引擎 (Game Review) ----
  // ============================================================
  function evaluateMoveQuality(handBefore, melds, lack, actualDiscard, gameSnapshot, seat) {
    seat = seat !== undefined ? seat : 0;
    const pl = {
      hand: handBefore.slice(),
      melds: (melds || []).map(m => ({ type: m.type, tiles: m.tiles.slice(), from: m.from, concealed: m.concealed })),
      discards: [],
      lack,
      out: false,
      isHuman: (seat === 0),
    };

    let mockGame = gameSnapshot;
    if (!mockGame || !mockGame.players) {
      mockGame = {
        players: [
          pl,
          { hand: [], melds: [], discards: [], out: false },
          { hand: [], melds: [], discards: [], out: false },
          { hand: [], melds: [], discards: [], out: false },
        ],
        wall: new Array(60),
        wallPtr: 0,
        wallEnd: 0,
      };
    }

    // 1. 定缺违规检查
    const lackTiles = handBefore.filter(t => t[0] === lack);
    if (lackTiles.length > 0 && actualDiscard[0] !== lack) {
      return {
        grade: "blunder",
        gradeLabel: "恶手",
        gradeText: "❌ 违规恶手 (违背强制定缺)",
        badgeCls: "grade-blunder",
        actualDiscard,
        bestDiscard: lackTiles[0],
        reason: "【严重恶手】手牌中尚有定缺【" + MJ.SUIT_NAMES[lack] + "】共 " + lackTiles.length + " 张！川麻核心规则强制必须优先打完缺门牌，否则终局流局将按【查花猪】赔满番 16 分！",
        diffUkeire: 0,
        diffShanten: 1,
        ranking: [],
      };
    }

    // 2. 雀神 AI 教练实时精算
    const advice = analyzeHandAdvice(mockGame, seat);
    const bestDiscard = advice.bestDiscard;
    const bestCand = advice.bestAdvice;

    if (actualDiscard === bestDiscard) {
      return {
        grade: "best",
        gradeLabel: "最佳",
        gradeText: "🌟 绝佳一手 (最佳选择)",
        badgeCls: "grade-best",
        actualDiscard,
        bestDiscard,
        reason: "【绝佳一手】精准打出【" + MJ.tileName(actualDiscard) + "】！进入【" + bestCand.afterShantenText + "】，有效进张 " + bestCand.ukeireCount + " 张最大化！",
        diffUkeire: 0,
        diffShanten: 0,
        ranking: advice.ranking,
      };
    }

    const match = advice.ranking && advice.ranking.find(r => r.tile === actualDiscard);
    if (!match) {
      return {
        grade: "blunder",
        gradeLabel: "恶手",
        gradeText: "❌ 恶手 (严重失误)",
        badgeCls: "grade-blunder",
        actualDiscard,
        bestDiscard,
        reason: "【恶手】打出【" + MJ.tileName(actualDiscard) + "】严重偏离最优路线。推荐打出【" + MJ.tileName(bestDiscard) + "】。",
        diffUkeire: 10,
        diffShanten: 1,
        ranking: advice.ranking,
      };
    }

    const diffShanten = match.afterShanten - bestCand.afterShanten;
    const diffUkeire = bestCand.ukeireCount - match.ukeireCount;

    if (diffShanten > 0) {
      return {
        grade: "blunder",
        gradeLabel: "恶手",
        gradeText: "❌ 恶手 (向听数倒退)",
        badgeCls: "grade-blunder",
        actualDiscard,
        bestDiscard,
        reason: "【恶手警告】你打出了【" + MJ.tileName(actualDiscard) + "】，导致手牌向听数由【" + bestCand.afterShantenText + "】倒退为【" + match.afterShantenText + "】（损失 " + diffUkeire + " 张有效进张）！拆散了关键顺子或搭子。AI 推荐打出【" + MJ.tileName(bestDiscard) + "】。",
        diffUkeire,
        diffShanten,
        ranking: advice.ranking,
      };
    }

    if (diffUkeire > 3) {
      return {
        grade: "inaccuracy",
        gradeLabel: "疑问手",
        gradeText: "⚠️ 疑问手 (次优选择)",
        badgeCls: "grade-inaccuracy",
        actualDiscard,
        bestDiscard,
        reason: "【疑问手】你打出了【" + MJ.tileName(actualDiscard) + "】（有效进张 " + match.ukeireCount + " 张）；若打出推荐的【" + MJ.tileName(bestDiscard) + "】可拥有 " + bestCand.ukeireCount + " 张有效进张（多出 " + diffUkeire + " 张进张机会）。",
        diffUkeire,
        diffShanten,
        ranking: advice.ranking,
      };
    }

    return {
      grade: "good",
      gradeLabel: "好手",
      gradeText: "✨ 好手 (优质走法)",
      badgeCls: "grade-good",
      actualDiscard,
      bestDiscard,
      reason: "【好手】打出【" + MJ.tileName(actualDiscard) + "】保持【" + match.afterShantenText + "】，有效进张 " + match.ukeireCount + " 张，与最佳打法差距极小。",
      diffUkeire,
      diffShanten,
      ranking: advice.ranking,
    };
  }

  function summarizeGameReview(history) {
    let bestCount = 0;
    let goodCount = 0;
    let inaccuracyCount = 0;
    let blunderCount = 0;
    let totalHumanDiscards = 0;
    const mistakeSteps = [];

    (history || []).forEach((frame, idx) => {
      if (frame.actionType === "discard" && frame.actor === 0 && frame.eval) {
        totalHumanDiscards++;
        const g = frame.eval.grade;
        if (g === "best") bestCount++;
        else if (g === "good") goodCount++;
        else if (g === "inaccuracy") {
          inaccuracyCount++;
          mistakeSteps.push(idx);
        } else if (g === "blunder") {
          blunderCount++;
          mistakeSteps.push(idx);
        }
      }
    });

    let accuracy = 100;
    if (totalHumanDiscards > 0) {
      const scoreSum = bestCount * 100 + goodCount * 80 + inaccuracyCount * 45 + blunderCount * 0;
      accuracy = Math.round(scoreSum / totalHumanDiscards);
    }

    let title = "🏆 雀神附体 · 大师级手牌掌控";
    let desc = "本局做牌思路极其精准，有效进张最大化，攻守兼备！";
    if (accuracy < 60) {
      title = "🌱 尚需打磨 · 建议巩固定缺与牌效";
      desc = "本局存在较多恶手或向听数倒退，多利用复盘排查关键失误点。";
    } else if (accuracy < 75) {
      title = "⚡ 进退有度 · 进阶实战水准";
      desc = "整体牌理较好，注意减少几手关键的疑问手，进张会更加流畅。";
    } else if (accuracy < 90) {
      title = "🎖️ 行云流水 · 职业级牌理";
      desc = "发挥十分出色，大部分出牌均与雀神 AI 精算高度契合！";
    }

    return {
      accuracy,
      title,
      desc,
      bestCount,
      goodCount,
      inaccuracyCount,
      blunderCount,
      totalHumanDiscards,
      mistakeSteps,
    };
  }

  const AI = {
    chooseLack,
    evalSuitStructure,
    evalTileDanger,
    calcShanten,
    calcUkeire,
    chooseDiscard,
    act,
    claim,
    chooseSwap3,
    analyzeSwapAdvice,
    chooseSwap3InSuit,
    evalTileKeepValue,
    analyzeHandAdvice,
    evaluateMoveQuality,
    summarizeGameReview,
    LEVELS,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
  root.MJAI = AI;
})(typeof window !== 'undefined' ? window : globalThis);
