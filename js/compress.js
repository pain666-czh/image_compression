// 压缩引擎：cover 裁剪缩放 + JPEG 质量二分逼近 + 兜底降采样
const Compress = (() => {

  // 读取并解码图片（createImageBitmap 自动校正 EXIF 方向，不支持时降级为 Image 元素）
  async function loadBitmap(file) {
    if (window.createImageBitmap) {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (e) {
        // 部分浏览器不支持 imageOrientation 选项，走降级路径
      }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('IMAGE_DECODE_FAIL'));
        el.src = url;
      });
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // 创建高画质绘图的 canvas
  function makeCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    return { canvas, ctx };
  }

  // 分级降采样：逐次减半至最长边不超过 maxSide 的 2 倍，避免大比例直接缩小产生锯齿
  function prescale(source, width, height, maxSide) {
    let w = width, h = height, cur = source;
    while (Math.max(w, h) > maxSide * 2) {
      const nw = Math.max(1, Math.floor(w / 2));
      const nh = Math.max(1, Math.floor(h / 2));
      const { canvas, ctx } = makeCanvas(nw, nh);
      ctx.drawImage(cur, 0, 0, w, h, 0, 0, nw, nh);
      cur = canvas;
      w = nw;
      h = nh;
    }
    return { source: cur, width: w, height: h };
  }

  // cover 模式绘制：等比缩放至填满目标区域并居中裁剪；透明背景铺白底
  function drawCover(source, srcW, srcH, targetW, targetH) {
    const { canvas, ctx } = makeCanvas(targetW, targetH);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    const scale = Math.max(targetW / srcW, targetH / srcH);
    const dw = srcW * scale;
    const dh = srcH * scale;
    ctx.drawImage(source, (targetW - dw) / 2, (targetH - dh) / 2, dw, dh);
    return canvas;
  }

  // 将 canvas 编码为指定质量的 JPEG Blob
  function toJpeg(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('ENCODE_FAIL'));
      }, 'image/jpeg', quality);
    });
  }

  // 在大小上限内寻找最高画质的 quality：先试探 0.9，不满足再在 [0.01, 0.9] 区间二分
  async function fitQuality(canvas, limitBytes) {
    const probe = await toJpeg(canvas, 0.9);
    if (probe.size <= limitBytes) return { blob: probe, quality: 0.9 };

    let lo = 0.01, hi = 0.9, best = null, bestQ = 0;
    for (let i = 0; i < 8; i++) {
      const q = (lo + hi) / 2;
      const blob = await toJpeg(canvas, q);
      if (blob.size <= limitBytes) {
        best = blob;
        bestQ = q;
        lo = q;
      } else {
        hi = q;
      }
    }
    // 二分后取下界再确认一次，保证结果不超限
    if (!best) {
      const blob = await toJpeg(canvas, lo);
      if (blob.size <= limitBytes) {
        best = blob;
        bestQ = lo;
      }
    }
    return best ? { blob: best, quality: bestQ } : null;
  }

  // 主入口：file 原始文件，spec {width, height}，limitKB 目标大小上限
  async function compress(file, spec, limitKB) {
    const limitBytes = Math.round(limitKB * 1024);
    const bitmap = await loadBitmap(file);
    const original = { width: bitmap.width, height: bitmap.height, size: file.size };

    const pre = prescale(bitmap, original.width, original.height, 4096);

    // 质量已压到下限仍超限时，逐轮缩小输出尺寸重试
    let scale = 1;
    for (let round = 0; round < 14; round++) {
      const targetW = Math.max(1, Math.round(spec.width * scale));
      const targetH = Math.max(1, Math.round(spec.height * scale));
      const canvas = drawCover(pre.source, pre.width, pre.height, targetW, targetH);
      const fit = await fitQuality(canvas, limitBytes);
      if (fit) {
        return {
          blob: fit.blob,
          quality: fit.quality,
          width: targetW,
          height: targetH,
          original,
        };
      }
      scale *= 0.9;
      if (Math.min(spec.width, spec.height) * scale < 80) break;
    }
    throw new Error('CANNOT_FIT');
  }

  return { compress };
})();
