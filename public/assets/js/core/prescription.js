/*
 * 銀動方程式 — 個人化運動處方產生器（FITT）
 *
 * 輸入：評估資料（profile、screening、sft、health）與 screening.classify() 的結果。
 * 輸出：FITT 四大要素、動作清單與劑量、一週計畫、6 週進展目標、安全守則。
 *
 * 原則：ACSM's Guidelines for Exercise Testing and Prescription (11th ed.) 高齡者建議
 *   有氧：中等強度每週累積 150 分鐘（每次至少 10 分鐘），自覺費力 5–6 分（0–10 量表）
 *   肌力：每週 ≥2 天、8–10 個動作、1–3 組 × 8–15 下
 *   柔軟度：每週 ≥2 天、每個動作停留 30–60 秒
 *   平衡（神經動作）：常跌倒或行動受限者每週 2–3 天
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});
  var EX = function () {
    return YD.exercises;
  };

  var DAY_NAMES = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];

  // 動作的基本重要性（功能性越高越優先）
  var BASE_PRIORITY = {
    'chair-squat': 6,
    'assisted-sit-to-stand': 6,
    'seated-knee-extension': 4,
    'wall-pushup': 4,
    'bottle-curl': 3,
    'band-curl': 3,
    'seated-curl': 3,
    'heel-raise': 4,
    'side-leg-raise': 3,
    'hip-extension': 2,
    'band-row': 4,
    'scapular-squeeze': 3,
    'bridge': 2,
    'overhead-press': 2,
    'seated-overhead-press': 2,
    'seated-band-press': 3,
    'seated-punch-hold': 2,
    'seated-heel-toe': 3,
    'seated-adduction': 2,
    'seated-leg-lift': 3,
    'seated-hamstring': 4,
    'towel-stretch': 3,
    'calf-stretch': 3,
    'chest-stretch': 3,
    'quad-stretch': 1,
    'neck-stretch': 2,
    'band-shoulder-stretch': 3,
    'seated-trunk-rotation': 2,
    'seated-ankle-circles': 2,
    'single-leg-stand': 5,
    'tandem-walk': 3,
    'weight-shift': 3,
    'side-step': 2,
    'supported-sway': 2,
    'seated-weight-shift': 4,
    'seated-reach': 4,
    'seated-leg-hold': 3,
    'brisk-walk': 4,
    'march-in-place': 3,
    'tai-chi': 3,
    'seated-march': 4,
    'seated-punch': 3,
    'seated-jacks': 3
  };

  // 目標 → 身體部位／類別
  var GOAL_FOCUS = {
    fall: ['balance', 'legs'],
    legs: ['legs'],
    arms: ['arms'],
    flex: ['flexibility'],
    endurance: ['aerobic'],
    chronic: ['aerobic'],
    weight: ['aerobic'],
    mood: ['aerobic'],
    social: []
  };

  // 疼痛部位 → 調整建議的對應鍵
  var PAIN_TO_MODIFY = {
    knee: 'kneeOA',
    shoulder: 'shoulder',
    back: 'backPain',
    neck: 'neck',
    wrist: 'wrist',
    ankle: 'ankle',
    hip: 'hip'
  };

  // 依等級的劑量文字
  var INTENSITY = {
    1: { rpe: '3–4', label: '輕鬆～稍累', talk: '可以輕鬆說話、微微流汗' },
    2: { rpe: '4–5', label: '稍累', talk: '有點喘，但還能說完整的句子' },
    3: { rpe: '5–6', label: '有點累（中等強度）', talk: '可以說話、但沒辦法唱歌' }
  };

  var CONDITION_SAFETY = {
    hypertension:
      '降血壓藥照常服用；運動時不要憋氣，避免頭低於心臟的姿勢。血壓 ≥160/100 時只做輕度運動，≥180/110 時當天不要運動。',
    diabetes:
      '避免空腹運動，運動前後留意血糖；隨身帶糖果，出現發抖、冒冷汗、頭暈等低血糖症狀要立即停止並補充糖分。每天檢查雙腳有無傷口，穿合腳的鞋襪。',
    heart:
      '依醫師指示運動，暖身與緩和各 10 分鐘；強度維持在「還能說話」的程度；醫師開立的急救藥物（如舌下含片）要隨身攜帶。',
    stroke:
      '較弱的一側也要盡量參與；平衡動作一定要有扶手或有人陪。若突然出現臉歪、手無力、說話不清，記下時間並立即撥打 119。',
    kidney: '依醫師建議控制水分；洗腎者有瘻管的手臂不要提重物或綁彈力帶，洗腎當天以輕度活動為主。',
    lung:
      '使用「噘嘴呼吸」：鼻子吸氣 2 秒、噘嘴慢慢吐氣 4 秒；採「動一下、休息一下」的間歇方式；吸入劑放在身邊，空氣品質不佳時改在室內。',
    osteoporosis:
      '避免彎腰駝背去碰腳尖、避免用力扭轉身體；多做負重（走路、坐站）與平衡運動，降低跌倒與骨折的風險。',
    kneeOA:
      '以「不痛」為原則：運動後膝蓋疼痛超過 2 小時，下次就減量；避免深蹲、跪姿與爬坡，運動後可冰敷 10–15 分鐘。',
    backPain: '避免彎腰搬重物與快速扭轉；動作時腹部微微出力，背部保持自然挺直。',
    shoulder: '手舉高的動作只做到不痛的範圍；可以先熱敷 10 分鐘再運動。',
    jointReplacement:
      '遵守開刀醫師的活動限制；人工髖關節者避免翹腳、深蹲、髖部彎曲超過 90 度及向內扭轉。',
    parkinson: '動作刻意做大、做慢；練習時旁邊要有扶手或有人陪；轉彎時分成幾小步慢慢轉。',
    dementia: '由家人或照顧者陪同，固定時間、固定流程練習；用簡單口令和示範，多給鼓勵。',
    vision: '在光線充足、地面淨空的地方運動；平衡練習要扶穩，不要閉眼練習。'
  };

  var STOP_SIGNS = [
    '胸口疼痛、悶痛或有壓迫感',
    '異常喘不過氣，休息後仍無法緩解',
    '頭暈、眼前發黑或快要昏倒',
    '心跳突然很快、很亂或心悸',
    '冒冷汗、噁心、臉色蒼白',
    '關節或肌肉劇烈疼痛'
  ];

  var GENERAL_SAFETY = [
    '運動前後各喝一杯水，穿止滑、合腳的鞋子。',
    '使用穩固、沒有輪子的椅子，最好靠牆放。',
    '吃飽後 1 小時內、空腹、發燒、睡不好或身體不舒服時，先暫停運動。',
    '天氣太熱或太冷時改在室內運動；夏天避開中午時段。',
    '所有動作配合呼吸，「用力時吐氣」，不要憋氣。'
  ];

  var RPE_SCALE = [
    { v: '0', t: '完全不費力（休息）' },
    { v: '1–2', t: '非常輕鬆' },
    { v: '3–4', t: '輕鬆～稍累：可以唱歌、輕鬆說話' },
    { v: '5–6', t: '有點累（中等強度）：可以說話但不能唱歌' },
    { v: '7–8', t: '很累：只能說幾個字' },
    { v: '9–10', t: '非常累～最累：無法說話（請立即放慢）' }
  ];

  function has(list, key) {
    return Array.isArray(list) && list.indexOf(key) !== -1;
  }
  function uniq(arr) {
    var seen = {};
    return arr.filter(function (x) {
      if (seen[x]) return false;
      seen[x] = true;
      return true;
    });
  }
  function round5(n) {
    return Math.max(5, Math.round(n / 5) * 5);
  }

  /* ------------------------------------------------------------------ */
  /* 動作挑選                                                            */
  /* ------------------------------------------------------------------ */
  function canStand(input, cls) {
    var cs = cls.sft.byKey.chairStand;
    if (cs && cs.unable) return false;
    if (cs && cs.measured && typeof cs.value === 'number') return cs.value >= 1;
    return !(cls.route.riseFail && cls.route.walkFail);
  }

  function excludedBy(ex, ctx) {
    var avoid = ex.avoid || [];
    for (var i = 0; i < avoid.length; i++) {
      if (has(ctx.conditions, avoid[i]) || has(ctx.pain, avoid[i])) return true;
    }
    if (ex.requiresStand && !ctx.canStand) return true;
    // 高跌倒風險時，排除需單腳承重的伸展
    if (ex.id === 'quad-stretch' && ctx.fallLevel !== 'low') return true;
    return false;
  }

  function hasEquipment(ex, ctx) {
    var need = ex.equipment || [];
    for (var i = 0; i < need.length; i++) if (!has(ctx.equipment, need[i])) return false;
    return true;
  }

  /** 依器材找替代動作（可跨版本，最多三層）。 */
  function resolveEquipment(ex, ctx) {
    var cur = ex;
    for (var depth = 0; depth < 3 && cur; depth++) {
      if (hasEquipment(cur, ctx) && !excludedBy(cur, ctx)) return cur;
      cur = cur.fallback ? EX().get(cur.fallback) : null;
    }
    return null;
  }

  function scoreExercise(ex, ctx) {
    var s = BASE_PRIORITY[ex.id] || 1;
    (ex.targets || []).forEach(function (t) {
      var item = ctx.sft.byKey[t];
      if (!item || !item.measured) return;
      if (item.status === 'below' || item.status === 'unable') s += 3;
      if (item.riskZone) s += 1;
      if (item.status === 'normal' && item.percentile < 40) s += 1;
    });
    (ex.focus || []).forEach(function (f) {
      if (has(ctx.focusAreas, f)) s += 2;
    });
    ctx.goals.forEach(function (g) {
      var fs = GOAL_FOCUS[g] || [];
      fs.forEach(function (f) {
        if (f === ex.category) s += 2;
        else if (has(ex.focus, f)) s += 1.5;
      });
    });
    (ex.prefer || []).forEach(function (p) {
      if (has(ctx.preferences, p)) s += 3;
    });
    return s;
  }

  function similar(a, b) {
    return a.fallback === b.id || b.fallback === a.id;
  }

  function pick(category, ctx, count, mustCover) {
    var seen = {};
    var pool = [];
    EX().LIST.forEach(function (ex) {
      if (ex.category !== category) return;
      if (ex.versions.indexOf(ctx.version) === -1) return;
      if (excludedBy(ex, ctx)) return;
      var real = resolveEquipment(ex, ctx);
      if (!real || seen[real.id]) return;
      seen[real.id] = true;
      pool.push({ ex: real, score: scoreExercise(real, ctx), via: real.id !== ex.id ? ex.id : null });
    });
    pool.sort(function (a, b) {
      return b.score - a.score || (a.ex.id < b.ex.id ? -1 : 1);
    });
    var chosen = [];
    function ok(c) {
      if (chosen.indexOf(c) !== -1) return false;
      for (var k = 0; k < chosen.length; k++) if (similar(chosen[k].ex, c.ex)) return false;
      return true;
    }
    // 先確保涵蓋必要部位（以動作的主要部位 focus[0] 判斷）
    (mustCover || []).forEach(function (focus) {
      if (chosen.length >= count) return;
      for (var i = 0; i < pool.length; i++) {
        var c = pool[i];
        if (ok(c) && c.ex.focus && c.ex.focus[0] === focus) {
          chosen.push(c);
          break;
        }
      }
    });
    for (var i = 0; i < pool.length && chosen.length < count; i++) {
      if (ok(pool[i])) chosen.push(pool[i]);
    }
    chosen.sort(function (a, b) {
      return b.score - a.score;
    });
    return chosen;
  }

  function notesFor(ex, ctx) {
    var mod = ex.modify || {};
    var keys = ctx.conditions.slice();
    ctx.pain.forEach(function (p) {
      if (PAIN_TO_MODIFY[p]) keys.push(PAIN_TO_MODIFY[p]);
    });
    var notes = [];
    uniq(keys).forEach(function (k) {
      if (mod[k]) notes.push(mod[k]);
    });
    return uniq(notes);
  }

  /* ------------------------------------------------------------------ */
  /* 一週計畫                                                            */
  /* ------------------------------------------------------------------ */
  function dayPattern(days) {
    // S 肌力日、A 有氧日、C 綜合日、L 輕鬆日、R 休息
    switch (days) {
      case 2:
        return ['C', 'R', 'R', 'C', 'R', 'R', 'R'];
      case 3:
        return ['C', 'R', 'C', 'R', 'C', 'R', 'R'];
      case 4:
        return ['S', 'A', 'R', 'S', 'R', 'A', 'R'];
      case 6:
        return ['S', 'A', 'S', 'A', 'S', 'A', 'R'];
      case 7:
        return ['S', 'A', 'S', 'A', 'S', 'A', 'L'];
      default:
        return ['S', 'A', 'S', 'A', 'A', 'R', 'R'];
    }
  }

  /** 每次運動的時間分配（分鐘）。 */
  function sessionPlan(ctx) {
    var session = Math.max(15, Math.min(60, Number(ctx.minutesPerSession) || 30));
    var warm = session >= 30 ? 5 : 3;
    var cool = session >= 45 ? 8 : session >= 30 ? 5 : 3;
    var main = session - warm - cool;
    var extraBalance = ctx.fallLevel !== 'low' || has(ctx.goals, 'fall') || has(ctx.focusAreas, 'balance');
    // 盡量用 5 的倍數，方便長者記憶
    var strength = Math.max(5, Math.round((main * 0.65) / 5) * 5);
    var balanceS = main - strength;
    var aerobicA = Math.max(5, Math.floor((main - (extraBalance ? 3 : 0)) / 5) * 5);
    var balanceA = main - aerobicA;
    return {
      session: session,
      warm: warm,
      cool: cool,
      main: main,
      extraBalance: extraBalance,
      strength: strength,
      balanceS: balanceS,
      aerobicA: aerobicA,
      balanceA: balanceA
    };
  }

  function buildWeek(ctx, sel) {
    var days = Math.max(2, Math.min(7, Number(ctx.daysPerWeek) || 5));
    var sp = sessionPlan(ctx);
    var pattern = dayPattern(days);
    var ids = function (list) {
      return list.map(function (c) {
        return c.ex.id;
      });
    };
    var aerobicIds = ids(sel.aerobic);
    var strengthIds = ids(sel.strength);
    var balanceIds = ids(sel.balance);
    var flexIds = ids(sel.flexibility);
    var aCount = 0;
    var out = pattern.map(function (type, i) {
      var blocks = [];
      function block(category, minutes, list, label) {
        if (minutes <= 0) return;
        blocks.push({ category: category, minutes: minutes, exercises: list, label: label });
      }
      if (type === 'R') {
        return {
          day: DAY_NAMES[i],
          type: 'rest',
          typeText: '休息日',
          blocks: [],
          total: 0,
          note: '讓身體恢復；可以輕鬆散步、做家事或做幾個伸展動作。'
        };
      }
      var aerobicPick = aerobicIds.length ? [aerobicIds[aCount % aerobicIds.length]] : [];
      if (type === 'L') {
        var light = round5(Math.max(15, sp.session * 0.6));
        block('aerobic', light - sp.cool, aerobicIds.slice(0, 1), '輕鬆活動');
        block('flexibility', sp.cool, flexIds, '伸展放鬆');
        return { day: DAY_NAMES[i], type: 'light', typeText: '輕鬆日', blocks: blocks, total: light, note: '輕鬆活動，享受運動的樂趣。' };
      }
      block('warmup', sp.warm, [], '暖身');
      if (type === 'S') {
        block('strength', sp.strength, strengthIds, '肌力訓練');
        block('balance', sp.balanceS, balanceIds, '平衡訓練');
      } else if (type === 'A') {
        aCount++;
        block('aerobic', sp.aerobicA, aerobicPick, '有氧運動');
        if (sp.balanceA) {
          var start = (aCount - 1) % Math.max(1, balanceIds.length);
          block('balance', sp.balanceA, balanceIds.slice(start).concat(balanceIds.slice(0, start)).slice(0, 2), '平衡練習');
        }
      } else {
        // 綜合日：有氧＋肌力＋平衡
        aCount++;
        var a = Math.round((sp.main * 0.35) / 5) * 5;
        var st = Math.round((sp.main * 0.45) / 5) * 5;
        if (a < 3 || st < 3 || a + st > sp.main - 2) {
          a = Math.round(sp.main * 0.35);
          st = Math.round(sp.main * 0.45);
        }
        block('aerobic', a, aerobicPick, '有氧運動');
        block('strength', st, strengthIds, '肌力訓練');
        block('balance', sp.main - a - st, balanceIds, '平衡訓練');
      }
      block('flexibility', sp.cool, flexIds, '伸展緩和');
      return {
        day: DAY_NAMES[i],
        type: type === 'S' ? 'strength' : type === 'A' ? 'aerobic' : 'combo',
        typeText: type === 'S' ? '肌力＋平衡日' : type === 'A' ? '有氧日' : '綜合訓練日',
        blocks: blocks,
        total: sp.session
      };
    });
    var total = 0;
    var aerobic = 0;
    var strengthDays = 0;
    var balanceDays = 0;
    var aerobicDays = 0;
    var flexDays = 0;
    var aerobicPerDay = 0;
    out.forEach(function (d) {
      total += d.total;
      var f = {};
      d.blocks.forEach(function (b) {
        f[b.category] = true;
        if (b.category === 'aerobic') {
          aerobic += b.minutes;
          aerobicPerDay = Math.max(aerobicPerDay, b.minutes);
        }
      });
      if (f.strength) strengthDays++;
      if (f.balance) balanceDays++;
      if (f.aerobic) aerobicDays++;
      if (f.flexibility) flexDays++;
    });
    return {
      days: out,
      plan: sp,
      trainingDays: days,
      sessionMinutes: sp.session,
      total: total,
      aerobic: aerobic,
      aerobicPerDay: aerobicPerDay,
      aerobicDays: aerobicDays,
      strengthDays: strengthDays,
      balanceDays: balanceDays,
      flexDays: flexDays,
      meetsTotal150: total >= 150,
      meetsAerobic150: aerobic >= 150
    };
  }

  /* ------------------------------------------------------------------ */
  /* 6 週進展目標                                                        */
  /* ------------------------------------------------------------------ */
  var TARGET_DELTA = { chairStand: 2, armCurl: 2, stepTest: 8, sitReach: 3, backScratch: 3, upAndGo: -0.6 };

  function buildGoals(ctx, week) {
    var lv = ctx.level;
    var aPer = week.aerobicPerDay;
    var bout = Math.max(5, Math.round(aPer / 2));
    var weeklyGoal = lv === 1 ? 90 : 150;
    var extraWalk = Math.max(5, Math.ceil((weeklyGoal - week.aerobic) / 7 / 5) * 5);
    var aerobicItems = [
      '有氧每次 ' + aPer + ' 分鐘，可以分 2 段（每段約 ' + bout + ' 分鐘）完成',
      '有氧每次 ' + aPer + ' 分鐘一次完成',
      week.aerobic >= weeklyGoal
        ? '有氧每次 ' + aPer + ' 分鐘，維持每週 ' + week.aerobic + ' 分鐘'
        : '每天另外散步約 ' + extraWalk + ' 分鐘（或走路去市場），有氧每週累積達 ' + weeklyGoal + ' 分鐘'
    ];
    var reps = {
      1: ['1 組 × 8 下', '2 組 × 8–10 下', '2 組 × 10–12 下'],
      2: ['2 組 × 10 下', '2 組 × 12 下', '2–3 組 × 12–15 下（或加重一點）'],
      3: ['2 組 × 12 下', '3 組 × 12 下', '3 組 × 15 下（或加重一點）']
    }[lv];
    var rpe = { 1: ['3–4', '4', '4–5'], 2: ['4–5', '5', '5–6'], 3: ['5', '5–6', '6'] }[lv];
    var support =
      ctx.version === 'seated'
        ? ['雙手扶椅面', '單手扶椅面', '雙手放胸前']
        : { 1: ['雙手扶椅背', '單手扶椅背', '指尖輕觸椅背'], 2: ['單手扶椅背', '指尖輕觸椅背', '放手（椅子在旁）'], 3: ['指尖輕觸椅背', '放手（椅子在旁）', '放手並延長時間'] }[lv];
    var phases = [
      {
        weeks: '第 1–2 週',
        title: '適應期：學會正確動作',
        items: [
          '肌力動作 ' + reps[0] + '，先求姿勢正確',
          aerobicItems[0] + '，自覺費力 ' + rpe[0] + ' 分',
          '平衡練習：' + support[0],
          '每天記錄有沒有運動，養成習慣'
        ]
      },
      {
        weeks: '第 3–4 週',
        title: '漸進期：慢慢增加份量',
        items: [
          '肌力動作 ' + reps[1],
          aerobicItems[1] + '，自覺費力 ' + rpe[1] + ' 分',
          '平衡練習：' + support[1],
          '伸展每個動作停留到 30 秒'
        ]
      },
      {
        weeks: '第 5–6 週',
        title: '強化期：挑戰更進一步',
        items: [
          '肌力動作 ' + reps[2],
          aerobicItems[2] + '，自覺費力 ' + rpe[2] + ' 分',
          '平衡練習：' + support[2],
          '第 6 週回到據點重新檢測，看看進步多少！'
        ]
      }
    ];
    var targets = [];
    ctx.sft.items.forEach(function (it) {
      if (!it.measured) return;
      var t = YD.norms.TEST_MAP[it.key];
      var d = TARGET_DELTA[it.key];
      var row = { key: it.key, name: it.name, unit: it.unit, status: it.status, norm: YD.norms.formatNorm(it.key, it.norm) };
      if (it.unable) {
        row.current = '無法完成';
        row.target = it.key === 'chairStand' ? '扶手輔助完成 3–5 次' : '能安全完成檢測';
        row.targetValue = null;
      } else {
        var goal;
        if (it.status === 'below') goal = it.value + d;
        else if (it.status === 'normal') goal = it.value + d / 2;
        else goal = it.value;
        if (t.decimals === 0) goal = t.higherIsBetter ? Math.ceil(goal) : Math.floor(goal);
        else goal = Math.round(goal * 10) / 10;
        if (it.key === 'upAndGo') goal = Math.max(1, goal);
        row.current = YD.norms.formatValue(it.key, it.value);
        row.targetValue = goal;
        row.target = it.status === 'above' ? '維持 ' + YD.norms.formatValue(it.key, goal) : YD.norms.formatValue(it.key, goal);
      }
      targets.push(row);
    });
    var behavior = [
      '每週完成 ' + week.trainingDays + ' 天運動，並在月曆上打勾',
      '每週有氧運動逐步累積到 ' + weeklyGoal + ' 分鐘以上',
      '第 6 週回到據點重新做體適能檢測'
    ];
    return { phases: phases, targets: targets, behavior: behavior };
  }

  /* ------------------------------------------------------------------ */
  /* FITT                                                                */
  /* ------------------------------------------------------------------ */
  function buildFitt(ctx, sel, week) {
    var lv = ctx.level;
    var inten = INTENSITY[lv];
    var names = function (list) {
      return list
        .map(function (c) {
          return c.ex.name;
        })
        .join('、');
    };
    var strengthIntensity = {
      1: '輕度：自覺費力 3–4 分，最後 2 下覺得「有點累」',
      2: '中等：自覺費力 5–6 分，最後 2–3 下有點吃力但姿勢正確',
      3: '中等～稍強：自覺費力 6–7 分，可逐步加重'
    }[lv];
    return {
      aerobic: {
        F: '每週 ' + week.aerobicDays + ' 天（休息日也鼓勵散步、做家事多活動）',
        I: '自覺費力 ' + inten.rpe + ' 分（' + inten.label + '）；' + inten.talk,
        T: '每次 ' + week.aerobicPerDay + ' 分鐘（可分段完成）；目前每週 ' + week.aerobic + ' 分鐘，6 週內逐步累積到每週 ' + (lv === 1 ? 90 : 150) + ' 分鐘以上',
        T2: names(sel.aerobic)
      },
      strength: {
        F: '每週 ' + week.strengthDays + ' 天（不連續的日子）',
        I: strengthIntensity,
        T: sel.strength.length + ' 個動作，涵蓋腿、手臂與背部；' + YD.exercises.DOSE.reps[lv] + '，組間休息 1–2 分鐘',
        T2: names(sel.strength)
      },
      flexibility: {
        F: '每週 ' + week.flexDays + ' 天（每次運動後）',
        I: '伸展到「緊緊的、但不痛」的程度',
        T: YD.exercises.DOSE.stretch[lv].replace('每次', '每個動作每次') + '，累計 30–60 秒',
        T2: names(sel.flexibility)
      },
      balance: {
        F: '每週 ' + week.balanceDays + ' 天',
        I:
          ctx.version === 'seated'
            ? '由坐姿穩定練習開始，逐步減少手扶的支撐'
            : '由「雙手扶」→「單手扶」→「指尖輕觸」→「放手（旁邊有椅子）」逐步增加難度',
        T: '每次約 ' + week.plan.balanceS + '–' + Math.max(week.plan.balanceS, 10) + ' 分鐘',
        T2: names(sel.balance)
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* 安全守則                                                            */
  /* ------------------------------------------------------------------ */
  function buildSafety(ctx, cls) {
    var cond = [];
    ctx.conditions.forEach(function (k) {
      if (CONDITION_SAFETY[k]) cond.push({ key: k, label: YD.screening.labelOf(YD.screening.CONDITIONS, k), text: CONDITION_SAFETY[k] });
    });
    var alerts = [];
    if (cls.stopToday) {
      alerts.push({
        level: 'stop',
        text: cls.vitals.stopToday
          ? '今天血壓偏高，請先不要運動；休息後再量，持續偏高請就醫。'
          : '您有疑似心血管相關症狀，請先暫停運動並就醫評估，取得醫師同意後再開始。'
      });
    } else if (cls.needsClearance) {
      alerts.push({ level: 'clearance', text: cls.acsm.advice + '可以把這份處方帶給醫師參考。' });
    }
    cls.vitals.notes.forEach(function (n) {
      if (!cls.vitals.stopToday) alerts.push({ level: 'caution', text: n });
    });
    if (cls.fall.level !== 'low') {
      alerts.push({
        level: 'caution',
        text: '跌倒風險' + (cls.fall.level === 'high' ? '較高' : '中等') + '：運動時旁邊放一張穩固的椅子，最好有人陪同；家中走道保持暢通，浴室加裝扶手與止滑墊。'
      });
    }
    return {
      alerts: alerts,
      general: GENERAL_SAFETY.slice(),
      conditions: cond,
      stopSigns: STOP_SIGNS.slice(),
      rpeScale: RPE_SCALE.slice(),
      intensity: INTENSITY[ctx.level]
    };
  }

  /* ------------------------------------------------------------------ */
  /* 主函式                                                              */
  /* ------------------------------------------------------------------ */
  function build(input, cls) {
    cls = cls || YD.screening.classify(input);
    var health = input.health || {};
    var equipment = Array.isArray(health.equipment) ? health.equipment.slice() : ['band', 'weights', 'towel'];
    var ctx = {
      version: cls.version,
      level: cls.dose,
      risk: cls.level,
      sft: cls.sft,
      fallLevel: cls.fall.level,
      conditions: (health.conditions || []).slice(),
      pain: (health.painAreas || []).slice(),
      goals: (health.goals || []).slice(),
      focusAreas: (health.focusAreas || []).slice(),
      preferences: (health.preferences || []).slice(),
      equipment: equipment,
      daysPerWeek: health.daysPerWeek || 5,
      minutesPerSession: health.minutesPerSession || 30
    };
    ctx.canStand = canStand(input, cls);

    // 依每次運動時間決定動作數量：肌力每個動作約 3 分鐘（含組間休息）
    var sp = sessionPlan(ctx);
    var nStrength = Math.max(3, Math.min({ 1: 4, 2: 5, 3: 6 }[ctx.level], Math.floor(sp.strength / 3)));
    var nFlex = sp.cool >= 8 ? 4 : 3;
    var nBalance = sp.extraBalance ? 3 : 2;
    var sel = {
      strength: pick('strength', ctx, nStrength, ['legs', 'arms', 'back']),
      flexibility: pick('flexibility', ctx, nFlex, ['legs', 'shoulders']),
      balance: pick('balance', ctx, nBalance, []),
      aerobic: pick('aerobic', ctx, 2, [])
    };
    var week = buildWeek(ctx, sel);
    var fitt = buildFitt(ctx, sel, week);
    var goals = buildGoals(ctx, week);
    var safety = buildSafety(ctx, cls);

    var aerobicPerDay = week.aerobicPerDay;
    var exercises = [];
    ['aerobic', 'strength', 'balance', 'flexibility'].forEach(function (cat) {
      sel[cat].forEach(function (c) {
        exercises.push({
          id: c.ex.id,
          category: cat,
          dose:
            cat === 'aerobic'
              ? '每次 ' + aerobicPerDay + ' 分鐘，自覺費力 ' + INTENSITY[ctx.level].rpe + ' 分'
              : YD.exercises.doseText(c.ex, ctx.level),
          notes: notesFor(c.ex, ctx),
          substitutedFor: c.via
        });
      });
    });

    return {
      engineVersion: '1.0',
      version: cls.version,
      versionText: cls.versionText,
      level: ctx.level,
      levelText: cls.doseText,
      risk: cls.level,
      riskText: cls.levelText,
      intensity: INTENSITY[ctx.level],
      fitt: fitt,
      exercises: exercises,
      week: week,
      goals: goals,
      safety: safety,
      warmup: YD.exercises.WARMUP[cls.version],
      cooldown: YD.exercises.COOLDOWN[cls.version]
    };
  }

  /** 精簡摘要：給 AI 與本機說明文字使用（不含姓名等識別資料）。 */
  function summarize(input, cls, rx) {
    var p = input.profile || {};
    var h = input.health || {};
    var S = YD.screening;
    return {
      age: p.age,
      sex: p.sex === 'M' ? '男' : '女',
      risk: cls.levelText,
      riskReasons: cls.reasons.map(function (r) {
        return r.text;
      }),
      version: cls.versionText,
      versionReason: cls.versionReason,
      level: cls.doseText,
      acsm: cls.acsm.title,
      needsClearance: cls.needsClearance,
      stopToday: cls.stopToday,
      fallRisk: S.LEVEL_TEXT[cls.fall.level],
      sft: cls.sft.items
        .filter(function (i) {
          return i.measured;
        })
        .map(function (i) {
          return {
            item: i.name,
            domain: i.domain,
            value: i.unable ? '無法完成' : YD.norms.formatValue(i.key, i.value),
            status: YD.norms.STATUS_TEXT[i.status],
            percentile: i.percentile
          };
        }),
      weakest: cls.sft.weakest.map(function (i) {
        return i.domain;
      }),
      strongest: cls.sft.strongest.slice(0, 2).map(function (i) {
        return i.domain;
      }),
      conditions: (h.conditions || []).map(function (k) {
        return S.labelOf(S.CONDITIONS, k);
      }),
      painAreas: (h.painAreas || []).map(function (k) {
        return S.labelOf(S.PAIN_AREAS, k);
      }),
      goals: (h.goals || []).map(function (k) {
        return S.labelOf(S.GOALS, k);
      }),
      preferences: (h.preferences || []).map(function (k) {
        return S.labelOf(S.PREFERENCES, k);
      }),
      active: h.active === true,
      falls: Number(h.falls) || 0,
      weeklyMinutes: rx.week.total,
      daysPerWeek: rx.week.trainingDays,
      exercises: rx.exercises.map(function (e) {
        var ex = YD.exercises.get(e.id);
        return { id: e.id, name: ex.name, category: YD.exercises.CATEGORY[e.category].label, dose: e.dose };
      })
    };
  }

  YD.prescription = {
    DAY_NAMES: DAY_NAMES,
    INTENSITY: INTENSITY,
    STOP_SIGNS: STOP_SIGNS,
    RPE_SCALE: RPE_SCALE,
    CONDITION_SAFETY: CONDITION_SAFETY,
    build: build,
    summarize: summarize,
    _pick: pick
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
