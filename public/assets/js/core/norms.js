/*
 * 銀動方程式 — SFT 銀髮族功能性體適能常模與評分
 *
 * 常模來源：Rikli, R. E., & Jones, C. J. (2013). Senior Fitness Test Manual (2nd ed.).
 *           Human Kinetics.（原始常模：Rikli & Jones, 1999, J Aging Phys Act 7:162–181）
 * 「正常範圍」＝同年齡、同性別第 25 至第 75 百分位。
 * 功能風險門檻（risk zone）：Rikli & Jones 2013；8 英呎起身繞行跌倒風險門檻 8.5 秒：
 *   Rose, Jones & Lucchese (2002), J Aging Phys Act 10:466–475。
 *
 * 本檔為一般 <script>，掛在 globalThis.YD.norms，瀏覽器與 Node 測試皆可使用。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});

  var AGE_BANDS = ['60-64', '65-69', '70-74', '75-79', '80-84', '85-89', '90-94'];
  var IN_TO_CM = 2.54;

  // 每一列依序對應 AGE_BANDS。數值為 [第25百分位, 第75百分位]（表現由差到好）。
  // 坐姿體前彎、抓背以英吋記錄，載入時換算公分；起身繞行為秒（數字越小越好）。
  var RAW = {
    chairStand: {
      F: [[12, 17], [11, 16], [10, 15], [10, 15], [9, 14], [8, 13], [4, 11]],
      M: [[14, 19], [12, 18], [12, 17], [11, 17], [10, 15], [8, 14], [7, 12]]
    },
    armCurl: {
      F: [[13, 19], [12, 18], [12, 17], [11, 17], [10, 16], [10, 15], [8, 13]],
      M: [[16, 22], [15, 21], [14, 21], [13, 19], [13, 19], [11, 17], [10, 14]]
    },
    stepTest: {
      F: [[75, 107], [73, 107], [68, 101], [68, 100], [60, 90], [55, 85], [44, 72]],
      M: [[87, 115], [86, 116], [80, 110], [73, 109], [71, 103], [59, 91], [52, 86]]
    },
    sitReach: {
      F: [[-0.5, 5.0], [-0.5, 4.5], [-1.0, 4.0], [-1.5, 3.5], [-2.0, 3.0], [-2.5, 2.5], [-4.5, 1.0]],
      M: [[-2.5, 4.0], [-3.0, 3.0], [-3.0, 3.0], [-4.0, 2.0], [-5.5, 1.5], [-5.5, 0.5], [-6.5, -0.5]]
    },
    backScratch: {
      F: [[-3.0, 1.5], [-3.5, 1.5], [-4.0, 1.0], [-5.0, 0.5], [-5.5, 0.0], [-7.0, -1.0], [-8.0, -1.0]],
      M: [[-6.5, 0.0], [-7.5, -1.0], [-8.0, -1.0], [-9.0, -2.0], [-9.5, -2.0], [-10.0, -3.0], [-10.5, -4.0]]
    },
    upAndGo: {
      // [第25百分位(較慢), 第75百分位(較快)]
      F: [[6.0, 4.4], [6.4, 4.8], [7.1, 4.9], [7.4, 5.2], [8.7, 5.7], [9.6, 6.2], [11.5, 7.3]],
      M: [[5.6, 3.8], [5.9, 4.3], [6.2, 4.4], [7.2, 4.6], [7.6, 5.2], [8.9, 5.5], [10.0, 6.2]]
    }
  };

  /** 六項檢測的說明（顯示給長者與施測人員）。 */
  var TESTS = [
    {
      key: 'chairStand',
      name: '30 秒椅子坐站',
      domain: '下肢肌力',
      unit: '次',
      decimals: 0,
      min: 0,
      max: 60,
      step: 1,
      higherIsBetter: true,
      icon: '🪑',
      timer: { type: 'countdown', seconds: 30, counter: true },
      riskBelow: 8,
      why: '腿部力量。和從椅子站起來、走路、爬樓梯的能力有關。',
      howTo: [
        '椅子靠牆放穩（座高約 43 公分，無輪子）。',
        '坐在椅子中間，背挺直，雙腳與肩同寬平踩地面，雙手交叉放在胸前。',
        '聽到「開始」後，完全站直再坐下，30 秒內盡量反覆。',
        '計算完整站起的次數；時間到時若已站起一半以上，也算 1 次。'
      ],
      safety: '起身時若頭暈或膝蓋疼痛請立即停止；施測者站在旁邊保護。'
    },
    {
      key: 'armCurl',
      name: '30 秒手臂屈舉',
      domain: '上肢肌力',
      unit: '次',
      decimals: 0,
      min: 0,
      max: 60,
      step: 1,
      higherIsBetter: true,
      icon: '💪',
      timer: { type: 'countdown', seconds: 30, counter: true },
      riskBelow: 11,
      why: '手臂力量。和提菜籃、抱孫子、拿東西等日常動作有關。',
      howTo: [
        '坐在椅子上，背挺直，慣用手握啞鈴（女性 5 磅≈2.3 公斤；男性 8 磅≈3.6 公斤），手臂自然下垂。',
        '聽到「開始」後，掌心轉向上，彎曲手肘把啞鈴舉到肩膀前方，再完全放下伸直。',
        '上臂貼緊身體不要晃動，計算 30 秒內完成的次數。'
      ],
      safety: '沒有啞鈴可用裝水的寶特瓶代替並記錄重量；手腕或手肘疼痛請停止。'
    },
    {
      key: 'stepTest',
      name: '2 分鐘原地抬膝踏步',
      domain: '心肺耐力',
      unit: '次',
      decimals: 0,
      min: 0,
      max: 200,
      step: 1,
      higherIsBetter: true,
      icon: '🦵',
      timer: { type: 'countdown', seconds: 120, counter: true },
      riskBelow: 65,
      why: '心肺耐力。和走遠路、做家事比較不容易喘有關。',
      howTo: [
        '先找出抬膝高度：膝蓋骨與髖骨（腰前方突起的骨頭）連線的中點，在牆上貼膠帶標示。',
        '聽到「開始」後原地踏步 2 分鐘，每次膝蓋都要抬到標示高度。',
        '只計算「右膝」抬到高度的次數；可以扶牆或椅背保持平衡，需要時可放慢速度。'
      ],
      safety: '若出現胸悶、頭暈、明顯喘不過氣，立即停止並坐下休息。'
    },
    {
      key: 'sitReach',
      name: '椅子坐姿體前彎',
      domain: '下肢柔軟度',
      unit: '公分',
      decimals: 1,
      min: -40,
      max: 40,
      step: 0.5,
      allowNegative: true,
      higherIsBetter: true,
      icon: '🙆',
      timer: null,
      riskBelow: null,
      why: '大腿後側的柔軟度。和彎腰穿鞋襪、走路步伐大小有關。',
      howTo: [
        '坐在椅子前緣，一腳彎曲踩地，另一腳向前伸直、腳跟著地、腳尖朝上。',
        '雙手中指重疊，吐氣慢慢往前延伸觸碰腳尖，停留 2 秒（膝蓋保持伸直）。',
        '量指尖到腳尖的距離：沒碰到記負值、超過記正值、剛好碰到記 0。做 2 次取最好的一次。'
      ],
      safety: '慢慢往前、不要彈震；有嚴重骨質疏鬆或腰痛者量力而為，可以略過。'
    },
    {
      key: 'backScratch',
      name: '抓背測驗',
      domain: '上肢柔軟度',
      unit: '公分',
      decimals: 1,
      min: -50,
      max: 30,
      step: 0.5,
      allowNegative: true,
      higherIsBetter: true,
      icon: '🤸',
      timer: null,
      riskBelow: null,
      why: '肩膀柔軟度。和梳頭、穿脫衣服、扣背後扣子有關。',
      howTo: [
        '站著或坐著，慣用手從同側肩膀上方往下伸，手掌貼背。',
        '另一隻手從背後下方往上伸，手背貼背，讓兩手中指盡量靠近或重疊。',
        '量兩手中指之間的距離：沒碰到記負值、重疊記正值。做 2 次取最好的一次。'
      ],
      safety: '肩膀疼痛（如五十肩）請只做到不痛的範圍，或略過此項。'
    },
    {
      key: 'upAndGo',
      name: '8 英呎起身繞行',
      domain: '敏捷與動態平衡',
      unit: '秒',
      decimals: 1,
      min: 1,
      max: 120,
      step: 0.1,
      higherIsBetter: false,
      icon: '🚶',
      timer: { type: 'stopwatch' },
      riskAbove: 9.0,
      fallRiskAbove: 8.5,
      why: '靈活度與動態平衡。和上下公車、轉身、避免跌倒有關。',
      howTo: [
        '椅子靠牆，正前方 2.44 公尺（8 英呎）放一個角錐或明顯標記。',
        '坐在椅子上，雙手放大腿、雙腳平踩地面。',
        '聽到「開始」後起身，以最快且安全的速度走過去繞過角錐，再走回來坐下。',
        '從「開始」計時到坐下為止；做 2 次取最快的一次。可使用平常的拐杖。'
      ],
      safety: '施測者全程陪走在旁邊保護，地面保持乾燥、無障礙物。'
    }
  ];

  var TEST_MAP = {};
  TESTS.forEach(function (t) {
    TEST_MAP[t.key] = t;
  });

  function round(n, d) {
    var f = Math.pow(10, d || 0);
    return Math.round(n * f) / f;
  }

  // 換算成公分（柔軟度兩項）
  var NORMS = {};
  Object.keys(RAW).forEach(function (key) {
    NORMS[key] = { F: [], M: [] };
    ['F', 'M'].forEach(function (sex) {
      NORMS[key][sex] = RAW[key][sex].map(function (pair) {
        if (key === 'sitReach' || key === 'backScratch') {
          return [round(pair[0] * IN_TO_CM, 1), round(pair[1] * IN_TO_CM, 1)];
        }
        return pair.slice();
      });
    });
  });

  /** 取得年齡組別索引；未滿 60 用 60–64、95 以上用 90–94，並回傳提示。 */
  function ageBandIndex(age) {
    var a = Number(age);
    if (!isFinite(a)) return { index: 0, band: AGE_BANDS[0], note: '年齡未填，暫以 60–64 歲常模比較' };
    if (a < 60) return { index: 0, band: AGE_BANDS[0], note: '未滿 60 歲，以 60–64 歲常模比較' };
    if (a >= 95) return { index: 6, band: AGE_BANDS[6], note: '95 歲以上，以 90–94 歲常模比較' };
    var idx = Math.min(6, Math.floor((a - 60) / 5));
    return { index: idx, band: AGE_BANDS[idx], note: '' };
  }

  /** 取得常模範圍：{ p25, p75 }（p25 為表現較差端）。 */
  function getNorm(key, sex, age) {
    var s = sex === 'M' ? 'M' : 'F';
    var band = ageBandIndex(age);
    var pair = NORMS[key][s][band.index];
    return { p25: pair[0], p75: pair[1], band: band.band, bandNote: band.note };
  }

  // 標準常態累積分配（Abramowitz & Stegun 7.1.26）
  function erf(x) {
    var sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
        t *
        Math.exp(-x * x);
    return sign * y;
  }
  function phi(z) {
    return 0.5 * (1 + erf(z / Math.SQRT2));
  }

  /**
   * 以常態近似估計百分位：第 25、75 百分位分別對應 z = −0.674、+0.674。
   * 回傳 1–99 的整數。
   */
  function estimatePercentile(key, value, norm) {
    var t = TEST_MAP[key];
    var p25 = norm.p25;
    var p75 = norm.p75;
    var mid = (p25 + p75) / 2;
    var sd = Math.abs(p75 - p25) / 1.349;
    if (!(sd > 0)) return 50;
    var z = t.higherIsBetter ? (value - mid) / sd : (mid - value) / sd;
    var p = Math.round(phi(z) * 100);
    return Math.max(1, Math.min(99, p));
  }

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  /**
   * 評分單一項目。
   * entry: { value: number|null, unable: boolean }
   */
  function scoreTest(key, entry, sex, age) {
    var t = TEST_MAP[key];
    var norm = getNorm(key, sex, age);
    var out = {
      key: key,
      name: t.name,
      domain: t.domain,
      unit: t.unit,
      higherIsBetter: t.higherIsBetter,
      norm: norm,
      value: null,
      unable: false,
      measured: false,
      status: 'missing',
      percentile: null,
      riskZone: false,
      fallRisk: false
    };
    if (!entry) return out;
    if (entry.unable) {
      out.unable = true;
      out.measured = true;
      out.status = 'unable';
      out.percentile = 1;
      out.riskZone = key === 'chairStand' || key === 'armCurl' || key === 'stepTest' || key === 'upAndGo';
      out.fallRisk = key === 'upAndGo';
      return out;
    }
    if (!isNum(entry.value)) return out;
    var v = entry.value;
    out.value = v;
    out.measured = true;
    out.percentile = estimatePercentile(key, v, norm);
    if (t.higherIsBetter) {
      out.status = v < norm.p25 ? 'below' : v > norm.p75 ? 'above' : 'normal';
    } else {
      out.status = v > norm.p25 ? 'below' : v < norm.p75 ? 'above' : 'normal';
    }
    if (isNum(t.riskBelow) && v < t.riskBelow) out.riskZone = true;
    if (isNum(t.riskAbove) && v > t.riskAbove) out.riskZone = true;
    if (isNum(t.fallRiskAbove) && v > t.fallRiskAbove) out.fallRisk = true;
    return out;
  }

  /** 評分全部六項並彙整。sft: { chairStand: {value, unable}, ... } */
  function scoreAll(sft, sex, age) {
    sft = sft || {};
    var items = TESTS.map(function (t) {
      return scoreTest(t.key, sft[t.key], sex, age);
    });
    var measured = items.filter(function (i) {
      return i.measured;
    });
    var below = items.filter(function (i) {
      return i.status === 'below' || i.status === 'unable';
    });
    var riskZone = items.filter(function (i) {
      return i.riskZone;
    });
    var meanPct = measured.length
      ? Math.round(
          measured.reduce(function (s, i) {
            return s + i.percentile;
          }, 0) / measured.length
        )
      : null;
    var sorted = measured.slice().sort(function (a, b) {
      return a.percentile - b.percentile;
    });
    return {
      items: items,
      byKey: items.reduce(function (m, i) {
        m[i.key] = i;
        return m;
      }, {}),
      measuredCount: measured.length,
      belowCount: below.length,
      unableCount: items.filter(function (i) {
        return i.unable;
      }).length,
      riskZoneCount: riskZone.length,
      meanPercentile: meanPct,
      weakest: sorted.filter(function (i) {
        return i.status === 'below' || i.status === 'unable';
      }),
      strongest: sorted
        .slice()
        .reverse()
        .filter(function (i) {
          return i.status === 'above' || i.status === 'normal';
        }),
      ageBand: ageBandIndex(age).band,
      ageBandNote: ageBandIndex(age).note
    };
  }

  /** 顯示用：把數值格式化成「12 次」「-3.5 公分」。 */
  function formatValue(key, v) {
    var t = TEST_MAP[key];
    if (!isNum(v)) return '—';
    var s = t.decimals ? v.toFixed(t.decimals) : String(Math.round(v));
    if (t.allowNegative && v > 0) s = '+' + s;
    return s + ' ' + t.unit;
  }

  /** 顯示用：常模範圍字串。 */
  function formatNorm(key, norm) {
    var t = TEST_MAP[key];
    function f(n) {
      var s = t.decimals ? n.toFixed(t.decimals) : String(n);
      if (t.allowNegative && n > 0) s = '+' + s;
      return s;
    }
    if (t.higherIsBetter) return f(norm.p25) + ' ～ ' + f(norm.p75) + ' ' + t.unit;
    return f(norm.p75) + ' ～ ' + f(norm.p25) + ' ' + t.unit;
  }

  var STATUS_TEXT = {
    below: '低於常模',
    normal: '正常範圍',
    above: '優於常模',
    unable: '無法完成',
    missing: '未測'
  };

  YD.norms = {
    AGE_BANDS: AGE_BANDS,
    TESTS: TESTS,
    TEST_MAP: TEST_MAP,
    NORMS: NORMS,
    STATUS_TEXT: STATUS_TEXT,
    ageBandIndex: ageBandIndex,
    getNorm: getNorm,
    estimatePercentile: estimatePercentile,
    scoreTest: scoreTest,
    scoreAll: scoreAll,
    formatValue: formatValue,
    formatNorm: formatNorm,
    phi: phi
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
