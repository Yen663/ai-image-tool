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
    status.textContent = `目标：${cfg.kb}KB | ${cfg.format} | ${cfg.sizeLabel}`;

    const img = await loadImage(file);

    // ⭐ 裁剪 + 尺寸
    const { width, height } = getTargetSize(cfg.size, img.width, img.height);
    let canvas = cropAndResize(img, width, height);

    // ⭐ 压缩
    status.textContent = '压缩中...';
    const blob = await smartCompress(canvas, cfg);

    showResult(blob, cfg);
    status.textContent = `✅ 完成 ${(blob.size / 1024).toFixed(1)}KB`;

  } catch (e) {
    alert('错误：' + e.message);
  } finally {
    goBtn.disabled = false;
  }
};

//////////////////////////////////////////////////
// 指令解析
//////////////////////////////////////////////////
function parseAll(text) {
  text = text.toLowerCase();

  const kb = Math.max(10, parseInt(text.match(/(\d+)\s*kb/)?.[1] || 20));

  let format = 'jpg';
  if (/png/.test(text)) format = 'png';
  else if (/webp/.test(text)) format = 'webp';

  let size = 'original';
  let sizeLabel = '原图';

  if (/一寸/.test(text)) { size = '1'; sizeLabel = '一寸(295×413)'; }
  else if (/二寸/.test(text)) { size = '2'; sizeLabel = '二寸(413×579)'; }
  else {
    const m = text.match(/(\d+)[x×*](\d+)/);
    if (m) {
      size = { w: +m[1], h: +m[2] };
      sizeLabel = `${m[1]}×${m[2]}`;
    }
  }

  return {
    kb,
    format,
    size,
    sizeLabel,
    mime: format === 'png'
      ? 'image/png'
      : format === 'webp'
      ? 'image/webp'
      : 'image/jpeg'
  };
}

//////////////////////////////////////////////////
// 尺寸计算
//////////////////////////////////////////////////
function getTargetSize(size, ow, oh) {
  if (size === '1') return { width: 295, height: 413 };
  if (size === '2') return { width: 413, height: 579 };
  if (size.w) return { width: size.w, height: size.h };
  return { width: ow, height: oh };
}

//////////////////////////////////////////////////
// ⭐ 等比例裁剪（核心）
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
    // 横向裁剪
    sh = img.height;
    sw = sh * targetRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    // 纵向裁剪
    sw = img.width;
    sh = sw / targetRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
  return canvas;
}

//////////////////////////////////////////////////
// ⭐ 智能压缩（关键）
//////////////////////////////////////////////////
async function smartCompress(canvas, cfg) {
  const target = cfg.kb * 1024;

  let currentCanvas = canvas;

  for (let i = 0; i < 6; i++) {
    const blob = await binarySearchCompress(currentCanvas, cfg.mime, target);

    if (blob.size <= target) return blob;

    // ⭐ 压不下去 → 缩尺寸
    currentCanvas = scaleCanvas(currentCanvas, 0.85);
  }

  return await binarySearchCompress(currentCanvas, cfg.mime, target);
}

async function binarySearchCompress(canvas, mime, target) {
  let low = 0.1, high = 1, best = null;

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

  return best || await toBlob(canvas, mime, 0.1);
}

function scaleCanvas(canvas, ratio) {
  const c = document.createElement('canvas');
  c.width = canvas.width * ratio;
  c.height = canvas.height * ratio;
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

function toBlob(canvas, mime, q) {
  return new Promise(resolve => canvas.toBlob(resolve, mime, q));
}

//////////////////////////////////////////////////
// 图片加载
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
function showResult(blob, cfg) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `output.${cfg.format}`;
  a.textContent = `📥 下载 (${cfg.format.toUpperCase()})`;
  a.style.cssText = 'display:inline-block;padding:12px 20px;background:#05c46b;color:#fff;border-radius:8px;text-decoration:none;';
  result.appendChild(a);
}
