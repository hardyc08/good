/*
 * 銀動方程式 — 運動動作資料庫
 *
 * 分類：aerobic 有氧、strength 肌力、flexibility 柔軟度、balance 平衡（神經動作訓練）。
 * versions：standard 標準版、seated 坐姿適應版。
 * targets：可改善的 SFT 檢測項目；focus：身體部位；avoid：需排除的疾病／疼痛部位；
 * modify：針對特定疾病的調整建議（會顯示在處方中）。
 * figure：示範人偶動畫規格（見 lib/figure.js）。
 *
 * 劑量原則依 ACSM 高齡者運動建議（ACSM's Guidelines, 11th ed.）：
 *   肌力 1–3 組 × 8–15 下、每週 ≥2 天；伸展停留 30–60 秒、每週 ≥2 天；
 *   平衡每週 2–3 天；有氧中等強度每週累積 150 分鐘。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});

  var CATEGORY = {
    aerobic: { label: '有氧', full: '有氧耐力', icon: '🫀', color: 'aer' },
    strength: { label: '肌力', full: '肌力訓練', icon: '💪', color: 'str' },
    flexibility: { label: '柔軟度', full: '伸展柔軟', icon: '🤸', color: 'flx' },
    balance: { label: '平衡', full: '平衡訓練', icon: '🧘', color: 'bal' }
  };

  // 通用劑量（依等級 1 入門、2 基礎、3 進階）
  var DOSE = {
    reps: { 1: '1–2 組 × 每組 8–10 下', 2: '2 組 × 每組 10–12 下', 3: '2–3 組 × 每組 12–15 下' },
    repsSide: { 1: '每邊 1–2 組 × 8–10 下', 2: '每邊 2 組 × 10–12 下', 3: '每邊 2–3 組 × 12–15 下' },
    stretch: { 1: '每次停留 15 秒 × 2–3 次', 2: '每次停留 20–30 秒 × 2 次', 3: '每次停留 30 秒 × 2 次' },
    stretchSide: { 1: '每邊停留 15 秒 × 2–3 次', 2: '每邊停留 20–30 秒 × 2 次', 3: '每邊停留 30 秒 × 2 次' }
  };

  // 道具與位置（座標見 figure.js：地面 y=206、坐姿髖部 y=160）
  var CHAIR = { type: 'chair', x: 80 };
  var CHAIR_ARMS = { type: 'chair', x: 80, arms: true };
  var CHAIR_FRONT_SUPPORT = { type: 'chair', x: 150, back: 'left' };
  var CHAIR_SIDE_SUPPORT = { type: 'chair', x: 158, back: 'left', view: 'side' };
  var CHAIR_FRONT_VIEW = { type: 'chair', view: 'front' };
  var CHAIR_BACK_TOP = [148, 110];

  var ARMS_CROSSED = { shN: 22, elN: 128, shF: 18, elF: 128 };
  function merge() {
    var o = {};
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      if (a) Object.keys(a).forEach(function (k) {
        o[k] = a[k];
      });
    }
    return o;
  }

  /* ================================================================== */
  /* 動作示範規格                                                        */
  /* ================================================================== */
  var SIT_TO_STAND = {
    view: 'side',
    anchor: { joint: 'ankleN', at: [140, 202] },
    props: [CHAIR],
    hold: 350,
    dur: 950,
    frames: [
      merge({ trunk: 16, hipN: 88, kneeN: 98, ankleN: 10, hipF: 86, kneeF: 96, ankleF: 10 }, ARMS_CROSSED),
      merge({ trunk: 40, hipN: 62, kneeN: 78, ankleN: 16, hipF: 61, kneeF: 77, ankleF: 16 }, ARMS_CROSSED),
      merge({ trunk: 3, hipN: 0, kneeN: 0, ankleN: 0, hipF: 0, kneeF: 0, ankleF: 0 }, ARMS_CROSSED),
      merge({ trunk: 40, hipN: 62, kneeN: 78, ankleN: 16, hipF: 61, kneeF: 77, ankleF: 16 }, ARMS_CROSSED)
    ]
  };

  var WALK_FRAMES = [
    { anchor: { joint: 'hip', at: [120, 124] }, hipN: 24, kneeN: 4, ankleN: 6, hipF: -16, kneeF: 14, ankleF: -12, shN: -24, elN: 30, shF: 26, elF: 34 },
    { anchor: { joint: 'hip', at: [120, 117] }, hipN: 0, kneeN: 2, ankleN: 0, hipF: 18, kneeF: 48, ankleF: -5, shN: 0, elN: 26, shF: 0, elF: 26 },
    { anchor: { joint: 'hip', at: [120, 124] }, hipF: 24, kneeF: 4, ankleF: 6, hipN: -16, kneeN: 14, ankleN: -12, shF: -24, elF: 30, shN: 26, elN: 34 },
    { anchor: { joint: 'hip', at: [120, 117] }, hipF: 0, kneeF: 2, ankleF: 0, hipN: 18, kneeN: 48, ankleN: -5, shF: 0, elF: 26, shN: 0, elN: 26 }
  ];

  var MARCH = {
    view: 'side',
    hold: 120,
    dur: 520,
    frames: [
      { anchor: { joint: 'ankleN', at: [120, 202] } },
      { anchor: { joint: 'ankleF', at: [120, 202] }, hipN: 74, kneeN: 86, ankleN: 4, shF: 38, elF: 70, shN: -18, elN: 40 },
      { anchor: { joint: 'ankleN', at: [120, 202] } },
      { anchor: { joint: 'ankleN', at: [120, 202] }, hipF: 74, kneeF: 86, ankleF: 4, shN: 38, elN: 70, shF: -18, elF: 40 }
    ]
  };

  var SEATED_HAMSTRING = {
    view: 'side',
    base: 'seat',
    anchor: { joint: 'hip', at: [116, 160] },
    props: [CHAIR],
    hold: 900,
    dur: 1400,
    frames: [
      { trunk: 0, hipN: 62, kneeN: 0, ankleN: 28, ik: { handN: [142, 166], handF: [140, 164] } },
      { trunk: 32, head: 6, hipN: 62, kneeN: 0, ankleN: 28, ik: { handN: [168, 184], handF: [166, 182] } }
    ]
  };

  var BACK_SCRATCH = {
    view: 'front',
    back: true,
    hold: 900,
    dur: 1300,
    frames: [
      { ik: { handR: { at: [122, 58], bend: -1 }, handL: [118, 98] } },
      { ik: { handR: { at: [121, 49], bend: -1 }, handL: [119, 86] } }
    ]
  };

  /* ================================================================== */
  /* 動作清單                                                            */
  /* ================================================================== */
  var LIST = [
    /* -------------------------- 有氧 -------------------------- */
    {
      id: 'brisk-walk',
      name: '健走（快走）',
      category: 'aerobic',
      versions: ['standard'],
      targets: ['stepTest', 'upAndGo'],
      focus: ['legs'],
      prefer: ['walking'],
      equipment: [],
      steps: [
        '穿合腳、止滑的運動鞋，選平坦、光線充足的路線（公園、操場、騎樓）。',
        '抬頭挺胸、眼睛看前方，肩膀放鬆。',
        '手肘自然彎曲，前後擺動手臂，和腳步交替。',
        '腳跟先著地再滾到腳尖，步伐比平常散步稍大、稍快。',
        '前 3–5 分鐘慢走暖身，最後 3–5 分鐘放慢速度緩和。'
      ],
      cautions: [
        '強度以「可以說話、但沒辦法唱歌」為準。',
        '避開中午炎熱時段，隨身帶水；下雨或路面濕滑就改在室內原地踏步。'
      ],
      tip: '找朋友一起走，邊走邊聊，最容易持之以恆。',
      breath: '自然呼吸，不要憋氣。',
      modify: {
        kneeOA: '選平地，避免上下坡和樓梯；膝蓋痛時縮短時間、分段走。',
        vision: '走熟悉、光線充足的路線，最好有人陪同。',
        parkinson: '刻意跨大步、手臂擺大，轉彎時放慢。',
        lung: '採「走 2–3 分鐘、休息 1 分鐘」的間歇方式，配合噘嘴呼吸。',
        heart: '暖身與緩和各延長到 10 分鐘，保持「輕鬆到有點喘」的強度。'
      },
      figure: { view: 'side', hold: 0, dur: 430, frames: WALK_FRAMES }
    },
    {
      id: 'march-in-place',
      name: '原地抬膝踏步',
      category: 'aerobic',
      versions: ['standard'],
      targets: ['stepTest', 'upAndGo'],
      focus: ['legs', 'core'],
      prefer: [],
      equipment: [],
      steps: [
        '站在椅背或牆邊（需要時可以扶著），雙腳與肩同寬。',
        '抬頭挺胸，左右腳輪流把膝蓋抬高，盡量抬到大腿接近水平。',
        '手臂跟著前後擺動，維持穩定的節奏。',
        '從每次 3–5 分鐘開始，逐漸增加到 10 分鐘以上。'
      ],
      cautions: ['身體不要後仰，腳落地要輕。', '覺得不穩時，單手扶椅背再做。'],
      tip: '可以邊看電視邊踏步，廣告時間就是運動時間！',
      breath: '配合踏步節奏自然呼吸。',
      modify: {
        kneeOA: '膝蓋抬到不痛的高度就好，速度放慢。',
        hypertension: '保持中等速度，不要突然加快。',
        lung: '踏 2 分鐘、休息 1 分鐘，重複進行。'
      },
      figure: MARCH
    },
    {
      id: 'tai-chi',
      name: '太極拳／八段錦（雲手）',
      category: 'aerobic',
      alsoBalance: true,
      versions: ['standard'],
      targets: ['upAndGo', 'stepTest'],
      focus: ['balance', 'legs'],
      prefer: ['taichi'],
      equipment: [],
      steps: [
        '雙腳打開比肩稍寬，膝蓋微彎，身體放鬆。',
        '重心慢慢移到右腳，右手在臉前畫弧、左手在腹前畫弧。',
        '再把重心慢慢移到左腳，左右手交換位置。',
        '動作像雲一樣連續、緩慢，眼睛跟著上面的手移動。',
        '建議參加據點的太極或八段錦課程，跟著老師做最安全。'
      ],
      cautions: ['膝蓋不要超過腳尖太多，也不要往內夾。', '轉身時用腰帶動，不要扭膝蓋。'],
      tip: '研究顯示太極拳能有效降低長者跌倒的風險。',
      breath: '動作緩慢，配合深長的呼吸。',
      modify: {
        kneeOA: '站高一點，膝蓋只微彎。',
        parkinson: '動作放大、放慢，旁邊放一張椅子保護。',
        vision: '在光線充足、地面平整的地方練習。'
      },
      figure: {
        view: 'front',
        hold: 300,
        dur: 1500,
        frames: [
          { anchor: { joint: 'hip', at: [112, 122] }, twist: -20, head: -4, ik: { ankleR: [98, 202], ankleL: [142, 202], handR: [88, 72], handL: [114, 106] } },
          { anchor: { joint: 'hip', at: [128, 122] }, twist: 20, head: 4, ik: { ankleR: [98, 202], ankleL: [142, 202], handL: [152, 72], handR: [126, 106] } }
        ]
      }
    },
    {
      id: 'seated-march',
      name: '坐姿原地踏步',
      category: 'aerobic',
      versions: ['seated'],
      targets: ['stepTest', 'chairStand'],
      focus: ['legs', 'core'],
      equipment: [],
      steps: [
        '坐在椅子前半部，背挺直，雙腳平踩地面。',
        '左右腳輪流抬起膝蓋，像在走路一樣。',
        '手臂跟著前後擺動，增加運動量。',
        '從每次 3–5 分鐘開始，逐漸增加到 10–15 分鐘。'
      ],
      cautions: ['身體不要往後靠倒，保持挺胸。', '椅子要穩、不要有輪子。'],
      tip: '可以跟著喜歡的音樂節奏踏步，時間過得特別快。',
      breath: '配合節奏自然呼吸，不要憋氣。',
      modify: {
        heart: '保持輕鬆的速度，暖身、緩和各 5–10 分鐘。',
        lung: '踏 1–2 分鐘、休息 1 分鐘，重複進行。'
      },
      figure: {
        view: 'side',
        base: 'seat',
        props: [CHAIR],
        hold: 120,
        dur: 520,
        frames: [
          {},
          { hipN: 112, kneeN: 104, shF: 34, elF: 72, shN: -10, elN: 58 },
          {},
          { hipF: 112, kneeF: 104, shN: 34, elN: 72, shF: -10, elF: 58 }
        ]
      }
    },
    {
      id: 'seated-punch',
      name: '坐姿出拳',
      category: 'aerobic',
      versions: ['seated'],
      targets: ['armCurl', 'stepTest'],
      focus: ['arms', 'shoulders'],
      equipment: [],
      steps: [
        '坐在椅子前半部，背挺直，雙手握拳放在胸前。',
        '右手向前出拳，手臂伸直後收回胸前。',
        '換左手出拳，左右交替，維持穩定節奏。',
        '每次 1–2 分鐘，休息 30 秒，重複 3–5 回。'
      ],
      cautions: ['手肘不要用力打到完全鎖死。', '肩膀放鬆，不要聳肩。'],
      tip: '可以搭配坐姿踏步一起做，有氧效果更好。',
      breath: '出拳時吐氣、收回時吸氣。',
      modify: {
        shoulder: '只往前出拳到不痛的高度（胸口高度以下）。',
        hypertension: '速度適中，不要用盡全力。'
      },
      figure: {
        view: 'side',
        base: 'seat',
        props: [CHAIR],
        hold: 120,
        dur: 420,
        frames: [
          { trunk: 0, shN: 15, elN: 125, shF: 12, elF: 125 },
          { trunk: 2, shN: 86, elN: 0, shF: 12, elF: 125 },
          { trunk: 0, shN: 15, elN: 125, shF: 12, elF: 125 },
          { trunk: 2, shN: 15, elN: 125, shF: 86, elF: 0 }
        ]
      }
    },
    {
      id: 'seated-jacks',
      name: '坐姿開合（手腳開合）',
      category: 'aerobic',
      versions: ['seated'],
      targets: ['stepTest', 'backScratch'],
      focus: ['shoulders', 'legs'],
      equipment: [],
      steps: [
        '坐在椅子前半部，雙腳併攏、雙手放在大腿兩側。',
        '雙手從兩側往上舉高，同時雙腳往兩側打開踩地。',
        '再把手放下、腳收回併攏。',
        '連續做 30 秒，休息 30 秒，重複 4–6 回。'
      ],
      cautions: ['手舉到不痛的高度就好。', '腳打開時踩穩地面，不要滑動。'],
      tip: '像在椅子上做「開合跳」，安全又能讓心跳加快。',
      breath: '手舉起時吸氣、放下時吐氣。',
      modify: {
        shoulder: '手只舉到肩膀高度（側平舉），不要舉過頭。'
      },
      figure: {
        view: 'front',
        base: 'seat',
        props: [CHAIR_FRONT_VIEW],
        hold: 150,
        dur: 520,
        frames: [
          { shR: 14, elR: 14, shL: 14, elL: 14, hipR: 5, hipL: 5 },
          { shR: 160, elR: 10, shL: 160, elL: 10, hipR: 24, hipL: 24 }
        ]
      }
    },

    /* -------------------------- 肌力 -------------------------- */
    {
      id: 'chair-squat',
      name: '椅子坐站（椅子深蹲）',
      category: 'strength',
      versions: ['standard'],
      targets: ['chairStand', 'upAndGo'],
      focus: ['legs', 'core'],
      equipment: [],
      dose: DOSE.reps,
      steps: [
        '椅子靠牆放穩，坐在椅子前半部，雙腳與肩同寬踩穩，腳尖稍微朝外。',
        '雙手交叉放在胸前（覺得不穩時可以扶扶手）。',
        '身體微微向前傾，「吐氣」時用腿的力量站起來，站直後停 1 秒。',
        '「吸氣」時屁股往後推，慢慢坐回椅子，輕碰椅面就再站起來。'
      ],
      cautions: [
        '膝蓋對準第二、三根腳趾，不要往內夾（膝蓋內扣容易受傷）。',
        '背部打直，從髖部往前傾，不要彎腰駝背。',
        '慢慢坐下，不要「跌坐」回椅子；全程不要憋氣。'
      ],
      tip: '這是最重要的「起身」練習，練好了上廁所、上下車都更輕鬆。',
      breath: '站起來吐氣、坐下去吸氣。',
      modify: {
        kneeOA: '只蹲到一半（屁股輕碰椅面就站起），可以在椅子上多放一個坐墊提高高度。',
        jointReplacement: '人工髖關節者坐高一點，身體不要過度前彎（髖部不超過 90 度）。',
        backPain: '全程保持背部挺直，用髖部前傾代替彎腰。',
        hypertension: '起身時吐氣，絕對不要憋氣用力。'
      },
      figure: SIT_TO_STAND
    },
    {
      id: 'wall-pushup',
      name: '靠牆伏地挺身',
      category: 'strength',
      versions: ['standard'],
      targets: ['armCurl'],
      focus: ['arms', 'shoulders', 'core'],
      equipment: [],
      dose: DOSE.reps,
      steps: [
        '面對牆壁站在約一個手臂長的距離，雙腳與肩同寬。',
        '雙手張開比肩稍寬，手掌平貼牆面、與肩膀同高。',
        '「吸氣」時彎曲手肘，身體保持一直線、慢慢靠近牆壁。',
        '「吐氣」時手推牆，慢慢把身體推回原位。'
      ],
      cautions: ['身體從頭到腳保持一直線，不要塌腰或翹屁股。', '鞋子要止滑，避免腳往後滑。'],
      tip: '比一般伏地挺身安全很多，站得離牆越遠越吃力。',
      breath: '靠近牆吸氣、推回來吐氣。',
      modify: {
        shoulder: '雙手位置放低一點（胸口高度），只做到不痛的範圍。',
        hypertension: '推牆時吐氣，不要憋氣。',
        wrist: '手腕痛時可改用拳頭面或前臂靠牆，減少手腕壓力。'
      },
      figure: {
        view: 'side',
        anchor: { joint: 'ankleN', at: [112, 202] },
        props: [{ type: 'wall', x: 206 }],
        hold: 350,
        dur: 1100,
        frames: [
          { trunk: 16, hipN: -16, ankleN: 16, hipF: -16, ankleF: 16, ik: { handN: [203, 74], handF: [203, 76] } },
          { trunk: 30, hipN: -30, ankleN: 30, hipF: -30, ankleF: 30, ik: { handN: [203, 74], handF: [203, 76] } }
        ]
      }
    },
    {
      id: 'bottle-curl',
      name: '水瓶手臂彎舉（站姿）',
      category: 'strength',
      versions: ['standard'],
      targets: ['armCurl'],
      focus: ['arms'],
      equipment: ['weights'],
      fallback: 'band-curl',
      dose: DOSE.reps,
      steps: [
        '雙腳與肩同寬站穩，雙手各拿一瓶裝水的寶特瓶（或啞鈴），手臂自然下垂、掌心朝前。',
        '上臂貼緊身體，「吐氣」時彎曲手肘，把水瓶舉到肩膀前方。',
        '停 1 秒，「吸氣」時慢慢放下到手臂伸直。'
      ],
      cautions: ['上臂不要前後晃動、身體不要往後仰借力。', '先從 600 cc 水瓶開始，輕鬆完成後再加重。'],
      tip: '練好手臂力量，提菜籃、抱孫子都更輕鬆。',
      breath: '舉起吐氣、放下吸氣。',
      modify: {
        wrist: '手腕保持正直，不要往內彎。',
        kidney: '有洗腎瘻管的那一隻手不要拿重物，只練另一手。'
      },
      figure: {
        view: 'side',
        props: [{ type: 'weight', at: 'handF' }, { type: 'weight', at: 'handN' }],
        hold: 300,
        dur: 900,
        frames: [
          { shN: 2, elN: 6, shF: -2, elF: 6 },
          { shN: 6, elN: 140, shF: 2, elF: 140 }
        ]
      }
    },
    {
      id: 'band-curl',
      name: '彈力帶手臂彎舉',
      category: 'strength',
      versions: ['standard', 'seated'],
      targets: ['armCurl'],
      focus: ['arms'],
      equipment: ['band'],
      fallback: 'seated-curl',
      dose: DOSE.reps,
      steps: [
        '坐在椅子前半部，雙腳踩住彈力帶中段，雙手握住兩端，手臂伸直、掌心朝上。',
        '上臂貼緊身體，「吐氣」時彎曲手肘把彈力帶拉到肩膀前方。',
        '停 1 秒，「吸氣」時慢慢放回。'
      ],
      cautions: ['放回時要慢，不要讓彈力帶彈回去。', '彈力帶有裂痕時請更換。'],
      tip: '彈力帶越短越吃力，可以用握的位置調整強度。',
      breath: '拉起吐氣、放回吸氣。',
      modify: { wrist: '手腕保持正直，不要往內彎。' },
      figure: {
        view: 'side',
        base: 'seat',
        props: [CHAIR, { type: 'band', a: 'handN', b: 'toeN' }],
        hold: 300,
        dur: 900,
        frames: [
          { shN: 4, elN: 20, shF: 2, elF: 20 },
          { shN: 8, elN: 135, shF: 6, elF: 135 }
        ]
      }
    },
    {
      id: 'seated-curl',
      name: '坐姿水瓶彎舉',
      category: 'strength',
      versions: ['seated'],
      targets: ['armCurl'],
      focus: ['arms'],
      equipment: [],
      dose: DOSE.reps,
      steps: [
        '坐在椅子上背挺直，雙手各拿一瓶裝水的寶特瓶，手臂自然下垂。',
        '上臂貼緊身體，「吐氣」時彎曲手肘把水瓶舉到肩膀前方。',
        '停 1 秒，「吸氣」時慢慢放下。',
        '沒有水瓶時，可以握拳做同樣動作。'
      ],
      cautions: ['身體不要往後靠借力。', '先用 600 cc 水瓶，輕鬆完成後再加重。'],
      tip: '坐著也能練出有力的手臂！',
      breath: '舉起吐氣、放下吸氣。',
      modify: { kidney: '有洗腎瘻管的那一隻手不要拿重物。', wrist: '手腕保持正直。' },
      figure: {
        view: 'side',
        base: 'seat',
        anchor: { joint: 'hip', at: [108, 160] },
        props: [CHAIR, { type: 'weight', at: 'handF' }, { type: 'weight', at: 'handN' }],
        hold: 300,
        dur: 900,
        frames: [
          { trunk: 0, shN: 2, elN: 8, shF: -2, elF: 8 },
          { trunk: 0, shN: 6, elN: 140, shF: 2, elF: 140 }
        ]
      }
    },
    {
      id: 'heel-raise',
      name: '扶椅墊腳尖（提踵）',
      category: 'strength',
      alsoBalance: true,
      versions: ['standard'],
      targets: ['upAndGo', 'stepTest'],
      focus: ['legs', 'balance'],
      equipment: [],
      dose: DOSE.reps,
      steps: [
        '站在椅背後方，雙手輕扶椅背，雙腳與肩同寬。',
        '「吐氣」時慢慢墊起腳尖，把身體往上提，停 1–2 秒。',
        '「吸氣」時慢慢把腳跟放回地面。'
      ],
      cautions: ['身體保持直立，不要往前趴在椅背上。', '腳踝不要往外翻。'],
      tip: '小腿有力，走路推進更有力、也更不容易跌倒。',
      breath: '墊起吐氣、放下吸氣。',
      modify: {
        ankle: '腳踝疼痛時只墊到一半高度。',
        diabetes: '穿鞋做，並每天檢查雙腳有沒有傷口。'
      },
      figure: {
        view: 'side',
        anchor: { joint: 'toeN', at: [136, 202] },
        props: [CHAIR_FRONT_SUPPORT],
        hold: 400,
        dur: 900,
        frames: [
          { ankleN: 0, ankleF: 0, ik: { handN: CHAIR_BACK_TOP, handF: [147, 112] } },
          { ankleN: -32, ankleF: -32, ik: { handN: CHAIR_BACK_TOP, handF: [147, 112] } }
        ]
      }
    },
    {
      id: 'side-leg-raise',
      name: '扶椅側抬腿',
      category: 'strength',
      alsoBalance: true,
      versions: ['standard'],
      targets: ['upAndGo'],
      focus: ['legs', 'balance'],
      equipment: [],
      dose: DOSE.repsSide,
      steps: [
        '站在椅子旁邊，一手扶椅背，身體站直。',
        '「吐氣」時把外側的腳往旁邊抬起，腳尖朝前，停 1 秒。',
        '「吸氣」時慢慢放下。做完一邊再換另一邊。'
      ],
      cautions: ['身體不要往旁邊歪，上半身保持直立。', '腳尖朝前，不要轉向外側。'],
      tip: '臀部側邊的肌肉負責左右平衡，是防跌倒的關鍵。',
      breath: '抬腿吐氣、放下吸氣。',
      modify: {
        jointReplacement: '人工髖關節者：腳只抬到不痛的高度，放下時不要越過身體中線交叉。',
        hip: '只抬到不痛的高度。'
      },
      figure: {
        view: 'front',
        anchor: { joint: 'ankleL', at: [131, 202] },
        props: [CHAIR_SIDE_SUPPORT],
        hold: 400,
        dur: 900,
        frames: [
          { ik: { handL: [156, 110] } },
          { trunk: 3, hipR: 32, ik: { handL: [156, 110] } }
        ]
      }
    },
    {
      id: 'hip-extension',
      name: '扶椅後抬腿',
      category: 'strength',
      versions: ['standard'],
      targets: ['upAndGo', 'stepTest'],
      focus: ['legs', 'back'],
      equipment: [],
      dose: DOSE.repsSide,
      steps: [
        '面對椅背站好，雙手扶椅背，身體微微前傾。',
        '「吐氣」時一腳往後抬，膝蓋伸直，用屁股的力量抬起，停 1 秒。',
        '「吸氣」時慢慢放下。做完一邊再換另一邊。'
      ],
      cautions: ['腰不要往後折（不要拱腰），腳抬到不痛的高度即可。', '支撐腳膝蓋微彎、站穩。'],
      tip: '臀部有力，走路、爬樓梯更穩健。',
      breath: '抬腿吐氣、放下吸氣。',
      modify: { backPain: '腳只往後抬一點點，重點是屁股出力、腰不動。' },
      figure: {
        view: 'side',
        anchor: { joint: 'ankleF', at: [120, 202] },
        props: [CHAIR_FRONT_SUPPORT],
        hold: 400,
        dur: 900,
        frames: [
          { trunk: 6, ik: { handN: CHAIR_BACK_TOP, handF: [147, 112] } },
          { trunk: 10, hipN: -28, kneeN: 4, ankleN: -14, ik: { handN: CHAIR_BACK_TOP, handF: [147, 112] } }
        ]
      }
    },
    {
      id: 'band-row',
      name: '彈力帶划船',
      category: 'strength',
      versions: ['standard', 'seated'],
      targets: ['backScratch', 'armCurl'],
      focus: ['back', 'shoulders', 'arms'],
      equipment: ['band'],
      fallback: 'scapular-squeeze',
      dose: DOSE.reps,
      steps: [
        '坐在椅子前半部，背挺直，彈力帶繞過雙腳腳掌，雙手握住兩端。',
        '「吐氣」時手肘往後拉到身體兩側，同時把兩邊肩胛骨往中間夾，停 1–2 秒。',
        '「吸氣」時慢慢把手往前放回。'
      ],
      cautions: ['身體不要往後倒，用背部肌肉出力。', '肩膀放鬆往下，不要聳肩。'],
      tip: '練背部肌肉可以改善駝背、讓姿勢更挺拔。',
      breath: '拉回吐氣、放回吸氣。',
      modify: { shoulder: '手肘只往後拉到不痛的位置。', osteoporosis: '全程挺胸、背打直，非常適合骨質疏鬆者。' },
      figure: {
        view: 'side',
        base: 'seat',
        props: [CHAIR, { type: 'band', a: 'handN', b: 'toeN' }],
        hold: 350,
        dur: 1000,
        frames: [
          { trunk: 0, shN: 52, elN: 10, shF: 50, elF: 10 },
          { trunk: -2, shN: -24, elN: 104, shF: -26, elF: 104 }
        ]
      }
    },
    {
      id: 'scapular-squeeze',
      name: '夾背挺胸',
      category: 'strength',
      versions: ['standard', 'seated'],
      targets: ['backScratch'],
      focus: ['back', 'shoulders'],
      equipment: [],
      dose: { 1: '夾緊停 5 秒 × 6 次', 2: '夾緊停 8 秒 × 8 次', 3: '夾緊停 10 秒 × 10 次' },
      steps: [
        '坐在椅子前半部（或站直），手肘彎曲 90 度放在身體兩側。',
        '「吐氣」時手肘往後，把兩邊肩胛骨往中間夾緊，胸口往前挺。',
        '停 5–10 秒，「吸氣」時慢慢放鬆。'
      ],
      cautions: ['肩膀往下壓，不要聳肩。', '下巴微收，不要抬頭仰脖子。'],
      tip: '沒有器材也能做的「抗駝背」運動，隨時都能練。',
      breath: '夾緊時慢慢吐氣、放鬆時吸氣，不要憋氣。',
      modify: { hypertension: '夾緊時持續慢慢吐氣，不要憋氣。' },
      figure: {
        view: 'side',
        base: 'seat',
        anchor: { joint: 'hip', at: [110, 160] },
        props: [CHAIR],
        hold: 900,
        dur: 900,
        frames: [
          { trunk: 0, shN: 2, elN: 90, shF: 0, elF: 90 },
          { trunk: -4, head: -4, shN: -24, elN: 92, shF: -26, elF: 92 }
        ]
      }
    },
    {
      id: 'bridge',
      name: '床上橋式（抬臀）',
      category: 'strength',
      versions: ['standard'],
      targets: ['chairStand', 'upAndGo'],
      focus: ['legs', 'back', 'core'],
      equipment: [],
      dose: DOSE.reps,
      steps: [
        '躺在床上，雙膝彎曲、雙腳踩在床面上，雙手放身體兩側。',
        '「吐氣」時用屁股的力量把臀部抬起，讓肩膀到膝蓋成一直線，停 2–3 秒。',
        '「吸氣」時慢慢一節一節把臀部放回床面。'
      ],
      cautions: ['不要抬太高讓腰往後折。', '起床時先側躺，再用手撐起來，避免頭暈。'],
      tip: '早上起床前在床上做，喚醒臀部與核心肌群。',
      breath: '抬起吐氣、放下吸氣。',
      modify: {
        backPain: '只抬到臀部離開床面一點點即可，重點是臀部出力。',
        hypertension: '抬起時保持吐氣，不要憋氣。'
      },
      figure: {
        view: 'side',
        base: 'lie',
        anchor: { joint: 'shoulder', at: [62, 171] },
        props: [{ type: 'bed', x1: 22, x2: 222, y: 178, pillow: true }],
        hold: 500,
        dur: 1000,
        frames: [
          {},
          { trunk: -110, hipN: 110, kneeN: 86, ankleN: -24, hipF: 108, kneeF: 84, ankleF: -24, shN: 96, elN: 0, shF: 94, elF: 0 }
        ]
      }
    },
    {
      id: 'overhead-press',
      name: '水瓶上舉（肩推）',
      category: 'strength',
      versions: ['standard'],
      targets: ['backScratch', 'armCurl'],
      focus: ['shoulders', 'arms'],
      equipment: ['weights'],
      fallback: null,
      avoid: ['shoulder'],
      dose: DOSE.reps,
      steps: [
        '雙腳與肩同寬站穩（或坐著），雙手各拿一瓶裝水寶特瓶，放在肩膀兩側、手肘彎曲。',
        '「吐氣」時把水瓶往上推高，手臂接近伸直。',
        '「吸氣」時慢慢放回肩膀高度。'
      ],
      cautions: ['腰不要往後折，腹部微微用力。', '手舉高時不要聳肩。'],
      tip: '肩膀有力，拿高處的東西、晾衣服都更輕鬆。',
      breath: '上推吐氣、放下吸氣。',
      modify: { hypertension: '用較輕的水瓶，推的時候吐氣。', osteoporosis: '坐著做，背靠椅背更安全。' },
      figure: {
        view: 'front',
        props: [{ type: 'weight', at: 'handR' }, { type: 'weight', at: 'handL' }],
        hold: 300,
        dur: 950,
        frames: [
          { shR: 85, elR: 105, shL: 85, elL: 105 },
          { shR: 165, elR: 15, shL: 165, elL: 15 }
        ]
      }
    },
    {
      id: 'seated-overhead-press',
      name: '坐姿水瓶上舉',
      category: 'strength',
      versions: ['seated'],
      targets: ['backScratch', 'armCurl'],
      focus: ['shoulders', 'arms'],
      equipment: [],
      avoid: ['shoulder'],
      dose: DOSE.reps,
      steps: [
        '坐在椅子上背挺直，雙手各拿一瓶裝水寶特瓶放在肩膀兩側。',
        '「吐氣」時把水瓶往上推高，手臂接近伸直。',
        '「吸氣」時慢慢放回肩膀高度。沒有水瓶可以空手做。'
      ],
      cautions: ['背靠著椅背、腰不要往後折。', '只舉到不痛的高度。'],
      tip: '晾衣服、拿高處東西都需要肩膀力量。',
      breath: '上推吐氣、放下吸氣。',
      modify: { hypertension: '用較輕的重量，推的時候吐氣。' },
      figure: {
        view: 'front',
        base: 'seat',
        props: [CHAIR_FRONT_VIEW, { type: 'weight', at: 'handR' }, { type: 'weight', at: 'handL' }],
        hold: 300,
        dur: 950,
        frames: [
          { shR: 85, elR: 105, shL: 85, elL: 105 },
          { shR: 165, elR: 15, shL: 165, elL: 15 }
        ]
      }
    },
    {
      id: 'seated-knee-extension',
      name: '坐姿抬小腿（膝伸直）',
      category: 'strength',
      versions: ['seated', 'standard'],
      targets: ['chairStand', 'upAndGo'],
      focus: ['legs'],
      equipment: [],
      dose: DOSE.repsSide,
      steps: [
        '坐在椅子上背挺直，雙手扶椅子兩側。',
        '「吐氣」時把一隻腳的小腿往前抬起，直到膝蓋伸直，腳尖往回勾，停 2–3 秒。',
        '「吸氣」時慢慢放下。做完一邊再換另一邊。'
      ],
      cautions: ['大腿不要離開椅面，身體不要往後倒。', '膝蓋伸直但不要用力鎖死。'],
      tip: '大腿前側有力，膝蓋會更穩、更不容易痛。',
      breath: '抬起吐氣、放下吸氣。',
      modify: {
        kneeOA: '非常適合膝蓋退化者；若會痛，只抬到不痛的角度。',
        jointReplacement: '人工膝關節者依醫師或物理治療師建議的角度進行。'
      },
      figure: {
        view: 'side',
        base: 'seat',
        props: [CHAIR],
        hold: 600,
        dur: 900,
        frames: [
          { ik: { handN: [118, 160], handF: [116, 160] } },
          { kneeN: 6, ankleN: 18, ik: { handN: [118, 160], handF: [116, 160] } }
        ]
      }
    },
    {
      id: 'assisted-sit-to-stand',
      name: '扶手輔助坐站',
      category: 'strength',
      versions: ['seated'],
      targets: ['chairStand', 'upAndGo'],
      focus: ['legs'],
      equipment: [],
      requiresStand: true,
      dose: { 1: '1–2 組 × 每組 3–5 下', 2: '2 組 × 每組 5–8 下', 3: '2 組 × 每組 8–10 下' },
      steps: [
        '使用有扶手、穩固的椅子，坐在椅子前半部，雙腳往後收、踩穩地面。',
        '身體往前傾（鼻子超過腳尖），雙手推扶手。',
        '「吐氣」時手腳一起用力站起來，站穩後停 2 秒。',
        '「吸氣」時雙手找到扶手，慢慢坐回去。'
      ],
      cautions: ['旁邊需要有家人或工作人員陪同。', '站起後先停一下確認不頭暈再坐下。', '無法安全站起時，改做「坐姿抬小腿」即可。'],
      tip: '能自己從椅子站起來，就是維持生活獨立最重要的能力。',
      breath: '站起吐氣、坐下吸氣。',
      modify: {
        hypertension: '站起時吐氣，不要憋氣；起身後停一下，確認不頭暈。',
        kneeOA: '椅子坐高一點，減少膝蓋負擔。'
      },
      figure: {
        view: 'side',
        anchor: { joint: 'ankleN', at: [140, 202] },
        props: [CHAIR_ARMS],
        hold: 350,
        dur: 1000,
        frames: [
          { trunk: 16, hipN: 88, kneeN: 98, ankleN: 10, hipF: 86, kneeF: 96, ankleF: 10, ik: { handN: [112, 141], handF: [110, 141] } },
          { trunk: 40, hipN: 62, kneeN: 78, ankleN: 16, hipF: 61, kneeF: 77, ankleF: 16, ik: { handN: [114, 141], handF: [112, 141] } },
          { trunk: 3, hipN: 0, kneeN: 0, ankleN: 0, hipF: 0, kneeF: 0, ankleF: 0 },
          { trunk: 40, hipN: 62, kneeN: 78, ankleN: 16, hipF: 61, kneeF: 77, ankleF: 16, ik: { handN: [114, 141], handF: [112, 141] } }
        ]
      }
    },
    {
      id: 'seated-band-press',
      name: '坐姿彈力帶推胸',
      category: 'strength',
      versions: ['seated'],
      targets: ['armCurl'],
      focus: ['arms', 'shoulders'],
      equipment: ['band'],
      fallback: 'seated-punch-hold',
      dose: DOSE.reps,
      steps: [
        '彈力帶繞過背後（或繞過椅背），雙手各握一端放在胸前兩側。',
        '「吐氣」時雙手往前推直，像推門一樣，停 1 秒。',
        '「吸氣」時慢慢收回胸前。'
      ],
      cautions: ['手肘不要用力鎖死。', '背挺直，不要往前彎腰推。'],
      tip: '胸部和手臂有力，推門、撐起身體都更輕鬆。',
      breath: '推出吐氣、收回吸氣。',
      modify: { shoulder: '只推到肩膀高度以下、不痛的範圍。' },
      figure: {
        view: 'side',
        base: 'seat',
        props: [CHAIR, { type: 'band', a: 'handN', b: [84, 118] }],
        hold: 300,
        dur: 950,
        frames: [
          { trunk: 0, shN: 18, elN: 112, shF: 16, elF: 112 },
          { trunk: 0, shN: 86, elN: 4, shF: 84, elF: 4 }
        ]
      }
    },
    {
      id: 'seated-punch-hold',
      name: '坐姿推掌',
      category: 'strength',
      versions: ['seated'],
      targets: ['armCurl'],
      focus: ['arms', 'shoulders'],
      equipment: [],
      dose: DOSE.reps,
      steps: [
        '坐在椅子上背挺直，雙手掌心朝前放在胸前。',
        '「吐氣」時雙手慢慢用力往前推直，想像推開一扇重門，停 2 秒。',
        '「吸氣」時慢慢收回胸前。'
      ],
      cautions: ['推的時候持續吐氣，不要憋氣。', '肩膀放鬆，不要聳肩。'],
      tip: '不需要器材，想像推重門的阻力就能練到。',
      breath: '推出吐氣、收回吸氣。',
      modify: { shoulder: '只推到胸口高度、不痛的範圍。' },
      figure: {
        view: 'side',
        base: 'seat',
        props: [CHAIR],
        hold: 500,
        dur: 1100,
        frames: [
          { trunk: 0, shN: 18, elN: 112, shF: 16, elF: 112 },
          { trunk: 0, shN: 86, elN: 4, shF: 84, elF: 4 }
        ]
      }
    },
    {
      id: 'seated-heel-toe',
      name: '坐姿腳跟腳尖交替抬',
      category: 'strength',
      versions: ['seated'],
      targets: ['upAndGo', 'stepTest'],
      focus: ['legs'],
      equipment: [],
      dose: { 1: '腳尖、腳跟交替各 10 下 × 1–2 組', 2: '交替各 15 下 × 2 組', 3: '交替各 20 下 × 2–3 組' },
      steps: [
        '坐在椅子上背挺直，雙腳平踩地面。',
        '腳跟踩地、把腳尖往上翹起，停 1 秒後放下。',
        '換成腳尖踩地、把腳跟抬高，停 1 秒後放下。',
        '兩個動作交替進行。'
      ],
      cautions: ['動作慢慢做，感覺小腿前後的肌肉出力。'],
      tip: '腳踝有力可以預防走路踢到東西絆倒，也能促進下肢循環。',
      breath: '自然呼吸。',
      modify: { diabetes: '可以順便檢查雙腳有沒有傷口或水泡。', ankle: '只做到不痛的範圍。' },
      figure: {
        view: 'side',
        base: 'seat',
        props: [CHAIR],
        hold: 350,
        dur: 700,
        frames: [
          { ankleN: 24, ankleF: 24 },
          { hipN: 98, kneeN: 95, ankleN: -30, hipF: 96, kneeF: 93, ankleF: -30 }
        ]
      }
    },
    {
      id: 'seated-adduction',
      name: '坐姿夾枕（大腿內側）',
      category: 'strength',
      versions: ['seated', 'standard'],
      targets: ['upAndGo', 'chairStand'],
      focus: ['legs', 'core'],
      equipment: [],
      dose: { 1: '夾緊停 3 秒 × 8 次', 2: '夾緊停 5 秒 × 10 次', 3: '夾緊停 5 秒 × 12–15 次' },
      steps: [
        '坐在椅子上背挺直，把枕頭或捲起的毛巾夾在兩膝之間。',
        '「吐氣」時雙膝用力把枕頭夾緊，停 3–5 秒。',
        '「吸氣」時慢慢放鬆。'
      ],
      cautions: ['夾緊時持續吐氣，不要憋氣。'],
      tip: '大腿內側和骨盆底肌一起練，走路更穩，也有助於改善漏尿。',
      breath: '夾緊吐氣、放鬆吸氣。',
      modify: { hypertension: '用一半的力量夾，並保持吐氣。' },
      figure: {
        view: 'front',
        base: 'seat',
        props: [CHAIR_FRONT_VIEW, { type: 'pillow', a: 'kneeR', b: 'kneeL', dy: 2 }],
        hold: 700,
        dur: 800,
        frames: [
          { hipR: 13, hipL: 13 },
          { hipR: 5, hipL: 5 }
        ]
      }
    },
    {
      id: 'seated-leg-lift',
      name: '坐姿抬膝',
      category: 'strength',
      versions: ['seated'],
      targets: ['stepTest', 'upAndGo'],
      focus: ['legs', 'core'],
      equipment: [],
      dose: DOSE.repsSide,
      steps: [
        '坐在椅子前半部，背挺直，雙手扶椅面兩側。',
        '「吐氣」時把一邊膝蓋往上抬離椅面約一個拳頭高，停 2 秒。',
        '「吸氣」時慢慢放下，左右交替。'
      ],
      cautions: ['身體不要往後倒，保持挺胸。'],
      tip: '抬腿的力量讓您走路時腳抬得起來，不容易被絆倒。',
      breath: '抬起吐氣、放下吸氣。',
      modify: { jointReplacement: '人工髖關節者抬膝高度不超過髖部（不超過 90 度）。' },
      figure: {
        view: 'side',
        base: 'seat',
        props: [CHAIR],
        hold: 500,
        dur: 800,
        frames: [
          { ik: { handN: [118, 160], handF: [116, 160] } },
          { hipN: 114, kneeN: 108, ik: { handN: [118, 160], handF: [116, 160] } }
        ]
      }
    },

    /* -------------------------- 柔軟度 -------------------------- */
    {
      id: 'seated-hamstring',
      name: '坐姿大腿後側伸展',
      category: 'flexibility',
      versions: ['standard', 'seated'],
      targets: ['sitReach'],
      focus: ['legs', 'back'],
      equipment: [],
      dose: DOSE.stretchSide,
      steps: [
        '坐在椅子前半部，一腳彎曲踩地，另一腳往前伸直、腳跟著地、腳尖朝上。',
        '背挺直，雙手放在伸直的大腿上。',
        '從髖部慢慢往前傾，直到大腿後側有「緊緊的」感覺，停住。',
        '慢慢回正，換另一腳。'
      ],
      cautions: ['背部保持挺直，不要彎腰去碰腳尖。', '伸展到緊繃、不痛的程度，不要彈震。'],
      tip: '大腿後側柔軟，彎腰穿鞋襪更輕鬆，走路步伐也更大。',
      breath: '伸展時慢慢吐氣，停住時保持自然呼吸。',
      modify: {
        osteoporosis: '一定要背打直、從髖部前傾，不要捲背往下彎。',
        backPain: '前傾幅度小一點，以不痛為原則。',
        jointReplacement: '人工髖關節者前傾幅度小，髖部不超過 90 度。'
      },
      figure: SEATED_HAMSTRING
    },
    {
      id: 'towel-stretch',
      name: '毛巾抓背伸展',
      category: 'flexibility',
      versions: ['standard', 'seated'],
      targets: ['backScratch'],
      focus: ['shoulders'],
      equipment: ['towel'],
      fallback: 'chest-stretch',
      dose: DOSE.stretchSide,
      steps: [
        '一手拿毛巾舉高，從肩膀上方垂到背後。',
        '另一手從背後下方抓住毛巾下端。',
        '上面的手慢慢往上拉，把下面的手帶上來，停住。',
        '再換下面的手往下拉，伸展上面的肩膀。做完換邊。'
      ],
      cautions: ['只拉到肩膀有伸展感、不痛的程度。', '身體保持直立，不要歪向一邊。'],
      tip: '肩膀靈活，梳頭、穿脫衣服、扣背後扣子都更順手。',
      breath: '拉的時候慢慢吐氣。',
      modify: { shoulder: '五十肩或肩痛者動作要輕柔，只做到不痛的範圍，可先熱敷再做。' },
      figure: merge(BACK_SCRATCH, { props: [{ type: 'towel', a: 'handR', b: 'handL' }] })
    },
    {
      id: 'calf-stretch',
      name: '扶牆小腿伸展',
      category: 'flexibility',
      versions: ['standard'],
      targets: ['upAndGo'],
      focus: ['legs'],
      equipment: [],
      dose: DOSE.stretchSide,
      steps: [
        '面對牆壁，雙手扶牆，一腳在前、一腳在後（弓箭步）。',
        '後腳伸直、腳跟踩地，腳尖朝前。',
        '前腳膝蓋慢慢彎曲、身體往牆壁靠，感覺後腳小腿有拉緊的感覺，停住。',
        '換腳再做一次。'
      ],
      cautions: ['後腳腳跟不要離地。', '前腳膝蓋不要超過腳尖太多。'],
      tip: '小腿柔軟可以減少抽筋，走路腳踝更靈活。',
      breath: '停住時自然呼吸。',
      modify: { kneeOA: '前腳膝蓋只微彎即可。' },
      figure: {
        view: 'side',
        anchor: { joint: 'ankleF', at: [92, 202] },
        props: [{ type: 'wall', x: 188 }],
        hold: 900,
        dur: 1200,
        frames: [
          { trunk: 14, hipF: -20, kneeF: 0, ankleF: 20, hipN: 26, kneeN: 34, ankleN: 8, ik: { handN: [185, 92], handF: [185, 94], ankleN: [136, 202] } },
          { trunk: 22, hipF: -27, kneeF: 0, ankleF: 27, hipN: 34, kneeN: 48, ankleN: 14, ik: { handN: [185, 92], handF: [185, 94], ankleN: [136, 202] } }
        ]
      }
    },
    {
      id: 'chest-stretch',
      name: '擴胸伸展（雙手背後交握）',
      category: 'flexibility',
      versions: ['standard', 'seated'],
      targets: ['backScratch'],
      focus: ['shoulders', 'back'],
      equipment: [],
      dose: DOSE.stretch,
      steps: [
        '站直（或坐在椅子前半部），雙手在背後交握。',
        '肩膀往後、往下，把胸口挺出來，雙手輕輕往後下方延伸。',
        '感覺胸口前方有伸展感，停住。'
      ],
      cautions: ['不要抬頭仰脖子，下巴微收。', '手只往後延伸到不痛的程度。'],
      tip: '改善駝背、圓肩，讓呼吸更順暢。',
      breath: '挺胸時深吸氣，停住時慢慢吐氣。',
      modify: { shoulder: '手不用交握，雙手扶腰往後夾手肘即可。' },
      figure: {
        view: 'side',
        hold: 900,
        dur: 1100,
        frames: [
          { shN: 0, elN: 10, shF: 0, elF: 10 },
          { trunk: -4, head: -6, shN: -42, elN: 4, shF: -44, elF: 4 }
        ]
      },
      figureSeated: {
        view: 'side',
        base: 'seat',
        anchor: { joint: 'hip', at: [116, 160] },
        props: [CHAIR],
        hold: 900,
        dur: 1100,
        frames: [
          { trunk: 2, shN: 0, elN: 30, shF: 0, elF: 30 },
          { trunk: -2, head: -6, shN: -38, elN: 4, shF: -40, elF: 4 }
        ]
      }
    },
    {
      id: 'quad-stretch',
      name: '扶椅大腿前側伸展（毛巾輔助）',
      category: 'flexibility',
      versions: ['standard'],
      targets: ['upAndGo'],
      focus: ['legs'],
      equipment: ['towel'],
      fallback: null,
      avoid: ['kneeOA', 'jointReplacement', 'knee'],
      dose: DOSE.stretchSide,
      steps: [
        '站在椅背旁，一手扶椅背。',
        '把毛巾套在另一腳的腳踝，彎曲膝蓋讓腳跟往屁股靠近。',
        '用手拉毛巾輔助，感覺大腿前側有伸展感，停住。',
        '慢慢放下，換腳再做。'
      ],
      cautions: ['支撐腳膝蓋微彎、站穩。', '兩邊膝蓋盡量靠攏，腰不要往前凸。'],
      tip: '用毛巾輔助，不必勉強彎腰抓腳踝，更安全。',
      breath: '停住時自然呼吸。',
      modify: { backPain: '腹部微微出力，腰不要往前凸。' },
      figure: {
        view: 'side',
        anchor: { joint: 'ankleF', at: [120, 202] },
        props: [CHAIR_FRONT_SUPPORT, { type: 'towel', a: 'handN', b: 'ankleN' }],
        hold: 900,
        dur: 1100,
        frames: [
          { ik: { handF: CHAIR_BACK_TOP, handN: [112, 128] } },
          { trunk: 4, hipN: -4, kneeN: 125, ankleN: -25, ik: { handF: CHAIR_BACK_TOP, handN: [104, 118] } }
        ]
      }
    },
    {
      id: 'neck-stretch',
      name: '頸部側彎伸展',
      category: 'flexibility',
      versions: ['standard', 'seated'],
      targets: [],
      focus: ['shoulders'],
      equipment: [],
      dose: DOSE.stretchSide,
      steps: [
        '坐在椅子上背挺直，肩膀放鬆往下。',
        '頭慢慢往右肩傾斜（耳朵靠近肩膀），感覺左側脖子有伸展感，停住。',
        '慢慢回正，再往左邊傾斜。'
      ],
      cautions: ['動作要慢，不要轉圈繞脖子（容易頭暈）。', '肩膀不要跟著聳起來。'],
      tip: '看電視、滑手機久了，記得做做脖子伸展。',
      breath: '停住時慢慢吐氣。',
      modify: { neck: '只傾斜到不痛的角度，若手麻請停止並就醫。', hypertension: '動作放慢，避免頭暈。' },
      figure: {
        view: 'front',
        base: 'seat',
        props: [CHAIR_FRONT_VIEW],
        hold: 900,
        dur: 900,
        frames: [{ head: 0 }, { head: 38 }, { head: 0 }, { head: -38 }]
      }
    },
    {
      id: 'band-shoulder-stretch',
      name: '彈力帶肩部拉伸',
      category: 'flexibility',
      versions: ['seated', 'standard'],
      targets: ['backScratch'],
      focus: ['shoulders', 'back'],
      equipment: ['band'],
      fallback: 'chest-stretch',
      dose: { 1: '慢慢拉開 8 次，最後一次停 15 秒', 2: '拉開 10 次，最後停 20 秒', 3: '拉開 12 次，最後停 30 秒' },
      steps: [
        '坐在椅子前半部，雙手握住彈力帶，與肩同寬舉到頭上方。',
        '雙手慢慢往兩側拉開，手臂往下降到肩膀斜上方，像寫一個「Y」字。',
        '感覺肩膀、上背有伸展感，再慢慢回到頭上方。'
      ],
      cautions: ['只舉到不痛的高度，腰不要往後折。', '動作要慢，不要讓彈力帶彈回。'],
      tip: '打開胸口和肩膀，改善圓肩駝背。',
      breath: '拉開時吐氣、回來時吸氣。',
      modify: { shoulder: '手不舉過頭，改在胸前高度往兩側拉開。' },
      figure: {
        view: 'front',
        base: 'seat',
        props: [CHAIR_FRONT_VIEW, { type: 'band', a: 'handR', b: 'handL' }],
        hold: 500,
        dur: 1100,
        frames: [
          { shR: 175, elR: 5, shL: 175, elL: 5 },
          { shR: 125, elR: 20, shL: 125, elL: 20 }
        ]
      }
    },
    {
      id: 'seated-trunk-rotation',
      name: '坐姿轉體伸展',
      category: 'flexibility',
      versions: ['seated', 'standard'],
      targets: ['backScratch', 'sitReach'],
      focus: ['back', 'core'],
      equipment: [],
      dose: DOSE.stretchSide,
      steps: [
        '坐在椅子上背挺直，雙腳平踩地面，雙手交叉放在胸前。',
        '腰慢慢往右轉，眼睛跟著往右後方看，停住。',
        '慢慢轉回正面，再往左轉。'
      ],
      cautions: ['臀部不要離開椅面，膝蓋朝前。', '轉到有伸展感就好，不要用手硬拉。'],
      tip: '轉身更靈活，倒車、回頭看都更輕鬆。',
      breath: '轉身時吐氣、回正時吸氣。',
      modify: {
        osteoporosis: '轉動幅度小一點，動作慢，不要用手用力拉。',
        backPain: '只轉到不痛的角度。',
        jointReplacement: '人工髖關節者轉身時，骨盆與膝蓋保持朝前。'
      },
      figure: {
        view: 'front',
        base: 'seat',
        props: [CHAIR_FRONT_VIEW, { type: 'arc', x: 120, y: 132, rx: 30, ry: 8, layer: 'front' }],
        hold: 800,
        dur: 1000,
        frames: [
          { twist: 0, shR: 25, elR: 210, shL: 25, elL: 210 },
          { twist: 42, head: 4, shR: 25, elR: 210, shL: 25, elL: 210 },
          { twist: 0, shR: 25, elR: 210, shL: 25, elL: 210 },
          { twist: -42, head: -4, shR: 25, elR: 210, shL: 25, elL: 210 }
        ]
      }
    },
    {
      id: 'seated-ankle-circles',
      name: '坐姿踝關節繞圈',
      category: 'flexibility',
      versions: ['seated', 'standard'],
      targets: ['upAndGo'],
      focus: ['legs'],
      equipment: [],
      dose: { 1: '每邊順、逆時針各 8 圈', 2: '每邊順、逆時針各 10 圈', 3: '每邊順、逆時針各 12 圈' },
      steps: [
        '坐在椅子上，把一腳稍微抬起、往前伸。',
        '腳踝慢慢畫大圓圈，順時針轉，再逆時針轉。',
        '換另一腳。'
      ],
      cautions: ['動作慢、圈畫大。'],
      tip: '活動腳踝、促進血液循環，久坐後特別適合。',
      breath: '自然呼吸。',
      modify: { ankle: '只轉到不痛的範圍。' },
      figure: {
        view: 'side',
        base: 'seat',
        props: [CHAIR],
        hold: 120,
        dur: 550,
        frames: [
          { hipN: 96, kneeN: 50, ankleN: 20, ik: { handN: [118, 160], handF: [116, 160] } },
          { hipN: 96, kneeN: 50, ankleN: -5, ik: { handN: [118, 160], handF: [116, 160] } },
          { hipN: 96, kneeN: 50, ankleN: -30, ik: { handN: [118, 160], handF: [116, 160] } },
          { hipN: 96, kneeN: 50, ankleN: -5, ik: { handN: [118, 160], handF: [116, 160] } }
        ]
      }
    },

    /* -------------------------- 平衡 -------------------------- */
    {
      id: 'single-leg-stand',
      name: '扶椅單腳站立',
      category: 'balance',
      versions: ['standard'],
      targets: ['upAndGo'],
      focus: ['balance', 'legs'],
      equipment: [],
      dose: {
        1: '雙手扶椅，每腳站 10 秒 × 3 次',
        2: '單手扶椅，每腳站 15 秒 × 3 次',
        3: '指尖輕觸椅背，每腳站 20–30 秒 × 3 次'
      },
      steps: [
        '站在穩固的椅子旁邊（或流理台前），手扶椅背。',
        '慢慢把一隻腳抬離地面（往後彎膝或往前抬都可以）。',
        '眼睛看前方，維持平衡，數秒數。',
        '放下休息，換另一隻腳。熟練後逐漸減少手扶的力量。'
      ],
      cautions: ['旁邊一定要有可以扶的東西。', '不要閉眼做，除非有專業人員在旁。'],
      tip: '刷牙、等電鍋時都可以練，一天累積好幾次。',
      breath: '自然呼吸，不要憋氣。',
      modify: {
        vision: '在光線充足的地方練，全程扶著椅子。',
        parkinson: '全程雙手扶穩，旁邊最好有人陪。',
        kneeOA: '站立腳膝蓋微彎，不要鎖死。'
      },
      figure: {
        view: 'front',
        anchor: { joint: 'ankleL', at: [131, 202] },
        props: [CHAIR_SIDE_SUPPORT],
        hold: 900,
        dur: 800,
        frames: [
          { ik: { handL: [156, 110] } },
          { trunk: 2, kneeR: 80, hipR: 2, ik: { handL: [156, 110] } }
        ]
      }
    },
    {
      id: 'tandem-walk',
      name: '腳跟接腳尖直線走',
      category: 'balance',
      versions: ['standard'],
      targets: ['upAndGo'],
      focus: ['balance'],
      equipment: [],
      dose: {
        1: '沿著牆或流理台，一手扶著走 10 步 × 2 趟',
        2: '指尖輕扶，走 15 步 × 3 趟',
        3: '不扶（旁邊有牆），走 20 步 × 3 趟'
      },
      steps: [
        '沿著牆壁或流理台站好，必要時一手扶著。',
        '一腳往前踏，讓前腳的腳跟碰到後腳的腳尖，像走在一條直線上。',
        '眼睛看前方，慢慢一步一步往前走。'
      ],
      cautions: ['一定要在牆邊或有扶手的地方練習。', '地面保持乾燥、沒有雜物。'],
      tip: '這是很有效的平衡訓練，能改善走路時的左右搖晃。',
      breath: '自然呼吸。',
      modify: {
        vision: '一手全程扶牆，光線要充足。',
        parkinson: '一手全程扶牆，步伐放慢。'
      },
      figure: {
        view: 'side',
        hold: 350,
        dur: 700,
        frames: [
          { anchor: { joint: 'hip', at: [120, 118] }, hipN: 10, kneeN: 2, ankleN: 6, hipF: -8, kneeF: 6, ankleF: -6, shN: 35, elN: 25, shF: 30, elF: 25 },
          { anchor: { joint: 'hip', at: [120, 116] }, hipN: 0, kneeN: 0, hipF: 10, kneeF: 30, ankleF: 0, shN: 35, elN: 25, shF: 30, elF: 25 },
          { anchor: { joint: 'hip', at: [120, 118] }, hipF: 10, kneeF: 2, ankleF: 6, hipN: -8, kneeN: 6, ankleN: -6, shN: 35, elN: 25, shF: 30, elF: 25 },
          { anchor: { joint: 'hip', at: [120, 116] }, hipF: 0, kneeF: 0, hipN: 10, kneeN: 30, ankleN: 0, shN: 35, elN: 25, shF: 30, elF: 25 }
        ]
      }
    },
    {
      id: 'weight-shift',
      name: '左右重心轉移',
      category: 'balance',
      versions: ['standard'],
      targets: ['upAndGo'],
      focus: ['balance', 'legs'],
      equipment: [],
      dose: { 1: '左右各 10 次（可扶椅）', 2: '左右各 15 次，每邊停 3 秒', 3: '左右各 15 次，每邊停 5 秒並抬起另一腳' },
      steps: [
        '雙腳打開比肩稍寬站好，前面放一張椅子可以扶。',
        '身體保持直立，把重心慢慢移到右腳，停 3 秒。',
        '再慢慢移到左腳，停 3 秒，左右交替。'
      ],
      cautions: ['上半身保持直立，不要彎腰。', '腳底踩穩，不要滑動。'],
      tip: '練習「把重量放到一隻腳上」，是走路與轉身的基礎。',
      breath: '自然呼吸。',
      modify: { kneeOA: '膝蓋保持微彎，移動幅度小一點。' },
      figure: {
        view: 'front',
        hold: 500,
        dur: 900,
        frames: [
          { anchor: { joint: 'hip', at: [120, 118] }, shR: 20, shL: 20, ik: { ankleR: [100, 202], ankleL: [140, 202] } },
          { anchor: { joint: 'hip', at: [131, 119] }, shR: 20, shL: 20, ik: { ankleR: [100, 202], ankleL: [140, 202] } },
          { anchor: { joint: 'hip', at: [120, 118] }, shR: 20, shL: 20, ik: { ankleR: [100, 202], ankleL: [140, 202] } },
          { anchor: { joint: 'hip', at: [109, 119] }, shR: 20, shL: 20, ik: { ankleR: [100, 202], ankleL: [140, 202] } }
        ]
      }
    },
    {
      id: 'side-step',
      name: '扶牆側向走',
      category: 'balance',
      versions: ['standard'],
      targets: ['upAndGo'],
      focus: ['balance', 'legs'],
      equipment: [],
      dose: { 1: '扶著流理台，左右各走 5 步 × 2 趟', 2: '左右各走 10 步 × 2 趟', 3: '左右各走 10 步 × 3 趟（膝蓋微彎）' },
      steps: [
        '面對流理台或牆壁站好，雙手輕扶。',
        '右腳往右側跨一步，左腳再跟上併攏。',
        '往右走完後，再往左走回來。'
      ],
      cautions: ['腳尖朝前，不要交叉腳步。', '步伐不要太大，保持穩定。'],
      tip: '側向移動能力好，在擁擠的地方閃避更安全。',
      breath: '自然呼吸。',
      modify: { jointReplacement: '人工髖關節者步伐小一點，雙腳不要交叉。' },
      figure: {
        view: 'front',
        hold: 250,
        dur: 650,
        frames: [
          { anchor: { joint: 'hip', at: [120, 116] }, shR: 18, shL: 18, ik: { ankleR: [111, 202], ankleL: [129, 202] } },
          { anchor: { joint: 'hip', at: [116, 117] }, shR: 18, shL: 18, ik: { ankleR: [90, 192], ankleL: [129, 202] } },
          { anchor: { joint: 'hip', at: [110, 118] }, shR: 18, shL: 18, ik: { ankleR: [90, 202], ankleL: [129, 202] } },
          { anchor: { joint: 'hip', at: [116, 117] }, shR: 18, shL: 18, ik: { ankleR: [90, 202], ankleL: [124, 194] } }
        ]
      }
    },
    {
      id: 'supported-sway',
      name: '扶椅前後重心移動',
      category: 'balance',
      versions: ['standard', 'seated'],
      requiresStand: true,
      targets: ['upAndGo'],
      focus: ['balance'],
      equipment: [],
      dose: { 1: '雙手扶椅，前後各 8 次', 2: '前後各 10 次，每次停 3 秒', 3: '前後各 12 次，每次停 5 秒' },
      steps: [
        '面對椅背站好，雙手扶椅背，雙腳與肩同寬。',
        '身體保持一直線，慢慢往前傾，重心移到腳尖，停 3 秒。',
        '再慢慢往後，重心移到腳跟，停 3 秒。'
      ],
      cautions: ['身體像一塊木板一起移動，不要彎腰。', '腳底全程貼地。'],
      tip: '練習腳踝的平衡反應，被輕微碰撞時比較不會跌倒。',
      breath: '自然呼吸。',
      modify: { vision: '全程雙手扶穩。' },
      figure: {
        view: 'side',
        anchor: { joint: 'ankleN', at: [120, 202] },
        props: [CHAIR_FRONT_SUPPORT],
        hold: 600,
        dur: 1300,
        frames: [
          { trunk: -3, hipN: 3, hipF: 3, ankleN: -3, ankleF: -3, ik: { handN: CHAIR_BACK_TOP, handF: [147, 112] } },
          { trunk: 7, hipN: -7, hipF: -7, ankleN: 7, ankleF: 7, ik: { handN: CHAIR_BACK_TOP, handF: [147, 112] } }
        ]
      }
    },
    {
      id: 'seated-weight-shift',
      name: '坐姿重心轉移',
      category: 'balance',
      versions: ['seated'],
      targets: ['upAndGo'],
      focus: ['balance', 'core'],
      equipment: [],
      dose: { 1: '左右各 8 次', 2: '左右各 10 次，每邊停 3 秒', 3: '左右各 12 次，每邊停 5 秒' },
      steps: [
        '坐在椅子中間，背挺直，雙腳踩穩，雙手放在膝蓋上。',
        '上半身慢慢往右傾，把重心移到右邊屁股，停 3 秒。',
        '回到中間，再往左傾。'
      ],
      cautions: ['動作要慢，不要傾斜到快跌出椅子。', '使用有靠背、穩固的椅子。'],
      tip: '坐著練平衡，為之後站立、走路打好基礎。',
      breath: '傾斜時吐氣、回正時吸氣。',
      modify: { stroke: '中風者多往較弱的一側練習，旁邊需有人陪同。' },
      figure: {
        view: 'front',
        base: 'seat',
        props: [CHAIR_FRONT_VIEW],
        hold: 700,
        dur: 900,
        frames: [
          { trunk: 0, ik: { handR: 'kneeR', handL: 'kneeL' } },
          { trunk: 16, ik: { handR: 'kneeR', handL: 'kneeL' } },
          { trunk: 0, ik: { handR: 'kneeR', handL: 'kneeL' } },
          { trunk: -16, ik: { handR: 'kneeR', handL: 'kneeL' } }
        ]
      }
    },
    {
      id: 'seated-reach',
      name: '坐姿伸手取物',
      category: 'balance',
      versions: ['seated'],
      targets: ['upAndGo', 'sitReach'],
      focus: ['balance', 'core'],
      equipment: [],
      dose: { 1: '往前、左、右各 5 次', 2: '各 8 次', 3: '各 10 次，伸得更遠' },
      steps: [
        '坐在椅子中間，背挺直，雙腳踩穩。',
        '一手往前伸，好像要拿桌上遠一點的杯子，停 2 秒。',
        '回到坐正，再往左前方、右前方伸手。'
      ],
      cautions: ['臀部不要離開椅面。', '伸到舒服的距離就好，不要勉強。'],
      tip: '練習伸手拿東西時的平衡，日常生活最用得到。',
      breath: '伸手時吐氣、回來時吸氣。',
      modify: { osteoporosis: '背保持挺直，用髖部往前傾。' },
      figure: {
        view: 'side',
        base: 'seat',
        props: [CHAIR, { type: 'cup', x: 196, y: 104 }],
        hold: 600,
        dur: 1000,
        frames: [{}, { trunk: 28, shN: 96, elN: 0, shF: 10, elF: 60 }]
      }
    },
    {
      id: 'seated-leg-hold',
      name: '坐姿抬腿停留',
      category: 'balance',
      versions: ['seated'],
      targets: ['chairStand', 'upAndGo'],
      focus: ['core', 'legs', 'balance'],
      equipment: [],
      dose: { 1: '每腳停 3 秒 × 5 次', 2: '每腳停 5 秒 × 8 次', 3: '每腳停 8 秒 × 10 次（雙手不扶）' },
      steps: [
        '坐在椅子前半部，背挺直，雙手輕扶椅面。',
        '把一腳伸直、慢慢抬離地面，保持身體不晃動，停住。',
        '慢慢放下，換另一腳。熟練後雙手可以放在胸前。'
      ],
      cautions: ['身體不要往後倒或往旁邊歪。', '抬到腳離地即可，不必抬很高。'],
      tip: '練習核心穩定，坐著也能讓平衡更好。',
      breath: '停住時持續呼吸，不要憋氣。',
      modify: { hypertension: '停住時持續吐氣，不要憋氣。' },
      figure: {
        view: 'side',
        base: 'seat',
        props: [CHAIR],
        hold: 1200,
        dur: 900,
        frames: [
          { ik: { handN: [118, 160], handF: [116, 160] } },
          { hipN: 100, kneeN: 8, ankleN: 15, ik: { handN: [118, 160], handF: [116, 160] } }
        ]
      }
    }
  ];

  /* ================================================================== */
  /* SFT 檢測示範動畫                                                    */
  /* ================================================================== */
  var TEST_FIGURES = {
    chairStand: SIT_TO_STAND,
    armCurl: {
      view: 'side',
      base: 'seat',
      anchor: { joint: 'hip', at: [108, 160] },
      props: [CHAIR, { type: 'weight', at: 'handN' }],
      hold: 120,
      dur: 520,
      frames: [
        { trunk: 0, shN: 2, elN: 6, shF: 4, elF: 62 },
        { trunk: 0, shN: 6, elN: 142, shF: 4, elF: 62 }
      ]
    },
    stepTest: merge(MARCH, { props: [{ type: 'wall', x: 196 }, { type: 'tape', x1: 150, x2: 196, y: 140 }] }),
    sitReach: merge(SEATED_HAMSTRING, {
      frames: [
        { trunk: 0, hipN: 62, kneeN: 0, ankleN: 28, ik: { handN: [140, 150], handF: [138, 150] } },
        { trunk: 40, head: 8, hipN: 62, kneeN: 0, ankleN: 28, ik: { handN: [196, 192], handF: [194, 190] } }
      ]
    }),
    backScratch: BACK_SCRATCH,
    upAndGo: {
      view: 'side',
      hold: 0,
      dur: 430,
      props: [
        { type: 'chair', x: 6, w: 34 },
        { type: 'cone', x: 222 },
        { type: 'path', d: 'M44 188 C 120 172, 196 172, 212 190 C 196 202, 120 204, 44 196' }
      ],
      frames: WALK_FRAMES
    }
  };

  /* ================================================================== */
  /* 暖身與緩和（每次運動前後）                                           */
  /* ================================================================== */
  var WARMUP = {
    standard: [
      '原地踏步 2 分鐘（可扶椅背）',
      '肩膀前後繞圈各 10 次',
      '手臂前後擺動 20 下',
      '腳踝繞圈左右各 8 圈'
    ],
    seated: [
      '坐姿原地踏步 2 分鐘',
      '肩膀前後繞圈各 10 次',
      '手臂輪流上舉 10 次',
      '腳踝繞圈左右各 8 圈'
    ]
  };
  var COOLDOWN = {
    standard: ['慢走或慢慢踏步 2 分鐘，讓心跳平穩', '做今天處方中的伸展動作', '深呼吸 5 次：鼻子吸氣 4 秒、嘴巴吐氣 6 秒'],
    seated: ['坐姿慢慢踏步 1–2 分鐘', '做今天處方中的伸展動作', '深呼吸 5 次：鼻子吸氣 4 秒、嘴巴吐氣 6 秒']
  };

  var BY_ID = {};
  LIST.forEach(function (e) {
    BY_ID[e.id] = e;
  });

  function figureFor(ex, version) {
    if (version === 'seated' && ex.figureSeated) return ex.figureSeated;
    return ex.figure;
  }

  function doseText(ex, level) {
    var d = ex.dose || {};
    return d[level] || d[2] || '';
  }

  YD.exercises = {
    CATEGORY: CATEGORY,
    DOSE: DOSE,
    LIST: LIST,
    BY_ID: BY_ID,
    TEST_FIGURES: TEST_FIGURES,
    WARMUP: WARMUP,
    COOLDOWN: COOLDOWN,
    get: function (id) {
      return BY_ID[id] || null;
    },
    figureFor: figureFor,
    doseText: doseText
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
