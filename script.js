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
    status.textContent = `解析：${cfg.kb}KB | ${cfg.format} | ${cfg.bgMode} | ${cfg.sizeLabel}`;

    let img = await loadImageAuto(file);
    
    const { width, height } = getTargetSize(cfg.size, img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(img, 0, 0, width, height);

    if (cfg.bgMode !== 'original') {
      status.textContent = '更换背景...';
      changeBackground(canvas, ctx, cfg.bgMode);
    }

    status.textContent = '压缩并转换格式...';
    const blob = await compressAndFormat(canvas, cfg);

    showResult(blob, cfg);
    status.textContent = `✅ 完成：${(blob.size / 1024).toFixed(1)}KB`;
  } catch (e) {
    alert('错误：' + e.message);
  } finally {
    goBtn.disabled = false;
    goBtn.textContent = '🚀 AI一键处理';
  }
};

// ==============================
// 指令解析：KB + 格式 + 背景 + 尺寸
// ==============================
function parseAll(text) {
  text = text.toLowerCase().replace(/，/g, ',');

  const kb = parseInt(text.match(/(\d+)\s*kb/)?.[1] || 20);
  let format = 'jpg';
  if (/png/.test(text)) format = 'png';
  else if (/webp/.test(text)) format = 'webp';

  let bgMode = 'original';
  if (/红底/.test(text)) bgMode = 'red';
  else if (/蓝底/.test(text)) bgMode = 'blue';
  else if (/白底/.test(text)) bgMode = 'white';
  else if (/渐变蓝/.test(text)) bgMode = 'gblue';
  else if (/渐变红/.test(text)) bgMode = 'gred';
  else if (/渐变灰/.test(text)) bgMode = 'ggray';

  let size = 'original';
  let sizeLabel = '原图尺寸';
  if (/一寸/.test(text)) { size = '1寸'; sizeLabel = '一寸(295×413)'; }
  else if (/二寸/.test(text)) { size = '2寸'; sizeLabel = '二寸(413×579)'; }
  else if (/小二寸/.test(text)) { size = '小二寸'; sizeLabel = '小二寸(330×480)'; }
  else {
    const pxMatch = text.match(/(\d+)\s*[*×x]\s*(\d+)/);
    if (pxMatch) {
      const w = parseInt(pxMatch[1]), h = parseInt(pxMatch[2]);
      size = { w, h };
      sizeLabel = `${w}×${h}`;
    }
  }

  return {
    kb: Math.max(10, kb),
    format,
    bgMode,
    size,
    sizeLabel,
    mime: format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg'
  };
}

// ==============================
// 尺寸标准
// ==============================
function getTargetSize(size, origW, origH) {
  if (size === '1寸') return { width: 295, height: 413 };
  if (size === '2寸') return { width: 413, height: 579 };
  if (size === '小二寸') return { width: 330, height: 480 };
  if (size.w && size.h) return { width: size.w, height: size.h };
  return { width: origW, height: origH };
}

// ==============================
// 背景替换
// ==============================
function changeBackground(canvas, ctx, mode) {
  const w = canvas.width, h = canvas.height;
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2];
    const avg = (r + g + b) / 3;
    if (avg > 240) d[i+3] = 0;
  }
  ctx.putImageData(id, 0, 0);

  const tc = document.createElement('canvas');
  tc.width = w; tc.height = h;
  const t = tc.getContext('2d');

  if (mode === 'white') { t.fillStyle = '#fff'; t.fillRect(0,0,w,h); }
  if (mode === 'blue') { t.fillStyle = '#00509e'; t.fillRect(0,0,w,h); }
  if (mode === 'red') { t.fillStyle = '#d00000'; t.fillRect(0,0,w,h); }

  if (mode === 'gblue') {
    const g = t.createLinearGradient(0,0,0,h);
    g.addColorStop(0, '#cfeafc'); g.addColorStop(1, '#0066cc');
    t.fillStyle = g; t.fillRect(0,0,w,h);
  }
  if (mode === 'gred') {
    const g = t.createLinearGradient(0,0,0,h);
    g.addColorStop(0, '#ffe0e0'); g.addColorStop(1, '#cc0000');
    t.fillStyle = g; t.fillRect(0,0,w,h);
  }
  if (mode === 'ggray') {
    const g = t.createLinearGradient(0,0,0,h);
    g.addColorStop(0, '#f5f5f5'); g.addColorStop(1, '#999');
    t.fillStyle = g; t.fillRect(0,0,w,h);
  }

  t.drawImage(canvas, 0,0);
  ctx.clearRect(0,0,w,h);
  ctx.drawImage(tc, 0,0);
}

// ==============================
// 压缩 + 格式
// ==============================
async function compressAndFormat(canvas, cfg) {
  const target = cfg.kb * 1024;
  let low = 0.2, high = 1, best = null;
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    const blob = await toBlob(canvas, cfg.mime, mid);
    if (blob.size <= target * 1.1) { best = blob; low = mid; }
    else high = mid;
  }
  if (!best) best = await toBlob(canvas, cfg.mime, 0.1);
  return best;
}

function toBlob(canvas, mime, qual) {
  return new Promise(r => canvas.toBlob(r, mime, qual));
}

// ==============================
// HEIC 支持
// ==============================
function loadImageAuto(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    if (file.type.includes('heic') || file.name.toLowerCase().endsWith('.heic')) {
      const r = new FileReader();
      r.onload = e => img.src = e.target.result;
      r.readAsDataURL(file);
    } else img.src = URL.createObjectURL(file);
  });
}

// ==============================
// 下载
// ==============================
function showResult(blob, cfg) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `processed.${cfg.format}`;
  a.textContent = `📥 下载 ${cfg.format.toUpperCase()}`;
  a.style.cssText = 'display:inline-block; padding:14px 26px; background:#05c46b; color:#fff; border-radius:12px; font-weight:600; text-decoration:none';
  result.appendChild(a);
}
