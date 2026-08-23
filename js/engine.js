/* ============================================================
   四川麻将·血战到底 — 规则引擎 (纯逻辑, 浏览器/Node 通用)
   牌编码: m1..m9 万, p1..p9 筒, s1..s9 条 (共27种, 各4张=108)
   无字牌无花牌, 无吃, 仅碰/杠/胡, 必须定缺一门。
   ============================================================ */
(function (root) {
  'use strict';

  const SUITS = ['m', 'p', 's'];
  const SUIT_NAMES = { m: '万', p: '筒', s: '条' };
  const FACE = {
    m: ['🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏'],
    p: ['🀙','🀚','🀛','🀜','🀝','🀞','🀟','🀠','🀡'],
    s: ['🀐','🀑','🀒','🀓','🀔','🀕','🀖','🀗','🀘'],
  };

  const CHINESE_NUMS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  function tileFace(t) { return t ? FACE[t[0]][+t[1] - 1] : ''; }
  function tileName(t) { return t ? CHINESE_NUMS[+t[1]] + SUIT_NAMES[t[0]] : ''; }
  function tileShortName(t) { return t ? (+t[1]) + SUIT_NAMES[t[0]] : ''; }
  const isSuited = (t) => t && SUITS.includes(t[0]);
  const suitOf = (t) => t ? t[0] : '';
  const numOf = (t) => t ? +t[1] : 0;

  function tileIndex(t) {
    if (!t) return -1;
    const s = t[0], n = +t[1];
    if (s === 'm') return n - 1;
    if (s === 'p') return 9 + n - 1;
    if (s === 's') return 18 + n - 1;
    return -1;
  }
  function indexToTile(i) {
    if (i < 0 || i >= 27) return null;
    if (i < 9) return 'm' + (i + 1);
    if (i < 18) return 'p' + (i - 9 + 1);
    return 's' + (i - 18 + 1);
  }
  function toCounts(tiles) {
    const c = new Array(27).fill(0);
    for (const t of tiles) {
      const i = tileIndex(t);
      if (i >= 0) c[i]++;
    }
    return c;
  }

  function buildWall() {
    const w = [];
    for (const s of SUITS) {
      for (let n = 1; n <= 9; n++) {
        for (let k = 0; k < 4; k++) w.push(s + n);
      }
    }
    return w;
  }

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- 纯面子判定 (不含将, 用于判定单钓) ----
  function canFormPureMelds(counts, needMelds) {
    if (needMelds === 0) {
      return counts.every(c => c === 0);
    }
    let i = 0;
    while (i < 27 && counts[i] === 0) i++;
    if (i >= 27) return needMelds === 0;

    // 刻子
    if (counts[i] >= 3) {
      counts[i] -= 3;
      if (canFormPureMelds(counts, needMelds - 1)) {
        counts[i] += 3;
        return true;
      }
      counts[i] += 3;
    }
    // 顺子
    const inSuit = i % 9;
    if (inSuit <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
      counts[i]--; counts[i + 1]--; counts[i + 2]--;
      if (canFormPureMelds(counts, needMelds - 1)) {
        counts[i]++; counts[i + 1]++; counts[i + 2]++;
        return true;
      }
      counts[i]++; counts[i + 1]++; counts[i + 2]++;
    }
    return false;
  }

  // ---- 标准胡牌分解 (needMelds 组面子 + 1对将) ----
  function enumerate(counts, needMelds) {
    const results = [];
    if (needMelds === 0) {
      for (let p = 0; p < 27; p++) {
        if (counts[p] === 2) {
          const rest = counts.slice();
          rest[p] = 0;
          if (rest.every(c => c === 0)) {
            results.push([{ type: 'pair', idx: p }]);
          }
        }
      }
      return results;
    }

    function firstNonZero(c) {
      for (let i = 0; i < 27; i++) if (c[i] > 0) return i;
      return -1;
    }

    function melds(c, need, acc) {
      if (need === 0) {
        for (let i = 0; i < 27; i++) if (c[i] !== 0) return;
        results.push(acc.slice());
        return;
      }
      const i = firstNonZero(c);
      if (i < 0) return;
      // 刻子
      if (c[i] >= 3) {
        c[i] -= 3; acc.push({ type: 'pung', idx: i });
        melds(c, need - 1, acc);
        acc.pop(); c[i] += 3;
      }
      // 顺子
      const inSuit = i % 9;
      if (inSuit <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
        c[i]--; c[i + 1]--; c[i + 2]--;
        acc.push({ type: 'chow', idx: i });
        melds(c, need - 1, acc);
        acc.pop();
        c[i]++; c[i + 1]++; c[i + 2]++;
      }
      if (c[i] > 0) return;
    }

    for (let p = 0; p < 27; p++) {
      if (counts[p] >= 2) {
        counts[p] -= 2;
        melds(counts, needMelds, [{ type: 'pair', idx: p }]);
        counts[p] += 2;
      }
    }
    return results;
  }

  // 七对 / 龙七对 (仅无副露时有效, 14张)
  function isSevenPairs(counts) {
    let pairCount = 0;
    let fourCount = 0;
    for (let i = 0; i < 27; i++) {
      if (counts[i] === 0) continue;
      if (counts[i] === 4) {
        pairCount += 2;
        fourCount += 1;
      } else if (counts[i] === 2) {
        pairCount += 1;
      } else {
        return null;
      }
    }
    if (pairCount !== 7) return null;
    return { sevenPairs: true, dragonCount: fourCount };
  }

  // 判断 counts(手牌+胡牌, 不含副露) 是否胡牌
  function canHu(counts, meldCount) {
    meldCount = meldCount || 0;
    const total = counts.reduce((a, b) => a + b, 0);
    const expect = 14 - 3 * meldCount;
    if (total !== expect) return { ok: false };
    const needMelds = 4 - meldCount;

    // 七对仅当无副露且14张
    let sp = null;
    if (meldCount === 0 && total === 14) {
      sp = isSevenPairs(counts);
    }

    const decomps = enumerate(counts.slice(), needMelds);
    if (decomps.length > 0 || sp) {
      let allPungPossible = false;
      if (decomps.length) {
        allPungPossible = decomps.some(d => d.every(part => part.type === 'pung' || part.type === 'pair'));
      }
      const jinGouDiao = (meldCount === 4 && total === 2);
      return {
        ok: true,
        sevenPairs: !!sp,
        dragonCount: sp ? sp.dragonCount : 0,
        decomps,
        allPungPossible,
        jinGouDiao,
      };
    }
    return { ok: false };
  }

  // 手牌(不含副露)+一张测试牌 → 能否胡
  function canHuWith(handTiles, extraTile, meldCount) {
    return canHu(toCounts(handTiles.concat(extraTile)), meldCount).ok;
  }

  // 听牌查询: tiles为手牌(不含副露), meldCount为副露组数, lack为定缺花色
  function tenpai(tiles, meldCount, lack) {
    meldCount = meldCount || 0;
    if (lack && tiles.some(t => t[0] === lack)) return [];

    const waits = [];
    for (const s of SUITS) {
      if (s === lack) continue;
      for (let n = 1; n <= 9; n++) {
        const t = s + n;
        if (canHuWith(tiles, t, meldCount)) {
          waits.push(t);
        }
      }
    }
    return waits;
  }

  // 判定是否单钓将
  function isSingleWait(handTiles, winTile, meldCount) {
    meldCount = meldCount || 0;
    const needMelds = 4 - meldCount;
    if (needMelds === 0) return true; // 金钩钓必为单钓

    const c = toCounts(handTiles);
    const winIdx = tileIndex(winTile);
    if (winIdx < 0 || c[winIdx] < 2) return false;

    c[winIdx] -= 2;
    const ok = canFormPureMelds(c, needMelds);
    c[winIdx] += 2;
    return ok;
  }

  // ---- 番型计算 (血战到底, 加法累番制) ----
  function calcFan(params) {
    const {
      tiles, melds = [], winTile,
      selfDraw = false, afterKong = false, robbedKong = false,
      isTianHu = false, isDiHu = false, isHaiDi = false,
      maxFan = 8,
    } = params;

    const handTiles = tiles.slice();
    const allTiles = handTiles.slice();
    for (const m of melds) allTiles.push(...m.tiles);

    // 统计花色数
    const suitCount = { m: 0, p: 0, s: 0 };
    for (const t of allTiles) suitCount[t[0]]++;
    const suitsUsed = SUITS.filter(s => suitCount[s] > 0);
    const isQingYiSe = suitsUsed.length === 1;

    const meldCount = melds.length;
    const hu = canHu(toCounts(handTiles), meldCount);

    let sevenPairs = false;
    let dragonCount = 0;
    let allPung = false;
    let jinGouDiao = false;

    if (hu.ok) {
      if (hu.sevenPairs) {
        sevenPairs = true;
        dragonCount = hu.dragonCount;
      } else {
        allPung = hu.allPungPossible;
        jinGouDiao = hu.jinGouDiao;
      }
    }

    // 统计带根 (所有手牌+副露中，任意4张相同的牌算1根)
    const allCounts = toCounts(allTiles);
    let genCount = 0;
    for (let i = 0; i < 27; i++) {
      if (allCounts[i] === 4) genCount++;
    }

    let patternFan = 0;
    const descList = [];

    if (isTianHu) {
      patternFan = 6;
      descList.push('天胡 6番');
    } else if (isDiHu) {
      patternFan = 6;
      descList.push('地胡 6番');
    } else {
      if (isQingYiSe) {
        patternFan += 4;
        descList.push('清一色 4番');
      }
      if (sevenPairs) {
        patternFan += 4;
        descList.push('七对 4番');
      } else if (jinGouDiao) {
        patternFan += 4;
        descList.push('金钩钓 4番');
      } else if (allPung) {
        patternFan += 2;
        descList.push('对对胡 2番');
      }

      // 如果没有任何大牌型，则为基础平胡 1番
      if (patternFan === 0) {
        patternFan = 1;
        descList.push('平胡 1番');
      }
    }

    let extraFan = 0;

    // 根 (每根 +1番)
    if (genCount > 0) {
      extraFan += genCount;
      descList.push(genCount === 1 ? '带1根 +1番' : `带${genCount}根 +${genCount}番`);
    }

    // 自摸 / 杠上开花 / 杠上炮 / 抢杠 / 海底
    if (selfDraw) {
      extraFan += 1;
      descList.push('自摸 +1番');
    }
    if (selfDraw && afterKong) {
      extraFan += 1;
      descList.push('杠上开花 +1番');
    }
    if (!selfDraw && afterKong) {
      extraFan += 1;
      descList.push('杠上炮 +1番');
    }
    if (robbedKong) {
      extraFan += 1;
      descList.push('抢杠胡 +1番');
    }
    if (isHaiDi) {
      extraFan += 1;
      descList.push(selfDraw ? '海底捞月 +1番' : '海底炮 +1番');
    }

    let totalFan = patternFan + extraFan;

    if (maxFan && totalFan > maxFan) {
      descList.push(`(封顶 ${maxFan}番)`);
      totalFan = maxFan;
    }

    // 分值计算: 2^(fan-1)
    const score = Math.pow(2, Math.max(0, totalFan - 1));

    return {
      fan: totalFan,
      score,
      desc: descList,
      qing: isQingYiSe,
      allPung,
      sevenPairs,
      dragonCount,
      jinGouDiao,
      genCount,
      winTile,
    };
  }

  function tileDistance(a, b) {
    if (a[0] !== b[0]) return 99;
    return Math.abs(+a[1] - +b[1]);
  }

  const MJ = {
    SUITS, SUIT_NAMES, FACE, CHINESE_NUMS,
    tileFace, tileName, tileShortName, isSuited, suitOf, numOf,
    tileIndex, indexToTile, toCounts,
    buildWall, shuffle, makeRng,
    canFormPureMelds, enumerate, isSevenPairs, canHu, canHuWith, tenpai,
    isSingleWait, calcFan, tileDistance,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MJ;
  root.MJ = MJ;
})(typeof window !== 'undefined' ? window : globalThis);
