// UI 交互与状态流转
(() => {
  const state = {
    file: null,
    previewUrl: null,
    resultUrl: null,
    spec: PHOTO_SPECS[1],   // 默认一寸
    limitKB: 64,            // 默认 64KB
  };

  const $ = (sel) => document.querySelector(sel);

  // ---------- toast ----------
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  // ---------- 上传 ----------
  const dropzone = $('#dropzone');
  const fileInput = $('#file-input');
  const uploadMeta = $('#upload-meta');

  function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('请选择图片文件（JPG / PNG / WebP / BMP）');
      return;
    }
    if (file.type === 'image/gif') toast('动图将取第一帧并转为静态图片');
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);

    state.file = file;
    state.previewUrl = URL.createObjectURL(file);
    $('#upload-preview').src = state.previewUrl;
    uploadMeta.textContent = file.name + ' · ' + formatSize(file.size);
    uploadMeta.hidden = false;
    dropzone.classList.add('has-image');
    $('#result-section').hidden = true;
  }

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

  ['dragover', 'dragenter'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    })
  );
  dropzone.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));

  document.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) handleFile(item.getAsFile());
  });

  // ---------- 参数选择 ----------
  const specGroup = $('#spec-group');
  const sizeGroup = $('#size-group');
  const customSpecBox = $('#custom-spec-box');
  const customSizeBox = $('#custom-size-box');
  const customSpecBtn = document.createElement('button');
  const customSizeBtn = document.createElement('button');

  function makeOptionBtn(name, desc) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-btn';
    const nameEl = document.createElement('span');
    nameEl.className = 'opt-name';
    nameEl.textContent = name;
    const descEl = document.createElement('span');
    descEl.className = 'opt-desc';
    descEl.textContent = desc;
    btn.append(nameEl, descEl);
    return btn;
  }

  function buildSpecButtons() {
    PHOTO_SPECS.forEach((spec) => {
      const btn = makeOptionBtn(spec.label, `${spec.width}×${spec.height}`);
      if (spec.id === state.spec.id) btn.classList.add('active');
      btn.addEventListener('click', () => {
        state.spec = spec;
        specGroup.querySelectorAll('.option-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        customSpecBox.hidden = true;
      });
      specGroup.appendChild(btn);
    });

    customSpecBtn.textContent = '自定义';
    makeOptionDesc(customSpecBtn, '输入宽高');
    customSpecBtn.addEventListener('click', () => {
      specGroup.querySelectorAll('.option-btn').forEach((b) => b.classList.remove('active'));
      customSpecBtn.classList.add('active');
      customSpecBox.hidden = false;
      $('#custom-w').focus();
    });
    specGroup.appendChild(customSpecBtn);
  }

  function buildSizeButtons() {
    SIZE_PRESETS.forEach((kb) => {
      const btn = makeOptionBtn(kb >= 1024 ? (kb / 1024) + 'M' : kb + 'K', `≤ ${kb} KB`);
      if (kb === state.limitKB) btn.classList.add('active');
      btn.addEventListener('click', () => {
        state.limitKB = kb;
        sizeGroup.querySelectorAll('.option-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        customSizeBox.hidden = true;
      });
      sizeGroup.appendChild(btn);
    });

    customSizeBtn.textContent = '自定义';
    makeOptionDesc(customSizeBtn, '输入 KB');
    customSizeBtn.addEventListener('click', () => {
      sizeGroup.querySelectorAll('.option-btn').forEach((b) => b.classList.remove('active'));
      customSizeBtn.classList.add('active');
      customSizeBox.hidden = false;
      $('#custom-kb').focus();
    });
    sizeGroup.appendChild(customSizeBtn);
  }

  function makeOptionDesc(btn, text) {
    const descEl = document.createElement('span');
    descEl.className = 'opt-desc';
    descEl.textContent = text;
    btn.appendChild(descEl);
  }

  // 当前生效的尺寸规格，自定义输入非法时返回 null
  function currentSpec() {
    if (customSpecBtn.classList.contains('active')) {
      const w = parseInt($('#custom-w').value, 10);
      const h = parseInt($('#custom-h').value, 10);
      if (!w || !h || w < 16 || h < 16 || w > 10000 || h > 10000) return null;
      return { id: 'custom', label: `${w}×${h}`, width: w, height: h };
    }
    return state.spec;
  }

  // 当前生效的目标大小（KB），自定义输入非法时返回 null
  function currentLimit() {
    if (customSizeBtn.classList.contains('active')) {
      const kb = parseFloat($('#custom-kb').value);
      if (!kb || kb < 5 || kb > 10240) return null;
      return kb;
    }
    return state.limitKB;
  }

  // ---------- 压缩与结果 ----------
  const compressBtn = $('#compress-btn');

  compressBtn.addEventListener('click', async () => {
    if (!state.file) {
      toast('请先上传图片');
      return;
    }
    const spec = currentSpec();
    if (!spec) {
      toast('请输入有效的自定义尺寸（16 ~ 10000 px）');
      return;
    }
    const limitKB = currentLimit();
    if (!limitKB) {
      toast('请输入有效的目标大小（5 ~ 10240 KB）');
      return;
    }

    compressBtn.disabled = true;
    compressBtn.textContent = '压缩中…';
    try {
      const result = await Compress.compress(state.file, spec, limitKB);
      showResult(result, spec, limitKB);
    } catch (err) {
      if (err.message === 'CANNOT_FIT') toast('目标大小过小，已无法压入，请调大限制');
      else if (err.message === 'IMAGE_DECODE_FAIL') toast('图片解码失败，请更换文件');
      else toast('压缩失败，请重试');
    } finally {
      compressBtn.disabled = false;
      compressBtn.textContent = '开始压缩';
    }
  });

  function showResult(result, spec, limitKB) {
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = URL.createObjectURL(result.blob);

    $('#orig-img').src = state.previewUrl;
    $('#result-img').src = state.resultUrl;
    $('#orig-dims').textContent = `${result.original.width} × ${result.original.height} px`;
    $('#orig-size').textContent = formatSize(result.original.size);
    $('#result-dims').textContent = `${result.width} × ${result.height} px`;
    $('#result-size').textContent = formatSize(result.blob.size);
    $('#result-quality').textContent = '质量 ' + Math.round(result.quality * 100) + '%';

    const diff = Math.round((1 - result.blob.size / result.original.size) * 100);
    $('#ratio-badge').textContent = diff >= 0 ? `体积 −${diff}%` : `体积 +${-diff}%`;

    const download = $('#download-btn');
    download.href = state.resultUrl;
    download.download = `photo_${spec.label}_${limitKB}KB.jpg`;

    $('#result-section').hidden = false;
    $('#result-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------- 初始化 ----------
  buildSpecButtons();
  buildSizeButtons();
})();
