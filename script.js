const fileInput = document.getElementById('file');
const promptEl = document.getElementById('prompt');
const goBtn = document.getElementById('go');
const status = document.getElementById('status');
const result = document.getElementById('result');

goBtn.onclick = async () => {
  const file = fileInput.files[0];
  if (!file) return alert('请上传图片');

  const prompt = promptEl.value.trim();
  if (!prompt) return alert('请输入指令');

  goBtn.disabled = true;
  result.innerHTML = '';

  try {
    const cfg = parseAll(prompt);

    // ⭐ 原始格式
    const originalMime = file.type || 'image/jpeg';

    status.textContent = `目标：${cfg.kb}KB | ${cfg.format || '原格式'} | ${cfg.sizeLabel}`;

    const img = await loadImage(file);

    const { width, height } = getTargetSize(cfg.size, img.width, img.height);
    let canvas = cropAndResize(img, width, height);

    status.textContent = '极限压缩中...';
    const blob = await extremeCompress(canvas, cfg, originalMime);

    showResult(blob, cfg, originalMime);
    status.textContent = `✅ 完成 ${(blob.size / 1024).toFixed(1)}KB`;

  } catch (e) {
    alert('错误：' + e.message);
  } finally {
    goBtn.disabled = false;
  }
};

//////////////////////////////////////////////////
// 指令解析（严格按用户指令）
//////////////////////////////////////////////////
function parseAll(text) {
  text = text.toLowerCase();

  const kb = Math.max(10, parseInt(text.match(/(\d+)\s*kb/)?.[1] || 20));

  // ⭐ 只有用户写了才生效
  let format = null;
  if (/png/.test(text)) format = 'png';
  else if (/webp/.test(text)) format = 'webp';
  else if (/jpg|jpeg/.test(text)) format = 'jpg';

  let size = 'original';
  let sizeLabel = '原图';

  if (/一寸/.test(text)) {
    size = '1';
    sizeLabel = '一寸(295×413)';
  } else if (/小二寸/.test(text)) {
    size = 'small2';
    sizeLabel = '小二寸(330×480)';
  } else if (/二寸/.test(text)) {
    size = '2';
    sizeLabel = '二寸(413×579)';
  } else {
    const m = text.match(/(\d+)\s*(px|xp|像素)?\s*[x×*乘]\s*(\d+)\s*(px|xp|像素)?/);
    if (m) {
      size = { w: +m[1], h: +m[3] };
      sizeLabel = `${m[1]}×${m[3]}`;
    }
  }

  return {
    kb,
    format,
    size,
    sizeLabel
  };
}

//////////////////////////////////////////////////
// 尺寸计算
//////////////////////////////////////////////////
function getTargetSize(size, ow, oh) {
  if (size === '1') return { width: 295, height: 413 };
  if (size === '2') return { width: 413, height: 579 };
  if (size === 'small2') return { width: 330, height: 480 };
  if (size.w) return { width: size.w, height: size.h };
  return { width: ow, height: oh };
}

//////////////////////////////////////////////////
// 等比例裁剪
//////////////////////////////////////////////////
function cropAndResize(img, targetW, targetH) {
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');

  const imgRatio = img.width / img.height;
  const targetRatio = targetW / targetH;

  let sx, sy, sw, sh;

  if (imgRatio > targetRatio) {
    sh = img.height;
    sw = sh * targetRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / targetRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);

  return canvas;
}

//////////////////////////////////////////////////
// ⭐ 极限压缩（严格按格式）
//////////////////////////////////////////////////
async function extremeCompress(canvas, cfg, originalMime) {
  const target = cfg.kb * 1024;

  const mime = cfg.format
    ? (cfg.format === 'png'
        ? 'image/png'
        : cfg.format === 'webp'
        ? 'image/webp'
        : 'image/jpeg')
    : originalMime;

  let blob = await binarySearchCompress(canvas, mime, target);

  // ⭐ 根据比例直接缩放
  let ratio = Math.sqrt(target / blob.size);

  if (ratio < 0.95) {
    canvas = scaleCanvas(canvas, ratio);
    blob = await binarySearchCompress(canvas, mime, target);
  }

  // ⭐ 兜底
  for (let i = 0; i < 6; i++) {
    if (blob.size <= target) return blob;

    canvas = scaleCanvas(canvas, 0.7);
    blob = await binarySearchCompress(canvas, mime, target);
  }

  return blob;
}

//////////////////////////////////////////////////
// 二分压缩
//////////////////////////////////////////////////
async function binarySearchCompress(canvas, mime, target) {
  let low = 0.05, high = 1, best = null;

  for (let i = 0; i < 12; i++) {
    const q = (low + high) / 2;
    const blob = await toBlob(canvas, mime, q);

    if (blob.size <= target) {
      best = blob;
      low = q;
    } else {
      high = q;
    }
  }

  return best || await toBlob(canvas, mime, 0.05);
}

//////////////////////////////////////////////////
// 缩放
//////////////////////////////////////////////////
function scaleCanvas(canvas, ratio) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(canvas.width * ratio));
  c.height = Math.max(1, Math.floor(canvas.height * ratio));

  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, c.width, c.height);

  return c;
}

function toBlob(canvas, mime, q) {
  return new Promise(resolve => canvas.toBlob(resolve, mime, q));
}

//////////////////////////////////////////////////
// 加载图片
//////////////////////////////////////////////////
function loadImage(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

//////////////////////////////////////////////////
// 下载
//////////////////////////////////////////////////
function showResult(blob, cfg, originalMime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);

  const ext = cfg.format || originalMime.split('/')[1];
  a.download = `output.${ext}`;

  a.textContent = `📥 下载 (${ext.toUpperCase()})`;
  a.style.cssText =
    'display:inline-block;padding:12px 20px;background:#05c46b;color:#fff;border-radius:8px;text-decoration:none;';

  result.appendChild(a);
}
