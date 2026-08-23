/* ============================================================
   四川麻将·血战到底 — UI 交互、高保真视觉与调度引擎
   特性:
   1. 高清拟真 3D 大字牌面、专属花色着色
   2. 全桌同牌联动金光高亮 (Hover / 选中时即时穿透显示)
   3. 智能富媒体听牌助手 (实时显示胡牌牌名、番数分值、全桌剩余未见张数)
   4. 对局节奏调控 (极速 / 标准 / 悠闲 自由切换)
   5. 全功能键盘快捷键 (空格出牌/过, H胡, P碰, K杠, 方向键选牌)
   6. 离散状态机调度锁与真实摸打节奏，支持连局对战
   ============================================================ */
(function () {
  'use strict';
  const MJ = window.MJ, MJAI = window.MJAI, G = window.MJG;

  let game = null;
  let selectedTile = null;        // 玩家当前选中的待出手牌
  let isBusy = false;             // 异步调度锁，防止并发操作
  let aiLevel = 'normal';
  let gameSpeed = 'normal';       // fast | normal | slow
  let round = 1;
  let dealer = 0;
  let totalScores = [0, 0, 0, 0];
  let soundEnabled = true;
  let coachEnabled = true;
  let coachCollapsed = false;
  let lastAdvice = null;
  let previewTile = null;
  let enableSwap = true;
  let swapSelectedTiles = [];
  let swapNewTiles = [];
  let swapAdvice = null;

  // 速度配置映射 (毫秒)
  const SPEED_CONFIG = {
    fast:   { step: 150, aiThink: 180, discard: 150, over: 400, waitAction: 150 },
    normal: { step: 300, aiThink: 400, discard: 320, over: 750, waitAction: 250 },
    slow:   { step: 550, aiThink: 700, discard: 500, over: 1000, waitAction: 400 },
  };

  function getTiming() {
    return SPEED_CONFIG[gameSpeed] || SPEED_CONFIG.normal;
  }

  // ---- 1. Web Audio API 音效合成引擎 ----
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      if (type === 'tap') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(750, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.04);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.04);

      } else if (type === 'discard') {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(400, now);
        osc1.frequency.exponentialRampToValueAtTime(90, now + 0.08);
        osc2.frequency.setValueAtTime(820, now);
        osc2.frequency.exponentialRampToValueAtTime(150, now + 0.06);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.08);
        osc2.stop(now + 0.08);

      } else if (type === 'draw') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.05);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);

      } else if (type === 'pung' || type === 'kong') {
        [0, 0.06].forEach((delay, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = idx === 0 ? 'sawtooth' : 'triangle';
          osc.frequency.setValueAtTime(idx === 0 ? 520 : 680, now + delay);
          osc.frequency.exponentialRampToValueAtTime(180, now + delay + 0.1);
          gain.gain.setValueAtTime(0.3, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.1);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + delay);
          osc.stop(now + delay + 0.1);
        });

      } else if (type === 'hu') {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          const t = now + i * 0.11;
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.28);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.28);
        });

      } else if (type === 'btn') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.03);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.03);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.03);
      }
    } catch (e) {
      // 忽略音频异常
    }
  }

  // ---- 2. DOM 快捷方法 ----
  const $ = (id) => document.getElementById(id);


  function updateSwapBtn() {
    const btn = $('swapToggleBtn');
    if (!btn) return;
    if (enableSwap) {
      btn.classList.add('active');
      btn.textContent = '🔀 换三张: 开';
    } else {
      btn.classList.remove('active');
      btn.textContent = '🔀 换三张: 关';
    }
  }

  function updateCoachBtn() {
    const btn = $('coachBtn');
    if (!btn) return;
    if (coachEnabled) {
      btn.classList.add('active');
      btn.textContent = '🤖 教练: 开';
    } else {
      btn.classList.remove('active');
      btn.textContent = '🤖 教练: 关';
    }
  }

  function init() {
    $('newGameBtn').onclick = () => {
      playSound('btn');
      round = 1;
      dealer = 0;
      totalScores = [0, 0, 0, 0];
      startRound();
    };

    $('nextRoundBtn').onclick = () => {
      playSound('btn');
      nextRound();
    };

    $('aiLevelSelect').onchange = (e) => {
      aiLevel = e.target.value;
      if (game) game.aiLevel = aiLevel;
    };

    $('gameSpeedSelect').onchange = (e) => {
      gameSpeed = e.target.value;
    };

    $('soundBtn').onclick = () => {
      soundEnabled = !soundEnabled;
      $('soundBtn').textContent = soundEnabled ? '🔊' : '🔇';
      playSound('btn');
    };

    $('swapToggleBtn').onclick = () => {
      enableSwap = !enableSwap;
      updateSwapBtn();
      playSound('btn');
      flashLog(enableSwap ? '开局换三张规则已开启' : '开局换三张规则已关闭');
    };

    $('swapAutoSelectBtn').onclick = () => {
      if (!swapAdvice || !swapAdvice.tiles) return;
      playSound('tap');
      swapSelectedTiles = swapAdvice.tiles.slice();
      updateSwapModalState();
    };

    $('confirmSwapBtn').onclick = () => {
      onConfirmSwap();
    };

    $('closeSwapRevealBtn').onclick = () => {
      playSound('btn');
      $('swapRevealModal').classList.add('hidden');
      render();
      showLackModal();
    };

    $('coachBtn').onclick = () => {
      coachEnabled = !coachEnabled;
      updateCoachBtn();
    updateSwapBtn();
      playSound('btn');
      flashLog(coachEnabled ? '雀神 AI 教练已开启 (快捷键 T)' : '雀神 AI 教练已关闭 (快捷键 T)');
      render();
    };

    $('coachCollapseBtn').onclick = () => {
      coachCollapsed = !coachCollapsed;
      $('coachPanel').classList.toggle('collapsed', coachCollapsed);
      $('coachCollapseBtn').textContent = coachCollapsed ? '▴' : '▾';
      playSound('btn');
    };

    $('rulesBtn').onclick = () => {
      playSound('btn');
      $('rulesModal').classList.remove('hidden');
    };

    $('closeRulesBtn').onclick = () => {
      playSound('btn');
      $('rulesModal').classList.add('hidden');
    };

    document.querySelectorAll('.lack-btn').forEach(b => {
      b.onclick = () => {
        playSound('btn');
        onHumanLack(b.dataset.lack);
      };
    });

    document.querySelectorAll('.act-btn').forEach(b => {
      b.onclick = () => {
        const bar = $('actionBar');
        const act = b.dataset.act;
        if (bar._claimMode) onClaimAction(act);
        else onSelfAction(act);
      };
    });

    // 键盘全局快捷键
    window.addEventListener('keydown', onKeyDown);

    startRound();
  }

  // ---- 3. 键盘快捷键监听 ----
  function onKeyDown(e) {
    if (e.repeat) return;
    const key = e.key;

    // T: 切换雀神 AI 教练
    if (key === 't' || key === 'T') {
      const cBtn = $('coachBtn');
      if (cBtn) cBtn.click();
      return;
    }

    // Esc: 关闭弹窗或过牌
    if (key === 'Escape') {
      const rules = $('rulesModal');
      if (!rules.classList.contains('hidden')) {
        rules.classList.add('hidden');
        return;
      }
      const bar = $('actionBar');
      if (!bar.classList.contains('hidden') && bar._claimMode) {
        onClaimAction('pass');
        return;
      }
    }

    // 副露或自摸操作栏快捷键
    const bar = $('actionBar');
    if (bar && !bar.classList.contains('hidden')) {
      if (key === 'h' || key === 'H') {
        const huBtn = bar.querySelector('.act-btn[data-act="hu"]');
        if (huBtn && huBtn.style.display !== 'none') {
          huBtn.click();
          return;
        }
      }
      if (key === 'p' || key === 'P') {
        const pungBtn = bar.querySelector('.act-btn[data-act="pung"]');
        if (pungBtn && pungBtn.style.display !== 'none') {
          pungBtn.click();
          return;
        }
      }
      if (key === 'k' || key === 'K') {
        const kongBtn = bar.querySelector('.act-btn[data-act="kong"]');
        if (kongBtn && kongBtn.style.display !== 'none') {
          kongBtn.click();
          return;
        }
      }
      if (key === ' ' || key === 'Enter') {
        if (bar._claimMode) {
          const passBtn = bar.querySelector('.act-btn[data-act="pass"]');
          if (passBtn && passBtn.style.display !== 'none') {
            passBtn.click();
            return;
          }
        }
      }
    }

    // 玩家出牌阶段快捷键 (空格 / 回车确认出牌, 方向键选牌)
    if (game && game.turn === 0 && !game.players[0].out && (game.phase === 'turn_act' || game.phase === 'pung_act') && !isBusy) {
      const hand = game.players[0].hand;
      if (!hand || !hand.length) return;

      if (key === ' ' || key === 'Enter') {
        if (selectedTile) {
          handleHumanDiscard(selectedTile);
        }
        return;
      }

      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        let currentIdx = selectedTile ? hand.indexOf(selectedTile) : -1;
        if (key === 'ArrowLeft') {
          currentIdx = (currentIdx <= 0) ? hand.length - 1 : currentIdx - 1;
        } else {
          currentIdx = (currentIdx < 0 || currentIdx >= hand.length - 1) ? 0 : currentIdx + 1;
        }
        selectedTile = hand[currentIdx];
        highlightMatchingTiles(selectedTile);
        render();
        return;
      }
    }
  }

  // ---- 4. 全桌同牌高亮联动 ----
  function highlightMatchingTiles(tile) {
    if (!tile) {
      clearMatchingHighlights();
      return;
    }
    const allTiles = document.querySelectorAll('.table .tile[data-tile]');
    allTiles.forEach(el => {
      if (el.dataset.tile === tile) {
        el.classList.add('highlight-same');
      } else {
        el.classList.remove('highlight-same');
      }
    });
  }

  function clearMatchingHighlights() {
    const allTiles = document.querySelectorAll('.table .tile.highlight-same');
    allTiles.forEach(el => el.classList.remove('highlight-same'));
  }

  // 计算全场某张牌的已现数量 (手牌 + 4家弃牌河 + 4家副露)
  function countVisibleTiles(g, tile) {
    if (!g || !tile) return 0;
    let count = 0;
    // 玩家手牌
    for (const t of g.players[0].hand) {
      if (t === tile) count++;
    }
    // 4 家弃牌与副露
    for (const p of g.players) {
      for (const t of p.discards) {
        if (t === tile) count++;
      }
      for (const m of p.melds) {
        for (const t of m.tiles) {
          if (t === tile) count++;
        }
      }
    }
    return count;
  }

  // ---- 5. 开局与轮次推进 ----
  function startRound() {
    game = G.createGame({ aiLevel, round, dealer, enableSwap });
    selectedTile = null;
    swapSelectedTiles = [];
    swapNewTiles = [];
    isBusy = false;
    hideAllModals();
    clearMatchingHighlights();
    render();

    const ev = G.advance(game);
    render();

    if (ev.need === 'humanSwap') {
      showSwapModal();
    } else if (ev.need === 'humanLack') {
      showLackModal();
    } else {
      stepGame();
    }
  }

  function nextRound() {
    round++;
    const lastDealer = dealer;
    if (game && game.winners.includes(lastDealer)) {
      // 连庄
    } else {
      dealer = (dealer + 1) % 4;
    }
    startRound();
  }

  function hideAllModals() {
    $('swapModal').classList.add('hidden');
    $('swapRevealModal').classList.add('hidden');
    $('lackModal').classList.add('hidden');
    $('resultModal').classList.add('hidden');
    $('rulesModal').classList.add('hidden');
    $('actionBar').classList.add('hidden');
  }

  // ---- 5.5 换三张交互系统 (Swap UI) ----
  function showSwapModal() {
    const hand = game.players[0].hand;
    swapSelectedTiles = [];
    swapAdvice = MJAI.analyzeSwapAdvice(hand);

    // 渲染教练分析卡片
    if (swapAdvice) {
      $('swapCoachTag').textContent = swapAdvice.tag;
      $('swapCoachReason').innerHTML = `<strong>【${swapAdvice.suitName}】</strong>${swapAdvice.reason}`;
      
      const tilesWrap = $('swapCoachTilesWrap');
      tilesWrap.innerHTML = '';
      swapAdvice.tiles.forEach(t => {
        tilesWrap.appendChild(createTileElement(t, 'small'));
      });
    }

    // 渲染选牌网格
    const grid = $('swapHandGrid');
    grid.innerHTML = '';
    hand.forEach((t) => {
      const tileEl = createTileElement(t, '');
      tileEl.onclick = () => {
        playSound('tap');
        const idx = swapSelectedTiles.indexOf(t);
        if (idx >= 0) {
          swapSelectedTiles.splice(idx, 1);
        } else {
          if (swapSelectedTiles.length >= 3) {
            flashLog('换三张最多只能选择 3 张牌');
            return;
          }
          if (swapSelectedTiles.length > 0 && swapSelectedTiles[0][0] !== t[0]) {
            // 换花色时切换为当前选中的花色
            swapSelectedTiles = [t];
          } else {
            swapSelectedTiles.push(t);
          }
        }
        updateSwapModalState();
      };
      grid.appendChild(tileEl);
    });

    updateSwapModalState();
    $('swapModal').classList.remove('hidden');
  }

  function updateSwapModalState() {
    const grid = $('swapHandGrid');
    const tiles = grid.querySelectorAll('.tile');
    const hand = game.players[0].hand;

    // 更新选中状态
    const selectedCounts = {};
    swapSelectedTiles.forEach(t => {
      selectedCounts[t] = (selectedCounts[t] || 0) + 1;
    });

    const usedCounts = {};
    tiles.forEach((el, idx) => {
      const t = hand[idx];
      usedCounts[t] = (usedCounts[t] || 0) + 1;
      if (selectedCounts[t] && usedCounts[t] <= selectedCounts[t]) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });

    const count = swapSelectedTiles.length;
    $('swapCountBadge').textContent = `已选 ${count} / 3 张`;

    const confirmBtn = $('confirmSwapBtn');
    const hint = $('swapStatusHint');

    if (count === 3) {
      const suit = swapSelectedTiles[0][0];
      const suitName = MJ.SUIT_NAMES[suit];
      hint.innerHTML = `<span style="color:#15803d;font-weight:800;">✅ 已选择同门【${suitName}】3 张牌，可确认换出</span>`;
      confirmBtn.disabled = false;
      confirmBtn.textContent = `确认换出【${swapSelectedTiles.map(MJ.tileShortName).join(' ')}】`;
    } else if (count > 0) {
      const suitName = MJ.SUIT_NAMES[swapSelectedTiles[0][0]];
      hint.textContent = `已选 ${count} 张【${suitName}】，还需选 ${3 - count} 张同门牌`;
      confirmBtn.disabled = true;
      confirmBtn.textContent = `确认换出 (${count}/3)`;
    } else {
      hint.textContent = '💡 提示：换三张必须选择同花色的 3 张牌';
      confirmBtn.disabled = true;
      confirmBtn.textContent = '确认换出 (0/3)';
    }
  }

  function onConfirmSwap() {
    if (swapSelectedTiles.length !== 3) return;
    playSound('btn');
    $('swapModal').classList.add('hidden');

    G.setHumanSwap(game, swapSelectedTiles);
    const res = G.advance(game);
    const swapResult = res.swapResult;

    swapNewTiles = (swapResult && swapResult.humanReceived && swapResult.humanReceived.tiles) ? swapResult.humanReceived.tiles.slice() : [];

    playSound('draw');

    // 渲染结果弹窗
    $('swapRevealTitle').textContent = `🎲 换三张拓扑转移`;
    $('swapRevealDesc').textContent = `骰子掷出 ${swapResult.dice} 点：${swapResult.directionName}`;

    const outWrap = $('swapRevealOutTiles');
    outWrap.innerHTML = '';
    swapSelectedTiles.forEach(t => outWrap.appendChild(createTileElement(t, 'small')));

    const inWrap = $('swapRevealInTiles');
    inWrap.innerHTML = '';
    swapNewTiles.forEach(t => inWrap.appendChild(createTileElement(t, 'small')));

    $('swapRevealInLabel').textContent = `📥 从【${swapResult.humanReceived ? swapResult.humanReceived.fromName : '对手'}】换得新牌：`;

    $('swapRevealModal').classList.remove('hidden');
  }

  function showLackModal() {
    const hand = game.players[0].hand;
    const recommended = MJAI.chooseLack(hand);
    const recName = MJ.SUIT_NAMES[recommended];
    const count = hand.filter(t => t[0] === recommended).length;
    $('lackAdvice').textContent = `💡 智能推荐：缺【${recName}】 (手中仅 ${count} 张${recName}，结构最弱最易清门)`;
    $('lackModal').classList.remove('hidden');
  }

  function onHumanLack(suit) {
    G.setHumanLack(game, suit);
    $('lackModal').classList.add('hidden');
    G.advance(game);
    render();
    stepGame();
  }

  // ---- 6. 核心游戏循环调度器 (stepGame) ----
  function stepGame() {
    if (!game) return;

    if (G.isOver(game) || game.phase === 'over') {
      endRound();
      return;
    }

    render();
    const timing = getTiming();

    // 摸牌行动阶段 (turn_act / pung_act)
    if (game.phase === 'turn_act' || game.phase === 'pung_act') {
      const seat = game.turn;
      const pl = game.players[seat];

      // 若当前座位已胡牌，自动跳过由下家行动
      if (pl.out) {
        if (!G.nextTurn(game)) {
          endRound();
          return;
        }
        stepGame();
        return;
      }

      // 玩家回合
      if (pl.isHuman) {
        isBusy = false; // 解锁手牌交互
        selectedTile = null;
        clearMatchingHighlights();
        render();

        if (game.phase === 'turn_act') {
          playSound('draw');
          const acts = G.actActions(game, 0);
          const hasHu = acts.some(a => a.type === 'tsumo');
          const hasKong = acts.some(a => a.type === 'ankong' || a.type === 'addkong');

          const bar = $('actionBar');
          bar._claimMode = false;
          bar._actOptions = acts;

          if (hasHu || hasKong) {
            bar.classList.remove('hidden');
            bar.querySelectorAll('.act-btn').forEach(b => {
              const a = b.dataset.act;
              if (a === 'hu') b.style.display = hasHu ? 'inline-flex' : 'none';
              if (a === 'kong') b.style.display = hasKong ? 'inline-flex' : 'none';
              if (a === 'pung') b.style.display = 'none';
              if (a === 'pass') b.style.display = 'inline-flex';
              if (a === 'discard') b.classList.add('hidden');
            });
          } else {
            bar.classList.add('hidden');
          }
        } else {
          $('actionBar').classList.add('hidden');
        }
        return;
      }

      // AI 回合
      isBusy = true;
      $('actionBar').classList.add('hidden');

      setTimeout(() => {
        if (!game || game.phase === 'over') return;
        aiTurn(seat);
      }, timing.aiThink);
      return;
    }

    // 副露裁决阶段 (claim_phase)
    if (game.phase === 'claim_phase') {
      checkClaims();
    }
  }

  // ---- 7. AI 回合执行 ----
  function aiTurn(seat) {
    const pl = game.players[seat];
    const timing = getTiming();

    if (pl.out) {
      if (!G.nextTurn(game)) {
        endRound();
        return;
      }
      stepGame();
      return;
    }

    const decision = MJAI.act(game, seat, game.aiLevel);

    if (decision.type === 'tsumo') {
      showFx(`${pl.name} 自摸！`);
      playSound('hu');
      G.doHu(game, seat, decision.info, seat);
      render();
      if (G.isOver(game)) {
        setTimeout(endRound, timing.over);
        return;
      }
      G.nextTurn(game);
      setTimeout(stepGame, timing.step);
      return;
    }

    if (decision.type === 'ankong' || decision.type === 'addkong') {
      showFx(`${pl.name} 杠牌！`);
      playSound('kong');
      G.doKong(game, seat, decision.tile, decision.type === 'ankong' ? 'an' : 'add');
      render();
      setTimeout(stepGame, timing.step);
      return;
    }

    if (decision.type === 'discard') {
      executeDiscard(seat, decision.tile);
    }
  }

  // 执行出牌通用函数
  function executeDiscard(seat, tile) {
    const timing = getTiming();
    G.doDiscard(game, seat, tile);
    playSound('discard');
    selectedTile = null;
    clearMatchingHighlights();
    $('actionBar').classList.add('hidden');
    render();

    setTimeout(() => {
      checkClaims();
    }, timing.discard);
  }

  // ---- 8. 玩家出牌与自摸/杠动作处理 ----
  function handleHumanDiscard(tile) {
    if (isBusy || !game || game.turn !== 0 || game.players[0].out || game.phase === 'over') return;

    const human = game.players[0];
    const hasLackTiles = human.hand.some(t => t[0] === human.lack);

    // 四川麻将核心规则检查: 若手牌仍有缺门花色，必须强制先打缺门牌！
    if (hasLackTiles && tile[0] !== human.lack) {
      flashLog(`手牌中还有缺门【${MJ.SUIT_NAMES[human.lack]}】，必须先出缺门牌！`);
      playSound('tap');
      return;
    }

    isBusy = true;
    executeDiscard(0, tile);
  }

  function onSelfAction(act) {
    playSound('btn');
    const timing = getTiming();
    const bar = $('actionBar');
    const acts = bar._actOptions || G.actActions(game, 0);

    if (act === 'hu') {
      const tsumo = acts.find(a => a.type === 'tsumo');
      if (tsumo) {
        showFx('🎉 自摸！');
        playSound('hu');
        G.doHu(game, 0, tsumo.info, 0);
        bar.classList.add('hidden');
        render();
        if (G.isOver(game)) {
          setTimeout(endRound, timing.over);
          return;
        }
        G.nextTurn(game);
        setTimeout(stepGame, timing.step);
        return;
      }
    }

    if (act === 'kong') {
      const kong = acts.find(a => a.type === 'ankong' || a.type === 'addkong');
      if (kong) {
        showFx('💥 杠！');
        playSound('kong');
        G.doKong(game, 0, kong.tile, kong.type === 'ankong' ? 'an' : 'add');
        bar.classList.add('hidden');
        render();
        stepGame();
        return;
      }
    }

    if (act === 'pass') {
      bar.classList.add('hidden');
    }

    if (act === 'discard') {
      if (selectedTile) {
        handleHumanDiscard(selectedTile);
      }
    }
  }

  // ---- 9. 副露收集与裁决 (checkClaims) ----
  function checkClaims() {
    if (!game || game.phase === 'over') return;

    const gc = G.gatherClaims(game);

    if (gc.needHumanClaim) {
      isBusy = false;
      showHumanClaim(gc.humanOptions, gc.aiClaims);
      return;
    }

    const rc = G.resolveClaims(game, gc.aiClaims);
    handleClaimResult(rc);
  }

  function showHumanClaim(options, aiClaims) {
    const bar = $('actionBar');
    bar.classList.remove('hidden');
    bar._claimMode = true;
    bar._claimOptions = options;
    bar._aiClaims = aiClaims || [];

    const hasHu = options.some(o => o.type === 'hu');
    const hasKong = options.some(o => o.type === 'kong');
    const hasPung = options.some(o => o.type === 'pung');

    bar.querySelectorAll('.act-btn').forEach(b => {
      const a = b.dataset.act;
      if (a === 'hu') b.style.display = hasHu ? 'inline-flex' : 'none';
      if (a === 'kong') b.style.display = hasKong ? 'inline-flex' : 'none';
      if (a === 'pung') b.style.display = hasPung ? 'inline-flex' : 'none';
      if (a === 'pass') b.style.display = 'inline-flex';
      if (a === 'discard') b.classList.add('hidden');
    });
  }

  function onClaimAction(act) {
    playSound('btn');
    const bar = $('actionBar');
    const options = bar._claimOptions || [];
    const aiClaims = bar._aiClaims || [];
    bar.classList.add('hidden');
    bar._claimMode = false;
    isBusy = true;

    if (act === 'pass') {
      const rc = G.resolveClaims(game, aiClaims);
      handleClaimResult(rc);
      return;
    }

    const opt = options.find(o => o.type === act);
    if (!opt) return;

    if (act === 'hu') {
      showFx('🎉 胡牌！');
      playSound('hu');
    } else if (act === 'pung') {
      showFx('⚡ 碰！');
      playSound('pung');
    } else if (act === 'kong') {
      showFx('💥 杠！');
      playSound('kong');
    }

    const myClaim = { type: act, seat: 0, info: opt.info, tile: opt.tile };
    const allClaims = aiClaims.concat([myClaim]);

    const rc = G.resolveClaims(game, allClaims);
    handleClaimResult(rc);
  }

  function handleClaimResult(rc) {
    const timing = getTiming();
    render();

    if (rc.type === 'over' || G.isOver(game)) {
      setTimeout(endRound, timing.over);
      return;
    }

    if (rc.type === 'hu') {
      playSound('hu');
      setTimeout(stepGame, timing.step + 200);
      return;
    }

    if (rc.type === 'kong') {
      playSound('kong');
      setTimeout(stepGame, timing.step + 100);
      return;
    }

    if (rc.type === 'pung') {
      playSound('pung');
      setTimeout(stepGame, timing.step);
      return;
    }

    setTimeout(stepGame, timing.step);
  }

  // ---- 10. 终局结算与弹窗 ----
  function endRound() {
    isBusy = true;
    const res = G.settle(game);
    for (let i = 0; i < 4; i++) {
      totalScores[i] += res.net[i];
    }
    render();
    showResultModal(res);
  }

  function showResultModal(res) {
    const modal = $('resultModal');
    modal.classList.remove('hidden');

    const humanWon = game.winners.includes(0);
    const title = res.isDraw
      ? '🀄 本局流局 (牌墙摸完)'
      : (humanWon ? '🎉 恭喜！你胡牌获胜！' : '本局结束');
    $('resultTitle').textContent = title;

    const body = $('resultBody');
    let html = '';

    res.fanList.forEach(f => {
      const p = game.players[f.seat];
      const net = res.net[f.seat];
      const cls = net > 0 ? 'win' : (net < 0 ? 'lose' : 'even');
      const sign = net > 0 ? '+' : '';

      html += `
        <div class="result-row">
          <div class="result-row-head">
            <span>${p.name} ${f.hu ? '🏆 已胡牌' : (f.isHuaZhu ? '🐷 花猪' : (f.isTing ? '💡 已听牌' : '❌ 未叫'))}</span>
            <span class="result-score ${cls}">${sign}${net} 分</span>
          </div>
          <div class="result-detail">
            ${f.hu ? f.desc.join(' · ') + ` (底番 ${f.score}分)` : f.desc.join(' · ')}
          </div>
        </div>
      `;
    });

    body.innerHTML = html;

    $('totalSummary').textContent = '总积分：' + game.players.map((p, i) =>
      `${p.name.split(' ')[0]}: ${totalScores[i] >= 0 ? '+' : ''}${totalScores[i]}`
    ).join(' | ');
  }

  // ---- 11. 界面渲染 ----
  function render() {
    if (!game) return;

    $('roundInfo').textContent = `第 ${game.round} 局`;
    $('windInfo').textContent = `${G.SEAT_WINDS[game.dealer]}风 · ${game.players[game.dealer].name}`;
    const remWall = G.wallCount(game);
    $('wallInfo').textContent = `余 ${remWall}`;
    $('compassTiles').textContent = remWall;

    for (let i = 0; i < 4; i++) {
      const el = $(`cWind${i}`);
      if (el) {
        el.classList.toggle('active', game.turn === i && !game.players[i].out && game.phase !== 'over');
        el.textContent = game.players[i].wind;
      }
    }

    for (let i = 0; i < 4; i++) renderSeat(i);

    updateCoachBtn();
    renderTingHint();
    renderCoachPanel(lastAdvice, previewTile || selectedTile);
    renderLog();

    if (selectedTile) {
      highlightMatchingTiles(selectedTile);
    }
  }

  function renderSeat(i) {
    const pl = game.players[i];
    const seatEl = $(`seat${i}`);
    if (!seatEl) return;

    seatEl.classList.toggle('active', game.turn === i && !pl.out && game.phase !== 'over');

    const tagEl = $(`tag${i}`);
    let tagText = '';
    tagEl.className = 'seat-tag';

    if (pl.out) {
      tagText = '已胡';
      tagEl.classList.add('out');
    } else if (pl.lack) {
      tagText = '缺' + MJ.SUIT_NAMES[pl.lack];
      tagEl.classList.add('lack');
    }
    tagEl.textContent = tagText;

    const scoreEl = $(`score${i}`);
    if (scoreEl) {
      scoreEl.textContent = (totalScores[i] >= 0 ? '+' : '') + totalScores[i];
    }

    // 副露
    const meldsEl = $(`melds${i}`);
    meldsEl.innerHTML = '';
    for (const m of pl.melds) {
      const grp = document.createElement('div');
      grp.className = 'meld-group';
      for (const t of m.tiles) {
        const tileEl = createTileElement(t, 'small');
        if (m.concealed) tileEl.classList.add('back');
        grp.appendChild(tileEl);
      }
      meldsEl.appendChild(grp);
    }

    // 手牌
    if (i === 0) {
      renderHumanHand();
    } else {
      const closedEl = $(`closed${i}`);
      closedEl.innerHTML = '';
      const numTiles = pl.hand.length;
      for (let k = 0; k < numTiles; k++) {
        const tileEl = createTileElement(null, 'small');
        tileEl.classList.add('back');
        if (k === numTiles - 1 && game.turn === i && (game.phase === 'turn_act') && numTiles % 3 === 2) {
          tileEl.classList.add('drawn');
        }
        closedEl.appendChild(tileEl);
      }
    }

    // 弃牌河
    const riverEl = $(`river${i}`);
    riverEl.innerHTML = '';
    pl.discards.forEach((t, idx) => {
      const tileEl = createTileElement(t, 'tiny');
      if (t === game.pendingDiscard && i === game.discardFrom && idx === pl.discards.length - 1) {
        tileEl.classList.add('last-discard');
      }
      riverEl.appendChild(tileEl);
    });
  }

  function renderHumanHand() {
    const handEl = $('hand0');
    handEl.innerHTML = '';
    const pl = game.players[0];
    const lack = pl.lack;
    const isHumanTurn = (game.turn === 0 && !pl.out && (game.phase === 'turn_act' || game.phase === 'pung_act'));

    // 计算雀神教练建议
    let bestDiscardTile = null;
    if (coachEnabled && isHumanTurn) {
      lastAdvice = MJAI.analyzeHandAdvice(game, 0);
      bestDiscardTile = lastAdvice ? lastAdvice.bestDiscard : null;
    }

    let badgePlaced = false;

    pl.hand.forEach((t, idx) => {
      const tileEl = createTileElement(t, '');
      if (lack && t[0] === lack) {
        tileEl.classList.add('lack-suit');
      }
      if (selectedTile === t) {
        tileEl.classList.add('selected');
      }

      // 雀神 AI 教练推荐悬浮徽章
      if (coachEnabled && isHumanTurn && bestDiscardTile === t && !badgePlaced) {
        badgePlaced = true;
        const coachBadge = document.createElement('span');
        coachBadge.className = 'coach-badge';
        coachBadge.textContent = '★ 推荐';
        tileEl.appendChild(coachBadge);
      }

      // 换三张新换入的牌标记高亮呼吸灯与角标
      if (swapNewTiles && swapNewTiles.includes(t)) {
        tileEl.classList.add('swap-received-tile');
        const sBadge = document.createElement('span');
        sBadge.className = 'swap-received-badge';
        sBadge.textContent = '✨ 换入';
        tileEl.appendChild(sBadge);
      }

      // 刚摸上来的第14张牌加独立右侧间隔与摸牌角标
      if (idx === pl.hand.length - 1 && isHumanTurn && game.phase === 'turn_act' && pl.hand.length % 3 === 2) {
        tileEl.classList.add('drawn');
        const badge = document.createElement('span');
        badge.className = 'drawn-badge';
        badge.textContent = '摸';
        tileEl.appendChild(badge);
      }

      // 鼠标悬停高亮同牌并实时更新教练解析
      tileEl.onmouseenter = () => {
        highlightMatchingTiles(t);
        if (coachEnabled && isHumanTurn && lastAdvice) {
          previewTile = t;
          renderCoachPanel(lastAdvice, t);
        }
      };
      tileEl.onmouseleave = () => {
        previewTile = null;
        if (selectedTile) highlightMatchingTiles(selectedTile);
        else clearMatchingHighlights();
        if (coachEnabled && isHumanTurn && lastAdvice) {
          renderCoachPanel(lastAdvice, selectedTile || lastAdvice.bestDiscard);
        }
      };

      tileEl.onclick = () => {
        if (isBusy || !isHumanTurn) return;
        playSound('tap');

        if (selectedTile === t) {
          handleHumanDiscard(t);
        } else {
          selectedTile = t;
          highlightMatchingTiles(t);
          render();
          const dBtn = $('discardBtn');
          if (dBtn) dBtn.classList.remove('hidden');
        }
      };

      handEl.appendChild(tileEl);
    });
  }

  function createTileElement(t, sizeClass) {
    const el = document.createElement('div');
    el.className = 'tile ' + (sizeClass || '');
    if (t) {
      el.classList.add(t[0]);
      el.dataset.tile = t;

      const sub = document.createElement('span');
      sub.className = 't-sub';
      sub.textContent = (+t[1]) + MJ.SUIT_NAMES[t[0]];

      const char = document.createElement('span');
      char.className = 't-char';
      char.textContent = MJ.tileFace(t);

      el.appendChild(sub);
      el.appendChild(char);
      el.title = MJ.tileName(t);
    }
    return el;
  }

  // ---- 12. 富媒体听牌看板渲染 ----
  function renderTingHint() {
    const tingBar = $('tingBar');
    const pl = game.players[0];
    if (pl.out || game.phase === 'over') {
      tingBar.classList.add('hidden');
      return;
    }

    const mc = pl.melds.length;
    let waits = [];
    let isPreview = false;

    if (pl.hand.length === 13 - 3 * mc) {
      waits = MJ.tenpai(pl.hand, mc, pl.lack);
    } else if (selectedTile) {
      const tempHand = pl.hand.slice();
      const sIdx = tempHand.indexOf(selectedTile);
      if (sIdx >= 0) tempHand.splice(sIdx, 1);
      waits = MJ.tenpai(tempHand, mc, pl.lack);
      isPreview = true;
    }

    if (waits.length > 0) {
      tingBar.classList.remove('hidden');
      $('tingTitle').textContent = isPreview
        ? `打出【${MJ.tileShortName(selectedTile)}】后听牌：`
        : `已听牌：`;

      const tilesContainer = $('tingTiles');
      tilesContainer.innerHTML = '';

      waits.forEach(w => {
        const fanInfo = MJ.calcFan({
          tiles: pl.hand.concat(w),
          melds: pl.melds,
          winTile: w,
          selfDraw: false,
        });
        const visibleCount = countVisibleTiles(game, w);
        const remCount = Math.max(0, 4 - visibleCount);

        const item = document.createElement('span');
        item.className = 'ting-item';
        item.innerHTML = `
          <span>${MJ.tileFace(w)} ${MJ.tileShortName(w)}</span>
          <span class="t-badge">${fanInfo.fan}番/${fanInfo.score}分</span>
          <span class="t-rem">余 ${remCount} 张</span>
        `;
        tilesContainer.appendChild(item);
      });
    } else {
      tingBar.classList.add('hidden');
    }
  }

  function renderLog() {
    const logEl = $('liveLog');
    if (!game || !game.log.length) {
      logEl.innerHTML = '<div class="log-line hi">准备开始</div>';
      return;
    }
    const last2 = game.log.slice(-2);
    let html = '';
    for (const e of last2) {
      const name = e.seat >= 0 ? game.players[e.seat].name : '';
      const cls = (e.msg.includes('胡') || e.msg.includes('自摸')) ? 'hi' : '';
      html += `<div class="log-line ${cls}">${name ? name + ' ' : ''}${e.msg}</div>`;
    }
    logEl.innerHTML = html;
  }

  function flashLog(msg) {
    const logEl = $('liveLog');
    logEl.innerHTML = `<div class="log-line alert">⚠️ ${msg}</div>`;
    setTimeout(() => renderLog(), 1800);
  }

  function showFx(text) {
    const fx = $('fxLayer');
    fx.innerHTML = `<div class="fx-text">${text}</div>`;
    setTimeout(() => {
      fx.innerHTML = '';
    }, 1200);
  }


  // ---- 13. 雀神 AI 教练深度看板渲染 ----
  function renderCoachPanel(adviceData, currentTile) {
    const panel = $('coachPanel');
    if (!panel) return;

    if (!coachEnabled || !game || game.players[0].out || game.phase === 'over') {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');

    const isHumanTurn = (game.turn === 0 && !game.players[0].out && (game.phase === 'turn_act' || game.phase === 'pung_act'));

    // 人类出牌阶段
    if (isHumanTurn) {
      if (!adviceData) {
        adviceData = MJAI.analyzeHandAdvice(game, 0);
        lastAdvice = adviceData;
      }
      if (!adviceData || !adviceData.bestAdvice) return;

      const activeTile = currentTile || adviceData.bestDiscard;
      const targetAdvice = (adviceData.ranking && adviceData.ranking.find(r => r.tile === activeTile)) || adviceData.bestAdvice;

      // 推荐牌面展示
      const tileWrap = $('coachRecTileWrap');
      tileWrap.innerHTML = '';
      const miniTile = createTileElement(targetAdvice.tile, 'tiny');
      tileWrap.appendChild(miniTile);

      // 标签与星级
      $('coachRecTag').textContent = targetAdvice.tag || '🚀 进张最大化';
      $('coachRecStars').textContent = targetAdvice.star || '★★★★★';

      // 详细可解释理由
      $('coachReason').innerHTML = targetAdvice.reason;

      // 候选打法对比排行榜
      const compList = $('coachCompList');
      compList.innerHTML = '';
      const candidates = (adviceData.ranking || []).slice(0, 3);
      candidates.forEach((cand) => {
        const item = document.createElement('div');
        item.className = 'coach-comp-item';
        const isBest = (cand.tile === adviceData.bestDiscard);
        const isCurrent = (cand.tile === activeTile);
        
        let subInfo = cand.afterShantenText || '';
        if (cand.ukeireCount > 0) subInfo += ' (' + cand.ukeireCount + '张)';
        
        item.innerHTML = `
          <div class="coach-comp-left">
            <span class="tile-mini" style="background:${cand.tile[0]==='m'?'#991b1b':(cand.tile[0]==='p'?'#166534':'#075985')}">${MJ.tileFace(cand.tile)}</span>
            <span style="font-weight:700;color:${isBest?'#fbbf24':'#e2e8f0'}">${MJ.tileShortName(cand.tile)}</span>
            <span style="font-size:10px;opacity:0.8;">${cand.tag}</span>
          </div>
          <div class="coach-comp-right">
            <span style="color:#7dd3fc;">${subInfo}</span>
            <span class="coach-comp-diff">${isBest ? '★ 首选' : (cand.dangerText ? '险度:'+cand.dangerText : '')}</span>
          </div>
        `;
        item.style.cursor = 'pointer';
        item.onclick = () => {
          selectedTile = cand.tile;
          highlightMatchingTiles(cand.tile);
          render();
        };
        compList.appendChild(item);
      });

      // 宏观建议
      $('coachMacro').innerHTML = adviceData.macroStrategy;
      return;
    }

    // 副露裁决阶段
    if (game.phase === 'claim_phase') {
      const tileWrap = $('coachRecTileWrap');
      tileWrap.innerHTML = '';
      if (game.pendingDiscard) {
        tileWrap.appendChild(createTileElement(game.pendingDiscard, 'tiny'));
      }
      $('coachRecTag').textContent = '⚡ 副露裁决分析';
      $('coachRecStars').textContent = '★★★★★';
      
      const human = game.players[0];
      const pd = game.pendingDiscard;
      const canHu = pd && MJ.canHu(human.hand, human.melds, pd, false, human.lack);
      if (canHu) {
        $('coachReason').innerHTML = `🎉 <strong>绝佳胡牌时机！</strong>场上打出【${MJ.tileName(pd)}】，符合胡牌番型，建议点击<strong>【胡牌】</strong>立即收分！`;
      } else {
        $('coachReason').innerHTML = `场上打出【${MJ.tileName(pd)}】。AI 正在研判各家副露响应与牌势变化。`;
      }
      $('coachCompList').innerHTML = '<div style="color:rgba(255,255,255,0.5);font-size:11px;">等待各家副露或过牌...</div>';
      $('coachMacro').innerHTML = lastAdvice ? lastAdvice.macroStrategy : '💡 宏观建议：时刻观察各家已打牌花色与副露，防范大番放炮。';
      return;
    }

    // AI 出牌思考阶段
    const curSeat = game.turn;
    const curPlayer = game.players[curSeat];
    const tileWrap = $('coachRecTileWrap');
    tileWrap.innerHTML = '<span style="font-size:22px;">🤖</span>';
    $('coachRecTag').textContent = '⏳ 对局观摩';
    $('coachRecStars').textContent = '★★★☆☆';
    $('coachReason').innerHTML = `当前轮到【<strong>${curPlayer ? curPlayer.name : '对手'}</strong>】摸打。注意观察其出牌花色，推测其定缺与听牌方向！`;
    $('coachCompList').innerHTML = '<div style="color:rgba(255,255,255,0.5);font-size:11px;">等待玩家摸牌...</div>';
    $('coachMacro').innerHTML = lastAdvice ? lastAdvice.macroStrategy : '💡 宏观建议：手牌张力优先，适时扣住对手可能需要的危险牌。';
  }

  // 初始化入口
  window.addEventListener('DOMContentLoaded', init);
})();
