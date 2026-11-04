/*
 * 銀動方程式 — 動作初篩、ACSM 運動前篩檢、跌倒風險與綜合風險分級
 *
 * 依據：
 *  - ACSM's Guidelines for Exercise Testing and Prescription (11th ed., 2021)
 *    運動前篩檢流程（Riebe et al., 2015, Med Sci Sports Exerc 47:2473–2479）。
 *  - CDC STEADI 跌倒風險三個關鍵問題（過去一年跌倒、站立/行走不穩、擔心跌倒）。
 *  - SFT 常模與功能風險門檻（見 norms.js）。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});

  /* ------------------------------------------------------------------ */
  /* Step 3 動作初篩：5 個是非題                                          */
  /* ------------------------------------------------------------------ */
  var MOBILITY_QUESTIONS = [
    {
      id: 'q1',
      icon: '🪑',
      text: '您可以不用手扶，自己從椅子上站起來嗎？',
      hint: '雙手交叉放在胸前，不扶扶手、桌子或別人。',
      key: false
    },
    {
      id: 'q2',
      icon: '🚶',
      text: '您可以不用拐杖或助行器，自己走 10 公尺嗎？',
      hint: '大約是一間教室的長度。',
      key: true
    },
    {
      id: 'q3',
      icon: '🧍',
      text: '您可以雙腳併攏站 10 秒鐘，不扶東西也不會搖晃嗎？',
      hint: '可以先在旁邊放一張椅子保護。',
      key: true
    },
    {
      id: 'q4',
      icon: '🪜',
      text: '您可以自己上下一層樓梯嗎？（可以扶扶手）',
      hint: '大約 12～15 階。',
      key: false
    },
    {
      id: 'q5',
      icon: '⏱️',
      text: '您可以連續站著 10 分鐘，不用坐下來休息嗎？',
      hint: '例如煮飯、排隊。',
      key: false
    }
  ];

  /**
   * 動作初篩分流。
   * 規則：關鍵安全題（獨立行走、靜態平衡）任一題「否」，或累計 2 題以上「否」
   *      → 坐姿適應版；其餘 → 標準版。
   * answers: { q1: true|false, ... }
   */
  function routeVersion(answers) {
    answers = answers || {};
    var no = [];
    var keyNo = [];
    MOBILITY_QUESTIONS.forEach(function (q) {
      if (answers[q.id] === false) {
        no.push(q);
        if (q.key) keyNo.push(q);
      }
    });
    var seated = keyNo.length > 0 || no.length >= 2;
    var reasons = [];
    if (keyNo.length) {
      reasons.push('關鍵安全題回答「否」：' + keyNo.map(shortQ).join('、'));
    }
    if (no.length >= 2) {
      reasons.push('共有 ' + no.length + ' 題回答「否」');
    }
    return {
      version: seated ? 'seated' : 'standard',
      noCount: no.length,
      noIds: no.map(function (q) {
        return q.id;
      }),
      keyFail: keyNo.length > 0,
      balanceFail: answers.q3 === false,
      walkFail: answers.q2 === false,
      riseFail: answers.q1 === false,
      complete: MOBILITY_QUESTIONS.every(function (q) {
        return typeof answers[q.id] === 'boolean';
      }),
      reasons: reasons
    };
  }

  function shortQ(q) {
    return {
      q1: '不扶物起身',
      q2: '獨立行走 10 公尺',
      q3: '雙腳併攏站 10 秒',
      q4: '上下一層樓梯',
      q5: '連續站立 10 分鐘'
    }[q.id];
  }

  /* ------------------------------------------------------------------ */
  /* Step 5 健康狀況選項                                                  */
  /* ------------------------------------------------------------------ */
  var CONDITIONS = [
    { key: 'hypertension', label: '高血壓', icon: '🩸', acsm: null },
    { key: 'diabetes', label: '糖尿病', icon: '🍬', acsm: 'metabolic' },
    { key: 'heart', label: '心臟病（冠心病、心衰竭、心律不整）', icon: '❤️', acsm: 'cardiovascular' },
    { key: 'stroke', label: '中風病史', icon: '🧠', acsm: 'cardiovascular' },
    { key: 'kidney', label: '慢性腎臟病（含洗腎）', icon: '🫘', acsm: 'renal' },
    { key: 'lung', label: '慢性肺病（COPD、氣喘）', icon: '🫁', acsm: null },
    { key: 'osteoporosis', label: '骨質疏鬆', icon: '🦴', acsm: null },
    { key: 'kneeOA', label: '膝關節退化／膝蓋痛', icon: '🦵', acsm: null },
    { key: 'backPain', label: '下背痛／脊椎問題', icon: '🧍', acsm: null },
    { key: 'shoulder', label: '肩關節問題（五十肩等）', icon: '💪', acsm: null },
    { key: 'jointReplacement', label: '人工關節（髖或膝）', icon: '🦿', acsm: null },
    { key: 'parkinson', label: '帕金森氏症', icon: '🤲', acsm: null },
    { key: 'dementia', label: '失智／記憶力退化', icon: '🧩', acsm: null },
    { key: 'vision', label: '視力不佳（白內障、青光眼等）', icon: '👓', acsm: null }
  ];

  // ACSM 運動前篩檢的徵狀（signs/symptoms suggestive of CV, metabolic or renal disease）
  var SYMPTOMS = [
    { key: 'chestPain', label: '活動時胸口悶、痛或有壓迫感（可能延伸到脖子、下巴、手臂）' },
    { key: 'breathless', label: '休息時或輕微活動（例如走平路）就很喘' },
    { key: 'dizzy', label: '曾經頭暈、快要昏倒或昏倒' },
    { key: 'orthopnea', label: '躺平時會喘，或半夜喘醒要坐起來' },
    { key: 'edema', label: '兩側腳踝水腫' },
    { key: 'palpitation', label: '心跳很快、不規則或心悸' },
    { key: 'claudication', label: '走路時小腿痠痛，停下休息就會好' },
    { key: 'murmur', label: '醫師說過有心雜音' },
    { key: 'fatigue', label: '做平常的事就異常疲累或喘' }
  ];

  var PAIN_AREAS = [
    { key: 'neck', label: '頸部' },
    { key: 'shoulder', label: '肩膀' },
    { key: 'wrist', label: '手腕' },
    { key: 'back', label: '腰背' },
    { key: 'hip', label: '髖部' },
    { key: 'knee', label: '膝蓋' },
    { key: 'ankle', label: '腳踝／足部' }
  ];

  var GOALS = [
    { key: 'fall', label: '預防跌倒、走路更穩', icon: '🛡️' },
    { key: 'legs', label: '腿更有力（起身、爬樓梯）', icon: '🦵' },
    { key: 'arms', label: '手臂更有力（提東西、抱孫）', icon: '💪' },
    { key: 'flex', label: '關節更靈活、減少僵硬', icon: '🤸' },
    { key: 'endurance', label: '體力更好、走遠不喘', icon: '🫀' },
    { key: 'chronic', label: '幫助控制血壓、血糖', icon: '🩺' },
    { key: 'weight', label: '體重管理', icon: '⚖️' },
    { key: 'mood', label: '心情愉快、睡得更好', icon: '😊' },
    { key: 'social', label: '和朋友一起運動', icon: '👥' }
  ];

  var FOCUS_AREAS = [
    { key: 'legs', label: '腿部' },
    { key: 'arms', label: '手臂' },
    { key: 'shoulders', label: '肩膀' },
    { key: 'back', label: '腰背' },
    { key: 'core', label: '腹部核心' },
    { key: 'balance', label: '平衡感' }
  ];

  var PREFERENCES = [
    { key: 'walking', label: '散步／健走' },
    { key: 'taichi', label: '太極拳／八段錦／氣功' },
    { key: 'dance', label: '跳舞／健康操' },
    { key: 'cycling', label: '騎腳踏車／固定式腳踏車' },
    { key: 'swimming', label: '游泳／水中運動' },
    { key: 'group', label: '據點團體課程' }
  ];

  var EQUIPMENT = [
    { key: 'band', label: '彈力帶' },
    { key: 'weights', label: '啞鈴或裝水寶特瓶' },
    { key: 'towel', label: '毛巾' }
  ];

  function has(list, key) {
    return Array.isArray(list) && list.indexOf(key) !== -1;
  }

  function labelOf(list, key) {
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i].label;
    return key;
  }

  /* ------------------------------------------------------------------ */
  /* ACSM 運動前篩檢                                                     */
  /* ------------------------------------------------------------------ */
  /**
   * @param health { active: bool|null, conditions: [], symptoms: [] }
   * 回傳 { knownDisease: [], symptomatic, clearance, code, title, advice }
   *   clearance: 'none' | 'vigorous-only' | 'recommended' | 'stop'
   */
  function acsmScreen(health) {
    health = health || {};
    var conditions = health.conditions || [];
    var symptoms = health.symptoms || [];
    var known = CONDITIONS.filter(function (c) {
      return c.acsm && has(conditions, c.key);
    });
    var categories = {};
    known.forEach(function (c) {
      categories[c.acsm] = true;
    });
    var symptomatic = symptoms.length > 0;
    var active = health.active === true;
    var res = {
      active: active,
      knownDisease: known.map(function (c) {
        return c.key;
      }),
      diseaseCategories: Object.keys(categories),
      symptomatic: symptomatic,
      symptoms: symptoms.slice()
    };
    var catText = Object.keys(categories)
      .map(function (k) {
        return { cardiovascular: '心血管', metabolic: '代謝', renal: '腎臟' }[k];
      })
      .join('／');
    if (!active) {
      if (symptomatic) {
        res.clearance = 'recommended';
        res.code = 'N-S';
        res.title = '建議先就醫評估';
        res.advice = '目前沒有規律運動，且有疑似心血管相關徵狀。建議先就醫評估、取得醫師同意後，再從輕度強度開始運動。';
      } else if (known.length) {
        res.clearance = 'recommended';
        res.code = 'N-D';
        res.title = '建議取得醫師同意';
        res.advice =
          '目前沒有規律運動，且有已知' + catText + '疾病。建議先取得醫師同意（醫療許可），再從輕度到中等強度開始，逐步增加。';
      } else {
        res.clearance = 'none';
        res.code = 'N-0';
        res.title = '可以開始運動';
        res.advice = '不需醫療許可。建議從輕度到中等強度開始，依循漸進原則慢慢增加。';
      }
    } else {
      if (symptomatic) {
        res.clearance = 'stop';
        res.code = 'A-S';
        res.title = '請先暫停運動並就醫';
        res.advice = '雖然有規律運動，但出現疑似心血管相關徵狀。請先暫停運動，就醫評估並取得醫師同意後再恢復。';
      } else if (known.length) {
        res.clearance = 'vigorous-only';
        res.code = 'A-D';
        res.title = '可持續中等強度運動';
        res.advice = '中等強度運動不需醫療許可，可持續進行；若想進行高強度運動，請先取得醫師同意。';
      } else {
        res.clearance = 'none';
        res.code = 'A-0';
        res.title = '可持續運動';
        res.advice = '不需醫療許可。可持續中等強度運動，並依循漸進原則增加。';
      }
    }
    res.needsClearance = res.clearance === 'recommended' || res.clearance === 'stop';
    return res;
  }

  /* ------------------------------------------------------------------ */
  /* 血壓與安靜心跳                                                      */
  /* ------------------------------------------------------------------ */
  function vitalsCheck(health) {
    health = health || {};
    var sys = num(health.bpSys);
    var dia = num(health.bpDia);
    var hr = num(health.restingHr);
    var out = { level: 'ok', notes: [], stopToday: false };
    if (sys !== null || dia !== null) {
      if ((sys !== null && sys >= 180) || (dia !== null && dia >= 110)) {
        out.level = 'stop';
        out.stopToday = true;
        out.notes.push('血壓 ' + fmtBp(sys, dia) + ' 偏高（≥180/110）：今天先不要運動，休息後再量；持續偏高請就醫。');
      } else if ((sys !== null && sys >= 160) || (dia !== null && dia >= 100)) {
        out.level = 'caution';
        out.notes.push('血壓 ' + fmtBp(sys, dia) + ' 偏高（≥160/100）：今天只做輕度運動，避免憋氣用力，並請追蹤血壓。');
      } else if (sys !== null && sys < 90) {
        out.level = 'caution';
        out.notes.push('收縮壓 ' + sys + ' 偏低（<90）：起身動作放慢，留意頭暈。');
      }
    }
    if (hr !== null) {
      if (hr > 100) {
        if (out.level === 'ok') out.level = 'caution';
        out.notes.push('安靜心跳 ' + hr + ' 次/分偏快（>100）：建議先休息再測，持續偏快請就醫評估。');
      } else if (hr < 50) {
        if (out.level === 'ok') out.level = 'caution';
        out.notes.push('安靜心跳 ' + hr + ' 次/分偏慢（<50）：若有頭暈、無力請就醫評估。');
      }
    }
    return out;
  }

  function fmtBp(s, d) {
    return (s === null ? '—' : s) + '/' + (d === null ? '—' : d) + ' mmHg';
  }

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  /* ------------------------------------------------------------------ */
  /* 跌倒風險（STEADI 關鍵問題 + 客觀檢測）                               */
  /* ------------------------------------------------------------------ */
  function fallRisk(health, sftScore, route) {
    health = health || {};
    var factors = [];
    var points = 0;
    var falls = Number(health.falls) || 0;
    if (falls >= 2) {
      points += 4;
      factors.push('過去一年跌倒 2 次以上');
    } else if (falls === 1) {
      points += 2;
      factors.push('過去一年跌倒 1 次');
    }
    if (health.unsteady) {
      points += 1;
      factors.push('站立或走路時覺得不穩');
    }
    if (health.fearOfFalling) {
      points += 1;
      factors.push('擔心自己會跌倒');
    }
    var ug = sftScore && sftScore.byKey && sftScore.byKey.upAndGo;
    if (ug && ug.unable) {
      points += 2;
      factors.push('無法完成 8 英呎起身繞行');
    } else if (ug && ug.fallRisk) {
      points += 2;
      factors.push('8 英呎起身繞行 ' + ug.value + ' 秒（> 8.5 秒為跌倒風險指標）');
    }
    var cs = sftScore && sftScore.byKey && sftScore.byKey.chairStand;
    if (cs && (cs.status === 'below' || cs.unable)) {
      points += 1;
      factors.push('30 秒坐站低於同齡常模（下肢肌力不足）');
    }
    if (route && route.balanceFail) {
      points += 2;
      factors.push('無法雙腳併攏站穩 10 秒');
    }
    var level = points >= 4 ? 'high' : points >= 2 ? 'moderate' : 'low';
    return { level: level, points: points, factors: factors };
  }

  /* ------------------------------------------------------------------ */
  /* 綜合風險分級                                                        */
  /* ------------------------------------------------------------------ */
  var LEVEL_ORDER = { low: 0, moderate: 1, high: 2 };
  var LEVEL_TEXT = { low: '低風險', moderate: '中風險', high: '高風險' };

  /**
   * 綜合 ACSM 篩檢、SFT 常模、跌倒風險、動作初篩、血壓，判定低／中／高風險，
   * 並決定處方版本（高風險或初篩未通過 → 坐姿適應版）。
   */
  function classify(input) {
    var profile = input.profile || {};
    var health = input.health || {};
    var route = routeVersion(input.screening || {});
    var sft = YD.norms.scoreAll(input.sft || {}, profile.sex, profile.age);
    var acsm = acsmScreen(health);
    var fall = fallRisk(health, sft, route);
    var vitals = vitalsCheck(health);

    var reasons = [];
    function add(level, text) {
      reasons.push({ level: level, text: text });
    }

    // 高風險條件
    if (acsm.symptomatic) add('high', 'ACSM 篩檢：有疑似心血管相關徵狀，需先就醫評估');
    if (vitals.stopToday) add('high', '血壓 ≥ 180/110 mmHg，今日不宜運動');
    if (route.version === 'seated') add('high', '動作初篩未通過（' + route.reasons.join('；') + '）');
    if (fall.level === 'high') add('high', '跌倒風險高：' + fall.factors.join('、'));
    if (sft.belowCount >= 4) add('high', '六項體適能中有 ' + sft.belowCount + ' 項低於同齡常模');
    else if (sft.riskZoneCount >= 2) add('high', '有 ' + sft.riskZoneCount + ' 項落在功能退化風險區');

    // 中風險條件
    if (!acsm.symptomatic && acsm.knownDisease.length) {
      add(
        'moderate',
        'ACSM 篩檢：有已知' +
          acsm.knownDisease
            .map(function (k) {
              return labelOf(CONDITIONS, k).replace(/（.*）/, '');
            })
            .join('、') +
          '（無徵狀）'
      );
    }
    if (vitals.level === 'caution') add('moderate', vitals.notes.join(' '));
    if (fall.level === 'moderate') add('moderate', '跌倒風險中等：' + fall.factors.join('、'));
    if (sft.belowCount >= 2 && sft.belowCount <= 3) add('moderate', '六項體適能中有 ' + sft.belowCount + ' 項低於同齡常模');
    else if (sft.belowCount < 4 && sft.riskZoneCount === 1) add('moderate', '有 1 項落在功能退化風險區');
    if (health.doctorRestriction) add('moderate', '醫師曾建議限制部分運動');

    var level = 'low';
    reasons.forEach(function (r) {
      if (LEVEL_ORDER[r.level] > LEVEL_ORDER[level]) level = r.level;
    });
    if (!reasons.length) {
      add('low', sft.measuredCount ? '體適能多在同齡常模範圍內，無明顯風險因子' : '無明顯風險因子');
    }

    var version = route.version === 'seated' || level === 'high' ? 'seated' : 'standard';
    var versionReason =
      route.version === 'seated'
        ? '動作初篩未通過，自動切換為坐姿適應版'
        : level === 'high'
        ? '綜合評估為高風險，自動切換為坐姿適應版'
        : '動作初篩通過，採用標準版';

    // 劑量等級：1 入門、2 基礎、3 進階
    var mp = sft.meanPercentile;
    var dose = mp === null ? 2 : mp < 25 ? 1 : mp < 50 ? 2 : 3;
    if (level === 'high') dose = 1;
    if (level === 'moderate') dose = Math.min(dose, 2);
    if (health.active !== true) dose = Math.min(dose, 2);
    if (vitals.level === 'caution' || acsm.needsClearance) dose = 1;

    return {
      level: level,
      levelText: LEVEL_TEXT[level],
      reasons: reasons,
      version: version,
      versionText: version === 'seated' ? '坐姿適應版' : '標準版',
      versionReason: versionReason,
      dose: dose,
      doseText: { 1: '入門', 2: '基礎', 3: '進階' }[dose],
      route: route,
      sft: sft,
      acsm: acsm,
      fall: fall,
      vitals: vitals,
      needsClearance: acsm.needsClearance,
      stopToday: vitals.stopToday || acsm.clearance === 'stop'
    };
  }

  YD.screening = {
    MOBILITY_QUESTIONS: MOBILITY_QUESTIONS,
    CONDITIONS: CONDITIONS,
    SYMPTOMS: SYMPTOMS,
    PAIN_AREAS: PAIN_AREAS,
    GOALS: GOALS,
    FOCUS_AREAS: FOCUS_AREAS,
    PREFERENCES: PREFERENCES,
    EQUIPMENT: EQUIPMENT,
    LEVEL_TEXT: LEVEL_TEXT,
    routeVersion: routeVersion,
    acsmScreen: acsmScreen,
    vitalsCheck: vitalsCheck,
    fallRisk: fallRisk,
    classify: classify,
    labelOf: labelOf,
    has: has
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
