/* Aliya official option 1 brand motion, adapted from the supplied preview HTML.
   Uses the original vector paths and opposing left/right writing animation only;
   excludes all voice/microphone demo UI. */
(function(){
  if(typeof window==='undefined'||typeof Path2D==='undefined')return;
  let currentVariant=1;
  // 1. Векторные контуры главного слова «Aliya» (viewport 108x108)
  const ALIYA_PATHS_SVG = [
    "M29.00,59.44L35.11,44.05L38.20,44.05L44.24,59.44L40.62,59.44L36.00,46.67L37.24,46.67L32.55,59.44L29.00,59.44ZM32.47,56.65L32.47,53.86L40.86,53.86L40.86,56.65L32.47,56.65Z",
    "M45.75,59.44L45.75,43.61L49.09,43.61L49.09,59.44L45.75,59.44Z",
    "M51.44,59.44L51.44,48.85L54.78,48.85L54.78,59.44L51.44,59.44Z",
    "M60.40,59.49L56.04,48.85L59.64,48.85L62.40,57.28L61.07,57.28L63.91,48.85L67.51,48.85L62.97,59.49L60.40,59.49ZM57.67,63.91L60.86,57.04L62.97,59.49L61.10,63.91L57.67,63.91Z",
    "M72.81,59.66Q71.35,59.66 70.20,58.94Q69.06,58.22 68.39,56.98Q67.73,55.74 67.73,54.14Q67.73,52.55 68.39,51.31Q69.06,50.07 70.20,49.35Q71.35,48.63 72.81,48.63Q73.88,48.63 74.74,49.04Q75.60,49.46 76.14,50.19Q76.69,50.92 76.75,51.86L76.75,56.43Q76.69,57.37 76.16,58.10Q75.62,58.83 74.75,59.25Q73.88,59.66 72.81,59.66ZM73.48,56.65Q74.55,56.65 75.21,55.94Q75.86,55.24 75.86,54.14Q75.86,53.40 75.57,52.84Q75.27,52.27 74.74,51.95Q74.20,51.64 73.51,51.64Q72.81,51.64 72.27,51.95Q71.74,52.27 71.42,52.84Q71.11,53.40 71.11,54.14Q71.11,54.86 71.41,55.43Q71.72,56.00 72.26,56.33Q72.81,56.65 73.48,56.65ZM75.73,59.44L75.73,56.59L76.23,54.01L75.73,51.44L75.73,48.85L79.00,48.85L79.00,59.44L75.73,59.44Z"
  ];
  const ALIYA_DOT_SVG = "M53.12,47.39Q52.33,47.39 51.82,46.85Q51.31,46.32 51.31,45.55Q51.31,44.77 51.82,44.25Q52.33,43.72 53.12,43.72Q53.90,43.72 54.40,44.25Q54.90,44.77 54.90,45.55Q54.90,46.32 54.40,46.85Q53.90,47.39 53.12,47.39Z";

  // 2A. Векторные контуры «sharipov» (Poppins SemiBold — тот же фирменный шрифт, что у «Aliya»), выразительный размер (ширина 26.3)
  const SHARIPOV_MED = {
    aliyaShiftY: -3.4,
    lineWidth: 27.4,
    lineY: 70.0,
    lineH: 2.15,
    cursorY: 63.15,
    cursorH: 4.35,
    cursorW: 0.78,
    cursorStartRight: 67.65,
    leftEdges: [40.85, 44.09, 47.96, 51.92, 54.41, 56.21, 60.17, 63.91],
    dot: new Path2D("M54.70,63.41Q54.70,63.22 54.83,63.09Q54.96,62.97 55.16,62.97Q55.36,62.97 55.49,63.09Q55.63,63.22 55.63,63.41Q55.63,63.60 55.49,63.73Q55.36,63.85 55.16,63.85Q54.96,63.85 54.83,63.73Q54.70,63.60 54.70,63.41Z"),
    paths: [
      // s
      "M41.06,66.26L41.82,66.26Q41.84,66.43 41.99,66.54Q42.14,66.65 42.36,66.65Q42.58,66.65 42.70,66.57Q42.82,66.48 42.82,66.35Q42.82,66.20 42.67,66.13Q42.53,66.06 42.20,65.97Q41.87,65.89 41.65,65.80Q41.44,65.72 41.29,65.54Q41.13,65.36 41.13,65.06Q41.13,64.81 41.28,64.60Q41.42,64.40 41.69,64.28Q41.95,64.16 42.31,64.16Q42.85,64.16 43.17,64.43Q43.49,64.69 43.52,65.15L42.80,65.15Q42.78,64.97 42.65,64.86Q42.51,64.76 42.29,64.76Q42.09,64.76 41.98,64.83Q41.87,64.91 41.87,65.05Q41.87,65.20 42.02,65.27Q42.17,65.35 42.49,65.43Q42.81,65.52 43.02,65.60Q43.23,65.69 43.39,65.87Q43.54,66.05 43.55,66.35Q43.55,66.61 43.40,66.81Q43.26,67.02 42.99,67.13Q42.73,67.25 42.37,67.25Q42.00,67.25 41.71,67.12Q41.42,66.98 41.25,66.76Q41.08,66.53 41.06,66.26Z",
      // h
      "M47.32,65.45L47.32,67.20L46.56,67.20L46.56,65.55Q46.56,65.19 46.38,65.00Q46.21,64.81 45.90,64.81Q45.58,64.81 45.40,65.00Q45.22,65.19 45.22,65.55L45.22,67.20L44.47,67.20L44.47,63.20L45.22,63.20L45.22,64.58Q45.37,64.39 45.61,64.28Q45.85,64.17 46.15,64.17Q46.49,64.17 46.76,64.31Q47.02,64.46 47.17,64.75Q47.32,65.04 47.32,65.45Z",
      // a
      "M49.51,64.16Q49.84,64.16 50.09,64.29Q50.35,64.43 50.50,64.64L50.50,64.21L51.26,64.21L51.26,67.20L50.50,67.20L50.50,66.76Q50.35,66.97 50.09,67.11Q49.84,67.25 49.50,67.25Q49.12,67.25 48.81,67.05Q48.50,66.86 48.32,66.51Q48.14,66.15 48.14,65.69Q48.14,65.24 48.32,64.89Q48.50,64.54 48.81,64.35Q49.12,64.16 49.51,64.16ZM49.70,64.82Q49.49,64.82 49.31,64.93Q49.14,65.03 49.02,65.23Q48.91,65.42 48.91,65.69Q48.91,65.96 49.02,66.17Q49.14,66.37 49.32,66.48Q49.50,66.58 49.70,66.58Q49.91,66.58 50.10,66.48Q50.28,66.37 50.39,66.18Q50.50,65.98 50.50,65.70Q50.50,65.43 50.39,65.23Q50.28,65.03 50.10,64.93Q49.91,64.82 49.70,64.82Z",
      // r
      "M53.97,64.17L53.97,64.96L53.77,64.96Q53.42,64.96 53.23,65.13Q53.05,65.29 53.05,65.71L53.05,67.20L52.30,67.20L52.30,64.21L53.05,64.21L53.05,64.67Q53.20,64.44 53.43,64.30Q53.67,64.17 53.97,64.17Z",
      // i (stem)
      "M55.54,64.21L55.54,67.20L54.78,67.20L54.78,64.21Z",
      // p
      "M58.32,64.16Q58.71,64.16 59.02,64.35Q59.33,64.54 59.51,64.89Q59.69,65.23 59.69,65.69Q59.69,66.15 59.51,66.51Q59.33,66.86 59.02,67.05Q58.71,67.25 58.32,67.25Q58.00,67.25 57.74,67.11Q57.49,66.98 57.34,66.77L57.34,68.63L56.58,68.63L56.58,64.21L57.34,64.21L57.34,64.64Q57.48,64.44 57.74,64.30Q58.00,64.16 58.32,64.16ZM58.12,64.82Q57.92,64.82 57.74,64.93Q57.56,65.03 57.45,65.23Q57.34,65.43 57.34,65.70Q57.34,65.97 57.45,66.17Q57.56,66.37 57.74,66.48Q57.92,66.58 58.12,66.58Q58.34,66.58 58.52,66.48Q58.70,66.37 58.81,66.17Q58.92,65.97 58.92,65.69Q58.92,65.42 58.81,65.23Q58.70,65.03 58.52,64.93Q58.34,64.82 58.12,64.82Z",
      // o
      "M60.35,65.70Q60.35,65.25 60.55,64.89Q60.76,64.54 61.11,64.35Q61.46,64.16 61.89,64.16Q62.32,64.16 62.67,64.35Q63.03,64.54 63.23,64.89Q63.43,65.25 63.43,65.70Q63.43,66.16 63.22,66.51Q63.01,66.87 62.66,67.06Q62.31,67.25 61.87,67.25Q61.44,67.25 61.09,67.06Q60.75,66.87 60.55,66.51Q60.35,66.16 60.35,65.70ZM62.65,65.70Q62.65,65.28 62.43,65.05Q62.20,64.82 61.88,64.82Q61.56,64.82 61.34,65.05Q61.12,65.28 61.12,65.70Q61.12,66.13 61.33,66.36Q61.55,66.59 61.87,66.59Q62.08,66.59 62.26,66.49Q62.44,66.39 62.54,66.19Q62.65,65.99 62.65,65.70Z",
      // v
      "M65.53,66.50L66.29,64.21L67.09,64.21L65.99,67.20L65.07,67.20L63.97,64.21L64.78,64.21Z"
    ].map(d => new Path2D(d))
  };

  // 2B. Компактный вариант «sharipov» строго в ширину короткой линии 19 ед. под буквой «y»
  const SHARIPOV_COMPACT = {
    aliyaShiftY: -3.2,
    lineWidth: 19.4,
    lineY: 67.65,
    lineH: 2.15,
    cursorY: 62.55,
    cursorH: 3.25,
    cursorW: 0.65,
    cursorStartRight: 63.85,
    leftEdges: [44.53, 46.87, 49.66, 52.51, 54.30, 55.61, 58.46, 61.16],
    dot: new Path2D("M54.51,62.80Q54.51,62.66 54.61,62.57Q54.70,62.48 54.84,62.48Q54.98,62.48 55.08,62.57Q55.17,62.66 55.17,62.80Q55.17,62.93 55.08,63.02Q54.98,63.11 54.84,63.11Q54.70,63.11 54.61,63.02Q54.51,62.93 54.51,62.80Z"),
    paths: [
      "M44.68,64.83L45.23,64.83Q45.24,64.95 45.35,65.03Q45.45,65.11 45.61,65.11Q45.77,65.11 45.85,65.05Q45.94,64.99 45.94,64.89Q45.94,64.79 45.83,64.74Q45.73,64.68 45.50,64.62Q45.26,64.56 45.11,64.50Q44.95,64.44 44.84,64.31Q44.73,64.19 44.73,63.97Q44.73,63.79 44.84,63.65Q44.94,63.50 45.13,63.42Q45.32,63.33 45.58,63.33Q45.96,63.33 46.19,63.52Q46.41,63.71 46.44,64.04L45.92,64.04Q45.91,63.91 45.81,63.83Q45.72,63.76 45.56,63.76Q45.42,63.76 45.34,63.81Q45.26,63.87 45.26,63.96Q45.26,64.07 45.37,64.13Q45.47,64.18 45.70,64.24Q45.93,64.30 46.08,64.36Q46.23,64.42 46.34,64.55Q46.45,64.68 46.46,64.89Q46.46,65.08 46.35,65.22Q46.25,65.37 46.06,65.45Q45.87,65.53 45.62,65.53Q45.35,65.53 45.15,65.44Q44.94,65.35 44.82,65.18Q44.70,65.02 44.68,64.83Z",
      "M49.17,64.25L49.17,65.50L48.63,65.50L48.63,64.32Q48.63,64.07 48.50,63.93Q48.38,63.79 48.16,63.79Q47.93,63.79 47.81,63.93Q47.68,64.07 47.68,64.32L47.68,65.50L47.14,65.50L47.14,62.65L47.68,62.65L47.68,63.63Q47.78,63.49 47.95,63.42Q48.13,63.34 48.34,63.34Q48.58,63.34 48.77,63.44Q48.96,63.55 49.06,63.75Q49.17,63.96 49.17,64.25Z",
      "M50.76,63.33Q51.00,63.33 51.18,63.43Q51.36,63.52 51.46,63.67L51.46,63.37L52.01,63.37L52.01,65.50L51.46,65.50L51.46,65.19Q51.36,65.34 51.18,65.44Q50.99,65.53 50.75,65.53Q50.48,65.53 50.26,65.40Q50.04,65.26 49.91,65.01Q49.78,64.75 49.78,64.43Q49.78,64.10 49.91,63.85Q50.04,63.60 50.26,63.47Q50.48,63.33 50.76,63.33ZM50.90,63.81Q50.75,63.81 50.62,63.88Q50.49,63.95 50.41,64.09Q50.33,64.23 50.33,64.43Q50.33,64.62 50.41,64.76Q50.49,64.91 50.62,64.98Q50.75,65.06 50.90,65.06Q51.05,65.06 51.18,64.99Q51.31,64.91 51.39,64.77Q51.46,64.63 51.46,64.43Q51.46,64.24 51.39,64.10Q51.31,63.96 51.18,63.88Q51.05,63.81 50.90,63.81Z",
      "M53.97,63.34L53.97,63.90L53.82,63.90Q53.57,63.90 53.44,64.02Q53.31,64.14 53.31,64.44L53.31,65.50L52.77,65.50L52.77,63.37L53.31,63.37L53.31,63.70Q53.42,63.53 53.58,63.43Q53.75,63.34 53.97,63.34Z",
      "M55.11,63.37L55.11,65.50L54.57,65.50L54.57,63.37Z",
      "M57.12,63.33Q57.40,63.33 57.62,63.47Q57.84,63.60 57.97,63.85Q58.10,64.10 58.10,64.43Q58.10,64.75 57.97,65.01Q57.84,65.26 57.62,65.40Q57.40,65.53 57.12,65.53Q56.89,65.53 56.71,65.44Q56.53,65.34 56.42,65.20L56.42,66.52L55.88,66.52L55.88,63.37L56.42,63.37L56.42,63.68Q56.52,63.53 56.70,63.43Q56.89,63.33 57.12,63.33ZM56.98,63.81Q56.83,63.81 56.70,63.88Q56.58,63.96 56.50,64.10Q56.42,64.24 56.42,64.43Q56.42,64.63 56.50,64.77Q56.58,64.91 56.70,64.99Q56.83,65.06 56.98,65.06Q57.13,65.06 57.26,64.98Q57.39,64.91 57.47,64.76Q57.55,64.62 57.55,64.43Q57.55,64.23 57.47,64.09Q57.39,63.95 57.26,63.88Q57.13,63.81 56.98,63.81Z",
      "M58.59,64.43Q58.59,64.11 58.74,63.86Q58.88,63.61 59.13,63.47Q59.38,63.33 59.69,63.33Q60.00,63.33 60.25,63.47Q60.50,63.61 60.64,63.86Q60.79,64.11 60.79,64.43Q60.79,64.76 60.64,65.01Q60.49,65.26 60.24,65.40Q59.99,65.53 59.68,65.53Q59.37,65.53 59.12,65.40Q58.88,65.26 58.73,65.01Q58.59,64.76 58.59,64.43ZM60.23,64.43Q60.23,64.13 60.07,63.97Q59.91,63.80 59.68,63.80Q59.45,63.80 59.30,63.97Q59.14,64.13 59.14,64.43Q59.14,64.74 59.29,64.90Q59.45,65.06 59.68,65.06Q59.82,65.06 59.95,64.99Q60.08,64.92 60.16,64.78Q60.23,64.64 60.23,64.43Z",
      "M62.31,65.00L62.85,63.37L63.43,63.37L62.64,65.50L61.98,65.50L61.20,63.37L61.78,63.37Z"
    ].map(d => new Path2D(d))
  };

  const aliyaPaths = ALIYA_PATHS_SVG.map(d => new Path2D(d));
  const aliyaDot = new Path2D(ALIYA_DOT_SVG);
  const aliyaStarts = [0.06, 0.18, 0.30, 0.42, 0.54];
  const aliyaRightEdges = [44.6, 49.6, 55.2, 67.8, 79.8];

  // Обратный порядок печати «sharipov»: справа налево v(7) -> o(6) -> p(5) -> i(4) -> r(3) -> a(2) -> h(1) -> s(0)
  // Синхронно с печатью «Aliya» на интервале 0.06 .. 0.67!
  const reverseOrder = [7, 6, 5, 4, 3, 2, 1, 0];
  const sharipovStartsByOrder = [0.06, 0.13, 0.20, 0.27, 0.34, 0.41, 0.48, 0.55];

  function cubicBezierY(x1, y1, x2, y2, t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 8; i++) {
      const bx = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u - t;
      const dbx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
      if (Math.abs(dbx) < 1e-6) break;
      u -= bx / dbx;
    }
    return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
  }

  function fastOutSlowIn(t) {
    return cubicBezierY(0.4, 0.0, 0.2, 1.0, Math.max(0, Math.min(1, t)));
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    if (w <= 0.02 || h <= 0.02) return;
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
    ctx.fill();
  }


  function renderEmblem(canvas, wrapEl, p) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const spec = (currentVariant === 3) ? SHARIPOV_COMPACT : SHARIPOV_MED;
    const aliyaShiftY = spec.aliyaShiftY;

    const settle = fastOutSlowIn(clamp(p / 0.82, 0, 1));
    const rotY = (1 - settle) * -22 + Math.sin(p * 6.28318) * (1 - settle) * 4;
    const rotX = (1 - settle) * 14;
    const cardScale = 0.90 + 0.10 * settle;

    wrapEl.style.transform = `rotateY(${rotY.toFixed(2)}deg) rotateX(${(-rotX).toFixed(2)}deg) scale(${cardScale.toFixed(4)})`;

    // Радиальное коралловое свечение #FF6A3D
    const glowAlpha = 0.14 + 0.18 * settle;
    const cx = W * 0.50, cy = H * 0.52, rad = Math.min(W, H) * 0.46;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    glow.addColorStop(0, `rgba(255, 106, 61, ${glowAlpha.toFixed(4)})`);
    glow.addColorStop(1, "rgba(255, 106, 61, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    const scaleFactor = Math.min(W, H) / 108;
    ctx.scale(scaleFactor, scaleFactor);

    const shimmerX = 18 + p * 84;

    // =========================================================================
    // A. ВЕРХНЕЕ СЛОВО «Aliya» — пишется СЛЕВА НАПРАВО (A -> l -> i -> y -> a)
    // =========================================================================
    let topCursorX = 28.2;
    for (let idx = 0; idx < aliyaPaths.length; idx++) {
      const localT = clamp((p - aliyaStarts[idx]) / 0.13, 0, 1);
      if (localT > 0) {
        const eased = fastOutSlowIn(localT);
        const dropY = aliyaShiftY + (1 - eased) * 5.2;
        topCursorX = aliyaRightEdges[idx] + 1.1;

        for (let layer = 4; layer >= 1; layer--) {
          const depthOffset = layer * 0.36;
          ctx.save();
          ctx.translate(depthOffset * 0.85, dropY + depthOffset);
          ctx.fillStyle = `rgba(43, 32, 29, ${(0.48 * eased).toFixed(4)})`;
          ctx.fill(aliyaPaths[idx], "nonzero");
          ctx.restore();
        }

        const grad = ctx.createLinearGradient(shimmerX - 14, 42 + aliyaShiftY, shimmerX + 14, 62 + aliyaShiftY);
        grad.addColorStop(0, `rgba(247, 245, 242, ${eased.toFixed(4)})`);
        grad.addColorStop(0.5, `rgba(255, 255, 255, ${eased.toFixed(4)})`);
        grad.addColorStop(1, `rgba(230, 226, 220, ${eased.toFixed(4)})`);
        ctx.save();
        ctx.translate(0, dropY);
        ctx.fillStyle = grad;
        ctx.fill(aliyaPaths[idx], "nonzero");
        ctx.restore();
      }
    }

    // Коралловая точка над «i» в «Aliya»
    const dotT = clamp((p - 0.35) / 0.13, 0, 1);
    if (dotT > 0) {
      const dotEase = fastOutSlowIn(dotT);
      const dotDrop = aliyaShiftY + (1 - dotEase) * -5.8;
      ctx.save();
      ctx.translate(0.5, dotDrop + 0.7);
      ctx.fillStyle = `rgba(122, 40, 18, ${(0.55 * dotEase).toFixed(4)})`;
      ctx.fill(aliyaDot, "nonzero");
      ctx.restore();

      ctx.save();
      ctx.translate(0, dotDrop);
      ctx.fillStyle = `rgba(255, 106, 61, ${dotEase.toFixed(4)})`;
      ctx.fill(aliyaDot, "nonzero");
      ctx.restore();
    }

    // Верхний мигающий курсор «Aliya» (движется слева направо ->)
    if (p >= 0.03 && p <= 0.74) {
      const blink = (Math.floor(p * 14) % 2 === 0) ? 0.92 : 0.28;
      const fadeOutCursor = clamp((0.74 - p) / 0.10, 0, 1);
      ctx.fillStyle = `rgba(255, 106, 61, ${(blink * fadeOutCursor).toFixed(4)})`;
      drawRoundRect(ctx, topCursorX, 44.2 + aliyaShiftY, 1.35, 15.6, 0.7);
    }

    // =========================================================================
    // B. КОРАЛЛОВАЯ ЛИНИЯ ____ И НАД НЕЙ «sharipov» В ОБРАТНУЮ СТОРОНУ (<-)
    // =========================================================================
    // 1. Сначала рисуем коралловую линию ____
    if (currentVariant === 1 || currentVariant === 3) {
      // Встречный ход: линия ____ вытягивается СПРАВА НАЛЕВО синхронно с печатью v<-o<-p<-i<-r<-a<-h<-s!
      const lineT = clamp((p - 0.04) / 0.62, 0, 1);
      if (lineT > 0) {
        const lineEase = fastOutSlowIn(lineT);
        const curW = spec.lineWidth * lineEase;
        const rightX = 54.0 + spec.lineWidth / 2;
        const leftX = rightX - curW;
        ctx.fillStyle = `rgba(122, 40, 18, ${(0.50 * Math.min(1, lineEase * 1.4)).toFixed(4)})`;
        drawRoundRect(ctx, leftX + 0.4, spec.lineY + 0.65, curW, spec.lineH, spec.lineH / 2);
        ctx.fillStyle = `rgba(255, 106, 61, ${Math.min(1, lineEase * 1.3).toFixed(4)})`;
        drawRoundRect(ctx, leftX, spec.lineY, curW, spec.lineH, spec.lineH / 2);
      }
    } else {
      // Вариант 2: линия ____ раскрывается из центра
      const lineT = clamp((p - 0.56) / 0.22, 0, 1);
      if (lineT > 0) {
        const lineEase = fastOutSlowIn(lineT);
        const curW = spec.lineWidth * lineEase;
        const leftX = 54.0 - curW / 2;
        ctx.fillStyle = `rgba(122, 40, 18, ${(0.50 * lineEase).toFixed(4)})`;
        drawRoundRect(ctx, leftX + 0.4, spec.lineY + 0.65, curW, spec.lineH, spec.lineH / 2);
        ctx.fillStyle = `rgba(255, 106, 61, ${lineEase.toFixed(4)})`;
        drawRoundRect(ctx, leftX, spec.lineY, curW, spec.lineH, spec.lineH / 2);
      }
    }

    // 2. Прямо НАД линией ____ в обратную сторону (справа налево: v <- o <- p <- i <- r <- a <- h <- s) пишется «sharipov»
    let revCursorX = spec.cursorStartRight;
    // Обратный световой блик (движется навстречу верхнему блику!)
    const revShimmerX = 90 - p * 84;

    for (let step = 0; step < reverseOrder.length; step++) {
      const charIdx = reverseOrder[step]; // 7 ('v') down to 0 ('s')
      const startP = sharipovStartsByOrder[step];
      const localT = clamp((p - startP) / 0.115, 0, 1);
      if (localT > 0) {
        const eased = fastOutSlowIn(localT);
        const dropY = (1 - eased) * 2.1;
        // Курсор шагает ВЛЕВО перед каждой новой буквой
        revCursorX = spec.leftEdges[charIdx] - 1.05;

        // Тонкая 3D-фаска позади буквы sharipov
        for (let layer = 2; layer >= 1; layer--) {
          const dOff = layer * 0.22;
          ctx.save();
          ctx.translate(dOff * 0.85, dropY + dOff);
          ctx.fillStyle = `rgba(43, 32, 29, ${(0.52 * eased).toFixed(4)})`;
          ctx.fill(spec.paths[charIdx], "nonzero");
          ctx.restore();
        }

        // Лицевая грань буквы sharipov со встречным световым бликом
        const sGrad = ctx.createLinearGradient(revShimmerX - 10, 63, revShimmerX + 10, 68);
        sGrad.addColorStop(0, `rgba(232, 228, 222, ${(0.95 * eased).toFixed(4)})`);
        sGrad.addColorStop(0.5, `rgba(255, 255, 255, ${eased.toFixed(4)})`);
        sGrad.addColorStop(1, `rgba(220, 215, 208, ${(0.95 * eased).toFixed(4)})`);
        ctx.save();
        ctx.translate(0, dropY);
        ctx.fillStyle = sGrad;
        ctx.fill(spec.paths[charIdx], "nonzero");
        ctx.restore();
      }
    }

    // Фирменная коралловая точка #FF6A3D над «i» в слове «sharipov» (появляется, когда очередь доходит до «i» на шаге 3: startP = 0.27)
    const sDotT = clamp((p - 0.30) / 0.11, 0, 1);
    if (sDotT > 0) {
      const sDotEase = fastOutSlowIn(sDotT);
      const sDotDrop = (1 - sDotEase) * -2.4;
      ctx.save();
      ctx.translate(0.25, sDotDrop + 0.35);
      ctx.fillStyle = `rgba(122, 40, 18, ${(0.55 * sDotEase).toFixed(4)})`;
      ctx.fill(spec.dot, "nonzero");
      ctx.restore();

      ctx.save();
      ctx.translate(0, sDotDrop);
      ctx.fillStyle = `rgba(255, 106, 61, ${sDotEase.toFixed(4)})`;
      ctx.fill(spec.dot, "nonzero");
      ctx.restore();
    }

    // Нижний встречный мигающий коралловый курсор (движется справа налево <- и плавно гаснет)
    if (p >= 0.03 && p <= 0.74) {
      const blink = (Math.floor(p * 14) % 2 === 0) ? 0.92 : 0.28;
      const fadeOutCursor = clamp((0.74 - p) / 0.10, 0, 1);
      ctx.fillStyle = `rgba(255, 106, 61, ${(blink * fadeOutCursor).toFixed(4)})`;
      drawRoundRect(ctx, revCursorX, spec.cursorY, spec.cursorW, spec.cursorH, spec.cursorW / 2);
    }

    ctx.restore();
  }

  function mount(target){
    if(!target||target.dataset.aliyaEmblemReady)return;
    target.dataset.aliyaEmblemReady='1';
    const canvas=document.createElement('canvas');canvas.width=216;canvas.height=216;
    canvas.setAttribute('aria-hidden','true');canvas.style.cssText='display:block;width:76px;height:76px;flex:0 0 76px';
    target.replaceChildren(canvas);
    const started=performance.now();let raf=0;
    function tick(now){if(!target.isConnected){cancelAnimationFrame(raf);return;}const p=((now-started)%4150)/4150;renderEmblem(canvas,target,p);raf=requestAnimationFrame(tick);}
    raf=requestAnimationFrame(tick);
  }
  function scan(root){(root||document).querySelectorAll('[data-aliya-emblem]').forEach(mount);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){scan(document);},{once:true});else scan(document);
  new MutationObserver(function(records){records.forEach(function(r){r.addedNodes.forEach(function(n){if(n.nodeType===1){if(n.matches&&n.matches('[data-aliya-emblem]'))mount(n);scan(n);}});});}).observe(document.documentElement,{childList:true,subtree:true});
  window.KKH_AliyaBrandAnimation={mount:mount,scan:scan,variant:1};
})();
