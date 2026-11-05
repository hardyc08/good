/*
 * 銀動方程式 — 動作示範人偶（2D 正向／反向運動學 + 關鍵影格動畫）
 *
 * 每個動作以 2～4 個「關鍵姿勢」描述（關節角度），由程式補間成動畫。
 * 角度單位為度，以「垂直向下」為 0：
 *   側視（view: 'side'）人偶面向右方，正值代表往前（屈曲）。
 *   正視（view: 'front'）人偶面向觀看者，正值代表往外（外展）。
 * 影格可用 ik 指定手腳要碰到的位置（例如扶椅背、手推牆），由反向運動學自動計算手肘、膝蓋。
 * 支援 prefers-reduced-motion：不自動播放，改以按鈕逐格切換。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});

  var NS = 'http://www.w3.org/2000/svg';
  var W = 240;
  var H = 220;
  var GROUND = 206;
  var L = {
    trunk: 50,
    neck: 6,
    headR: 11,
    upper: 29,
    fore: 27,
    thigh: 44,
    shin: 42,
    foot: 15,
    shW: 15,
    hipW: 9
  };
  var FOOT_Y = GROUND - 4; // 腳踝（腳底）高度
  // 坐姿時髖關節高度：大腿水平、小腿垂直時腳底剛好踩地
  var SEAT_HIP_Y = FOOT_Y - L.shin;
  var SEAT_TOP = SEAT_HIP_Y + 6;

  function rad(d) {
    return (d * Math.PI) / 180;
  }
  function deg(r) {
    return (r * 180) / Math.PI;
  }
  function v(a, len) {
    return { x: Math.sin(rad(a)) * len, y: Math.cos(rad(a)) * len };
  }
  function add(p, q) {
    return { x: p.x + q.x, y: p.y + q.y };
  }
  function sub(p, q) {
    return { x: p.x - q.x, y: p.y - q.y };
  }

  /* ---------------- 基本姿勢 ---------------- */
  var BASE = {
    'side-stand': {
      trunk: 0, head: 0,
      hipN: 0, kneeN: 0, ankleN: 0, hipF: 0, kneeF: 0, ankleF: 0,
      shN: 4, elN: 8, shF: -4, elF: 8
    },
    'side-seat': {
      trunk: -3, head: 0,
      hipN: 90, kneeN: 90, ankleN: 0, hipF: 88, kneeF: 88, ankleF: 0,
      shN: 14, elN: 60, shF: 10, elF: 60
    },
    'side-lie': {
      trunk: -90, head: 0,
      hipN: 135, kneeN: 102, ankleN: -33, hipF: 132, kneeF: 99, ankleF: -33,
      shN: 92, elN: 0, shF: 88, elF: 0
    },
    'front-stand': {
      trunk: 0, head: 0, twist: 0,
      hipR: 4, hipL: 4, kneeR: 0, kneeL: 0, liftR: 0, liftL: 0,
      shR: 10, shL: 10, elR: 6, elL: 6
    },
    'front-seat': {
      trunk: 0, head: 0, twist: 0,
      hipR: 10, hipL: 10, kneeR: 74, kneeL: 74, liftR: 74, liftL: 74,
      shR: 16, shL: 16, elR: 36, elL: 36
    }
  };

  var NUMERIC_KEYS = [
    'trunk', 'head', 'twist',
    'hipN', 'kneeN', 'ankleN', 'hipF', 'kneeF', 'ankleF', 'shN', 'elN', 'shF', 'elF',
    'hipR', 'hipL', 'kneeR', 'kneeL', 'liftR', 'liftL', 'shR', 'shL', 'elR', 'elL'
  ];

  /* ---------------- 正向運動學 ---------------- */
  function fkSide(p) {
    var j = {};
    j.hip = { x: 0, y: 0 };
    j.shoulder = { x: Math.sin(rad(p.trunk)) * L.trunk, y: -Math.cos(rad(p.trunk)) * L.trunk };
    var hd = p.trunk + p.head;
    j.head = {
      x: j.shoulder.x + Math.sin(rad(hd)) * (L.neck + L.headR),
      y: j.shoulder.y - Math.cos(rad(hd)) * (L.neck + L.headR)
    };
    j.headDir = hd;
    ['N', 'F'].forEach(function (s) {
      var th = p['hip' + s];
      var knee = add(j.hip, v(th, L.thigh));
      var shinA = th - p['knee' + s];
      var ankle = add(knee, v(shinA, L.shin));
      var footA = shinA + 90 + p['ankle' + s];
      j['knee' + s] = knee;
      j['ankle' + s] = ankle;
      j['toe' + s] = add(ankle, v(footA, L.foot));
      j['heel' + s] = add(ankle, v(footA + 180, 3));
      var ua = p['sh' + s];
      var elbow = add(j.shoulder, v(ua, L.upper));
      j['elbow' + s] = elbow;
      j['hand' + s] = add(elbow, v(ua + p['el' + s], L.fore));
    });
    return j;
  }

  function fkFront(p) {
    var j = {};
    var tr = p.trunk;
    var shW = L.shW * Math.cos(rad(p.twist || 0));
    j.hip = { x: 0, y: 0 };
    j.neckBase = { x: Math.sin(rad(tr)) * L.trunk, y: -Math.cos(rad(tr)) * L.trunk };
    var perp = { x: Math.cos(rad(tr)), y: Math.sin(rad(tr)) };
    j.shoulderL = { x: j.neckBase.x + perp.x * shW, y: j.neckBase.y + perp.y * shW };
    j.shoulderR = { x: j.neckBase.x - perp.x * shW, y: j.neckBase.y - perp.y * shW };
    var hd = tr + p.head;
    j.head = {
      x: j.neckBase.x + Math.sin(rad(hd)) * (L.neck + L.headR),
      y: j.neckBase.y - Math.cos(rad(hd)) * (L.neck + L.headR)
    };
    j.headDir = hd;
    j.twist = p.twist || 0;
    j.hipR = { x: -L.hipW, y: 0 };
    j.hipL = { x: L.hipW, y: 0 };
    [['R', -1], ['L', 1]].forEach(function (pair) {
      var s = pair[0];
      var sign = pair[1];
      var a = p['hip' + s];
      var lift = p['lift' + s];
      var k = p['knee' + s];
      var thighLen = L.thigh * Math.max(0.14, Math.cos(rad(lift)));
      var dir = { x: sign * Math.sin(rad(a)), y: Math.cos(rad(a)) };
      var knee = { x: j['hip' + s].x + dir.x * thighLen, y: j['hip' + s].y + dir.y * thighLen };
      var shinLen = L.shin * Math.max(0.14, Math.abs(Math.cos(rad(lift - k))));
      var ankle = { x: knee.x + dir.x * shinLen, y: knee.y + dir.y * shinLen };
      j['knee' + s] = knee;
      j['ankle' + s] = ankle;
      j['toe' + s] = { x: ankle.x + sign * 8, y: ankle.y + 2 };
      j['heel' + s] = { x: ankle.x - sign * 2, y: ankle.y + 1 };
      var b = p['sh' + s];
      var e = p['el' + s];
      var sh = j['shoulder' + s];
      var elbow = { x: sh.x + sign * Math.sin(rad(b)) * L.upper, y: sh.y + Math.cos(rad(b)) * L.upper };
      j['elbow' + s] = elbow;
      j['hand' + s] = {
        x: elbow.x + sign * Math.sin(rad(b + e)) * L.fore,
        y: elbow.y + Math.cos(rad(b + e)) * L.fore
      };
    });
    return j;
  }

  /* ---------------- 反向運動學（兩節肢體） ---------------- */
  function ik2(base, target, a, b, bend) {
    var dx = target.x - base.x;
    var dy = target.y - base.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    var dd = Math.max(Math.abs(a - b) + 0.5, Math.min(a + b - 0.3, d));
    var ux = dx / d;
    var uy = dy / d;
    var cosA = (a * a + dd * dd - b * b) / (2 * a * dd);
    var ang = Math.acos(Math.max(-1, Math.min(1, cosA))) * bend;
    var rx = ux * Math.cos(ang) - uy * Math.sin(ang);
    var ry = ux * Math.sin(ang) + uy * Math.cos(ang);
    return {
      mid: { x: base.x + rx * a, y: base.y + ry * a },
      end: { x: base.x + ux * dd, y: base.y + uy * dd }
    };
  }

  // 每個肢體末端：基部關節、中間關節、長度、彎曲方向
  var LIMBS = {
    side: {
      handN: { base: 'shoulder', mid: 'elbowN', a: L.upper, b: L.fore, bend: 1 },
      handF: { base: 'shoulder', mid: 'elbowF', a: L.upper, b: L.fore, bend: 1 },
      ankleN: { base: 'hip', mid: 'kneeN', a: L.thigh, b: L.shin, bend: -1, foot: 'N' },
      ankleF: { base: 'hip', mid: 'kneeF', a: L.thigh, b: L.shin, bend: -1, foot: 'F' }
    },
    front: {
      handR: { base: 'shoulderR', mid: 'elbowR', a: L.upper, b: L.fore, bend: 1 },
      handL: { base: 'shoulderL', mid: 'elbowL', a: L.upper, b: L.fore, bend: -1 },
      ankleR: { base: 'hipR', mid: 'kneeR', a: L.thigh, b: L.shin, bend: 1, foot: 'R' },
      ankleL: { base: 'hipL', mid: 'kneeL', a: L.thigh, b: L.shin, bend: -1, foot: 'L' }
    }
  };

  /* ---------------- 規格解析 ---------------- */
  function resolveFrame(spec, frame) {
    var base = BASE[spec.view + '-' + (spec.base || 'stand')] || BASE['side-stand'];
    var p = {};
    NUMERIC_KEYS.forEach(function (k) {
      p[k] = base[k] !== undefined ? base[k] : 0;
    });
    Object.keys(frame || {}).forEach(function (k) {
      if (NUMERIC_KEYS.indexOf(k) !== -1) p[k] = frame[k];
    });
    return p;
  }

  function anchorFor(spec, frame) {
    var a = (frame && frame.anchor) || spec.anchor;
    if (a) return a;
    var b = spec.base || 'stand';
    if (b === 'seat') return { joint: 'hip', at: [spec.view === 'front' ? 120 : 104, SEAT_HIP_Y] };
    if (b === 'lie') return { joint: 'shoulder', at: [70, 171] };
    if (spec.view === 'front') return { joint: 'hip', at: [120, FOOT_Y - L.thigh - L.shin] };
    return { joint: 'ankleN', at: [120, FOOT_Y] };
  }

  /** 計算某一姿勢的世界座標關節位置（套用錨點）。 */
  function solve(spec, pose, anchor) {
    var j = spec.view === 'front' ? fkFront(pose) : fkSide(pose);
    var aj = j[anchor.joint] || j.hip;
    var dx = anchor.at[0] - aj.x;
    var dy = anchor.at[1] - aj.y;
    var out = {};
    Object.keys(j).forEach(function (k) {
      var val = j[k];
      out[k] = val && typeof val === 'object' ? { x: val.x + dx, y: val.y + dy } : val;
    });
    return out;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function lerpPt(p, q, t) {
    return { x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) };
  }
  function ease(t) {
    return 0.5 - 0.5 * Math.cos(Math.PI * t);
  }

  function lerpPose(p, q, t) {
    var r = {};
    NUMERIC_KEYS.forEach(function (k) {
      r[k] = lerp(p[k], q[k], t);
    });
    return r;
  }

  function targetOf(ref, joints) {
    if (Array.isArray(ref)) return { x: ref[0], y: ref[1] };
    if (typeof ref === 'string' && joints[ref]) return joints[ref];
    if (ref && typeof ref === 'object' && ref.at !== undefined) return targetOf(ref.at, joints);
    return null;
  }
  function bendOf(ref, fallback) {
    return ref && typeof ref === 'object' && !Array.isArray(ref) && ref.bend ? ref.bend : fallback;
  }

  /** 由規格產生兩個關鍵影格之間（t∈[0,1]）的關節位置。 */
  function jointsAt(spec, fi, fj, t) {
    var fa = spec.frames[fi] || {};
    var fb = spec.frames[fj] || {};
    var pa = resolveFrame(spec, fa);
    var pb = resolveFrame(spec, fb);
    var aa = anchorFor(spec, fa);
    var ab = anchorFor(spec, fb);
    var pose = lerpPose(pa, pb, t);
    var j;
    if (aa.joint === ab.joint) {
      j = solve(spec, pose, { joint: aa.joint, at: [lerp(aa.at[0], ab.at[0], t), lerp(aa.at[1], ab.at[1], t)] });
    } else {
      var ja = solve(spec, pose, aa);
      var jb = solve(spec, pose, ab);
      j = {};
      Object.keys(ja).forEach(function (k) {
        j[k] = ja[k] && typeof ja[k] === 'object' ? lerpPt(ja[k], jb[k], t) : ja[k];
      });
    }
    // 反向運動學：手腳碰到指定位置
    var ika = fa.ik || {};
    var ikb = fb.ik || {};
    var limbs = LIMBS[spec.view === 'front' ? 'front' : 'side'];
    var keys = {};
    Object.keys(ika).forEach(function (k) {
      keys[k] = 1;
    });
    Object.keys(ikb).forEach(function (k) {
      keys[k] = 1;
    });
    var cacheA = null;
    var cacheB = null;
    Object.keys(keys).forEach(function (end) {
      var limb = limbs[end];
      if (!limb) return;
      var ta = ika[end] !== undefined ? targetOf(ika[end], j) : null;
      var tb = ikb[end] !== undefined ? targetOf(ikb[end], j) : null;
      if (!ta) {
        cacheA = cacheA || solve(spec, pa, aa);
        ta = cacheA[end];
      }
      if (!tb) {
        cacheB = cacheB || solve(spec, pb, ab);
        tb = cacheB[end];
      }
      var target = lerpPt(ta, tb, t);
      var bend = bendOf(t < 0.5 ? ika[end] || ikb[end] : ikb[end] || ika[end], limb.bend);
      var r = ik2(j[limb.base], target, limb.a, limb.b, bend);
      if (limb.foot) {
        var s = limb.foot;
        var toeOff = sub(j['toe' + s], j['ankle' + s]);
        var heelOff = sub(j['heel' + s], j['ankle' + s]);
        j['toe' + s] = add(r.end, toeOff);
        j['heel' + s] = add(r.end, heelOff);
      }
      j[limb.mid] = r.mid;
      j[end] = r.end;
    });
    return j;
  }

  /* ---------------- SVG 繪製 ---------------- */
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      e.setAttribute(k, attrs[k]);
    });
    if (parent) parent.appendChild(e);
    return e;
  }

  function isDynamic(pr) {
    return ['band', 'weight', 'towel', 'pillow', 'ball'].indexOf(pr.type) !== -1;
  }

  function drawChairSide(g, pr) {
    var c = 'fig-prop';
    var x = pr.x !== undefined ? pr.x : 82;
    var w = pr.w || 42;
    var seatY = pr.seatY || SEAT_TOP;
    var backRight = pr.back === 'right';
    var backX = backRight ? x + w : x;
    el('rect', { x: x, y: seatY, width: w, height: 6, rx: 3, class: c + ' fig-fill' }, g);
    el('line', { x1: backX, y1: seatY + 3, x2: backX + (backRight ? 3 : -3), y2: seatY - (pr.backH || 58), class: c, 'stroke-width': 6 }, g);
    el('line', { x1: x + 4, y1: seatY + 5, x2: x + 2, y2: GROUND, class: c, 'stroke-width': 5 }, g);
    el('line', { x1: x + w - 4, y1: seatY + 5, x2: x + w - 2, y2: GROUND, class: c, 'stroke-width': 5 }, g);
    if (pr.arms) {
      el('line', { x1: x + 2, y1: seatY - 24, x2: x + w - 6, y2: seatY - 24, class: c, 'stroke-width': 5 }, g);
      el('line', { x1: x + w - 8, y1: seatY - 24, x2: x + w - 8, y2: seatY, class: c, 'stroke-width': 4 }, g);
    }
  }

  function drawChairFront(g, pr) {
    var c = 'fig-prop';
    var cx = pr.x !== undefined ? pr.x : 120;
    var seatY = pr.seatY || SEAT_TOP;
    el('rect', { x: cx - 30, y: seatY - 70, width: 60, height: 9, rx: 3, class: c + ' fig-fill' }, g);
    el('line', { x1: cx - 26, y1: seatY - 64, x2: cx - 26, y2: seatY, class: c, 'stroke-width': 5 }, g);
    el('line', { x1: cx + 26, y1: seatY - 64, x2: cx + 26, y2: seatY, class: c, 'stroke-width': 5 }, g);
    el('rect', { x: cx - 32, y: seatY, width: 64, height: 7, rx: 3, class: c + ' fig-fill' }, g);
    el('line', { x1: cx - 28, y1: seatY + 6, x2: cx - 31, y2: GROUND, class: c, 'stroke-width': 5 }, g);
    el('line', { x1: cx + 28, y1: seatY + 6, x2: cx + 31, y2: GROUND, class: c, 'stroke-width': 5 }, g);
  }

  function drawProp(g, pr, spec) {
    var c = 'fig-prop';
    switch (pr.type) {
      case 'chair':
        if ((pr.view || spec.view) === 'front') drawChairFront(g, pr);
        else drawChairSide(g, pr);
        break;
      case 'wall': {
        var wx = pr.x;
        var dir = pr.side === 'left' ? -1 : 1;
        el('line', { x1: wx, y1: 14, x2: wx, y2: GROUND, class: c, 'stroke-width': 5 }, g);
        for (var yy = 24; yy < GROUND; yy += 16) {
          el('line', { x1: wx, y1: yy, x2: wx + dir * 8, y2: yy - 8, class: c, 'stroke-width': 2 }, g);
        }
        break;
      }
      case 'bed': {
        var by = pr.y || 178;
        el('rect', { x: pr.x1, y: by, width: pr.x2 - pr.x1, height: 10, rx: 4, class: c + ' fig-fill' }, g);
        el('line', { x1: pr.x1 + 8, y1: by + 9, x2: pr.x1 + 8, y2: GROUND, class: c, 'stroke-width': 5 }, g);
        el('line', { x1: pr.x2 - 8, y1: by + 9, x2: pr.x2 - 8, y2: GROUND, class: c, 'stroke-width': 5 }, g);
        if (pr.pillow) el('rect', { x: pr.x1 + 4, y: by - 9, width: 34, height: 9, rx: 4, class: 'fig-soft fig-fill' }, g);
        break;
      }
      case 'cone': {
        var kx = pr.x;
        el('path', { d: 'M' + (kx - 10) + ' ' + (GROUND + 1) + ' L' + kx + ' ' + (GROUND - 26) + ' L' + (kx + 10) + ' ' + (GROUND + 1) + ' Z', class: 'fig-accent fig-fill' }, g);
        break;
      }
      case 'tape':
        el('line', { x1: pr.x1, y1: pr.y, x2: pr.x2, y2: pr.y, class: 'fig-accent', 'stroke-width': 3, 'stroke-dasharray': '6 4' }, g);
        break;
      case 'cup': {
        var ux = pr.x;
        var uy = pr.y;
        el('line', { x1: ux - 16, y1: uy + 9, x2: ux + 20, y2: uy + 9, class: c, 'stroke-width': 4 }, g);
        el('rect', { x: ux - 6, y: uy - 5, width: 12, height: 14, rx: 2, class: 'fig-accent fig-fill' }, g);
        break;
      }
      case 'path':
        el('path', { d: pr.d, class: 'fig-accent', 'stroke-width': 2.5, fill: 'none', 'stroke-dasharray': '4 5' }, g);
        break;
      case 'arc': {
        // 旋轉方向提示：腰部前方的弧形雙箭頭
        var ax = pr.x;
        var ay = pr.y;
        var rx = pr.rx || 28;
        var ry = pr.ry || 8;
        el('path', { d: 'M' + (ax - rx) + ' ' + ay + ' A' + rx + ' ' + ry + ' 0 0 0 ' + (ax + rx) + ' ' + ay, class: 'fig-accent', 'stroke-width': 3, fill: 'none' }, g);
        el('path', { d: 'M' + (ax - rx - 5) + ' ' + (ay + 1) + ' L' + (ax - rx + 1) + ' ' + (ay - 7) + ' L' + (ax - rx + 5) + ' ' + (ay + 3) + ' Z', class: 'fig-accent fig-fill' }, g);
        el('path', { d: 'M' + (ax + rx + 5) + ' ' + (ay + 1) + ' L' + (ax + rx - 1) + ' ' + (ay - 7) + ' L' + (ax + rx - 5) + ' ' + (ay + 3) + ' Z', class: 'fig-accent fig-fill' }, g);
        break;
      }
      default:
        break;
    }
  }

  function buildFigure(svg, spec) {
    var parts = {};
    el('line', { x1: 6, y1: GROUND + 2, x2: W - 6, y2: GROUND + 2, class: 'fig-ground', 'stroke-width': 3 }, svg);
    var back = el('g', { class: 'fig-props' }, svg);
    (spec.props || []).forEach(function (pr) {
      if (pr.layer !== 'front' && !isDynamic(pr)) drawProp(back, pr, spec);
    });
    var body = el('g', { class: 'fig-body' }, svg);
    function seg(name, cls, width) {
      parts[name] = el('line', { class: cls, 'stroke-width': width }, body);
    }
    if (spec.view === 'front') {
      ['R', 'L'].forEach(function (s) {
        seg('thigh' + s, 'fig-near', 9);
        seg('shin' + s, 'fig-near', 8);
        seg('foot' + s, 'fig-near', 6);
      });
      seg('pelvis', 'fig-near', 10);
      seg('trunk', 'fig-near', 15);
      seg('shoulders', 'fig-near', 9);
      parts.head = el('circle', { r: L.headR, class: 'fig-head' }, body);
      parts.eye1 = el('circle', { r: 1.8, class: 'fig-eye' }, body);
      parts.eye2 = el('circle', { r: 1.8, class: 'fig-eye' }, body);
      ['R', 'L'].forEach(function (s) {
        seg('upper' + s, 'fig-near', 8);
        seg('fore' + s, 'fig-near', 7);
      });
    } else {
      seg('thighF', 'fig-far', 9);
      seg('shinF', 'fig-far', 8);
      seg('footF', 'fig-far', 6);
      seg('upperF', 'fig-far', 8);
      seg('foreF', 'fig-far', 7);
      seg('trunk', 'fig-near', 15);
      seg('thighN', 'fig-near', 9);
      seg('shinN', 'fig-near', 8);
      seg('footN', 'fig-near', 6);
      parts.head = el('circle', { r: L.headR, class: 'fig-head' }, body);
      parts.eye1 = el('circle', { r: 1.8, class: 'fig-eye' }, body);
      seg('upperN', 'fig-near', 8);
      seg('foreN', 'fig-near', 7);
    }
    var front = el('g', { class: 'fig-props-front' }, svg);
    parts.dyn = [];
    (spec.props || []).forEach(function (pr) {
      if (pr.layer === 'front' && !isDynamic(pr)) drawProp(front, pr, spec);
      if (!isDynamic(pr)) return;
      var node;
      if (pr.type === 'band') node = el('line', { class: 'fig-band', 'stroke-width': 3.5 }, front);
      else if (pr.type === 'towel') node = el('line', { class: 'fig-towel', 'stroke-width': 6 }, front);
      else if (pr.type === 'weight') node = el('rect', { width: 9, height: 15, rx: 3, class: 'fig-accent fig-fill' }, front);
      else if (pr.type === 'pillow') node = el('ellipse', { rx: 8, ry: 7, class: 'fig-accent fig-fill' }, front);
      else node = el('circle', { r: 7, class: 'fig-accent fig-fill' }, front);
      parts.dyn.push({ prop: pr, node: node });
    });
    return parts;
  }

  function setLine(node, a, b) {
    node.setAttribute('x1', a.x.toFixed(1));
    node.setAttribute('y1', a.y.toFixed(1));
    node.setAttribute('x2', b.x.toFixed(1));
    node.setAttribute('y2', b.y.toFixed(1));
  }

  function update(parts, spec, j) {
    if (spec.view === 'front') {
      ['R', 'L'].forEach(function (s) {
        setLine(parts['thigh' + s], j['hip' + s], j['knee' + s]);
        setLine(parts['shin' + s], j['knee' + s], j['ankle' + s]);
        setLine(parts['foot' + s], j['heel' + s], j['toe' + s]);
        setLine(parts['upper' + s], j['shoulder' + s], j['elbow' + s]);
        setLine(parts['fore' + s], j['elbow' + s], j['hand' + s]);
      });
      setLine(parts.pelvis, j.hipR, j.hipL);
      setLine(parts.trunk, j.hip, j.neckBase);
      setLine(parts.shoulders, j.shoulderR, j.shoulderL);
      var tw = Math.sin(rad(j.twist || 0)) * 5;
      var hide = spec.back ? '0' : '1';
      parts.eye1.setAttribute('opacity', hide);
      parts.eye2.setAttribute('opacity', hide);
      parts.eye1.setAttribute('cx', (j.head.x - 4 + tw).toFixed(1));
      parts.eye1.setAttribute('cy', (j.head.y - 1).toFixed(1));
      parts.eye2.setAttribute('cx', (j.head.x + 4 + tw).toFixed(1));
      parts.eye2.setAttribute('cy', (j.head.y - 1).toFixed(1));
    } else {
      ['N', 'F'].forEach(function (s) {
        setLine(parts['thigh' + s], j.hip, j['knee' + s]);
        setLine(parts['shin' + s], j['knee' + s], j['ankle' + s]);
        setLine(parts['foot' + s], j['heel' + s], j['toe' + s]);
        setLine(parts['upper' + s], j.shoulder, j['elbow' + s]);
        setLine(parts['fore' + s], j['elbow' + s], j['hand' + s]);
      });
      setLine(parts.trunk, j.hip, j.shoulder);
      var hd = j.headDir || 0;
      parts.eye1.setAttribute('cx', (j.head.x + Math.cos(rad(hd)) * 5 + Math.sin(rad(hd)) * 2).toFixed(1));
      parts.eye1.setAttribute('cy', (j.head.y + Math.sin(rad(hd)) * 5 - Math.cos(rad(hd)) * 2).toFixed(1));
    }
    parts.head.setAttribute('cx', j.head.x.toFixed(1));
    parts.head.setAttribute('cy', j.head.y.toFixed(1));
    parts.dyn.forEach(function (d) {
      var pr = d.prop;
      if (pr.type === 'band' || pr.type === 'towel') {
        var pa = targetOf(pr.a, j) || { x: 0, y: 0 };
        var pb = targetOf(pr.b, j) || { x: 0, y: 0 };
        setLine(d.node, pa, pb);
      } else if (pr.type === 'weight') {
        var h = targetOf(pr.at, j) || { x: 0, y: 0 };
        d.node.setAttribute('x', (h.x - 4.5).toFixed(1));
        d.node.setAttribute('y', (h.y - 7.5).toFixed(1));
      } else {
        var a = targetOf(pr.a, j) || { x: 0, y: 0 };
        var b = pr.b ? targetOf(pr.b, j) || a : a;
        d.node.setAttribute('cx', ((a.x + b.x) / 2 + (pr.dx || 0)).toFixed(1));
        d.node.setAttribute('cy', ((a.y + b.y) / 2 + (pr.dy || 0)).toFixed(1));
      }
    });
  }

  function makeSvg(label) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'fig-svg');
    svg.setAttribute('focusable', 'false');
    if (label) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', label);
    } else {
      svg.setAttribute('aria-hidden', 'true');
    }
    return svg;
  }

  /* ---------------- 動畫控制 ---------------- */
  var active = [];
  var rafId = null;
  var reduceMotion = false;
  try {
    reduceMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {
    reduceMotion = false;
  }

  function tick(now) {
    rafId = null;
    var any = false;
    for (var i = 0; i < active.length; i++) {
      var f = active[i];
      if (!f.playing || !f.visible) continue;
      if (!f.svg.isConnected) continue;
      any = true;
      f.step(now);
    }
    if (any) rafId = root.requestAnimationFrame(tick);
  }
  function kick() {
    if (rafId === null && root.requestAnimationFrame) rafId = root.requestAnimationFrame(tick);
  }

  var observer = null;
  function observe(f) {
    if (!root.IntersectionObserver) {
      f.visible = true;
      return;
    }
    if (!observer) {
      observer = new root.IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var fig = en.target.__ydFigure;
          if (fig) {
            fig.visible = en.isIntersecting;
            if (fig.visible) kick();
          }
        });
      });
    }
    f.svg.__ydFigure = f;
    observer.observe(f.svg);
  }

  // 清除已從畫面移除的人偶，避免記憶體累積
  function sweep() {
    for (var i = active.length - 1; i >= 0; i--) {
      if (!active[i].svg.isConnected) {
        if (observer) observer.unobserve(active[i].svg);
        active.splice(i, 1);
      }
    }
  }

  /**
   * 在 container 內建立動畫人偶。
   * opts: { label, autoplay（預設依減少動態設定）, frame }
   */
  function mount(container, spec, opts) {
    opts = opts || {};
    sweep();
    var svg = makeSvg(opts.label);
    var parts = buildFigure(svg, spec);
    container.appendChild(svg);
    var n = spec.frames.length;
    var hold = spec.hold !== undefined ? spec.hold : 450;
    var dur = spec.dur || 1100;
    var segLen = hold + dur;
    var f = {
      svg: svg,
      frames: n,
      playing: false,
      visible: false,
      frame: opts.frame || 0,
      start: 0,
      step: function (now) {
        if (!f.start) f.start = now - f.frame * segLen;
        var tt = (now - f.start) % (segLen * n);
        var i = Math.floor(tt / segLen);
        var local = tt - i * segLen;
        var t = local < hold ? 0 : ease((local - hold) / dur);
        f.frame = i;
        update(parts, spec, jointsAt(spec, i, (i + 1) % n, t));
      },
      show: function (k) {
        f.frame = ((k % n) + n) % n;
        update(parts, spec, jointsAt(spec, f.frame, f.frame, 0));
      },
      next: function () {
        f.show(f.frame + 1);
      },
      play: function () {
        f.playing = true;
        f.start = 0;
        kick();
      },
      pause: function () {
        f.playing = false;
      },
      destroy: function () {
        f.playing = false;
        if (observer) observer.unobserve(svg);
        var idx = active.indexOf(f);
        if (idx !== -1) active.splice(idx, 1);
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      }
    };
    f.show(f.frame);
    active.push(f);
    observe(f);
    var auto = opts.autoplay !== undefined ? opts.autoplay : !reduceMotion;
    if (auto && n > 1) f.play();
    return f;
  }

  /** 產生靜態 SVG 元素（列印與縮圖用）。 */
  function staticSvg(spec, frameIndex, label) {
    var svg = makeSvg(label);
    var parts = buildFigure(svg, spec);
    var k = frameIndex || 0;
    update(parts, spec, jointsAt(spec, k, k, 0));
    return svg;
  }

  YD.figure = {
    W: W,
    H: H,
    GROUND: GROUND,
    FOOT_Y: FOOT_Y,
    SEAT_HIP_Y: SEAT_HIP_Y,
    SEAT_TOP: SEAT_TOP,
    L: L,
    mount: mount,
    staticSvg: staticSvg,
    jointsAt: jointsAt,
    reduceMotion: function () {
      return reduceMotion;
    },
    _deg: deg
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
