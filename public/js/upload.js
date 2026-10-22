/* 管理员新增作品 · 前端交互
   约束：只做「上传表单」这一件事，不含列表 / 详情 / 评论等任何其它业务 */
(function () {
  var MAX_MB = 2;
  var MAX_EDGE = 1600;
  var OK_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];

  var form = document.getElementById('uploadForm');
  var fileInput = document.getElementById('coverImage');
  var dropZone = document.getElementById('dropZone');
  var dropInner = document.getElementById('dropInner');
  var previewBox = document.getElementById('previewBox');
  var previewImg = document.getElementById('previewImg');
  var previewFallback = document.getElementById('previewFallback');
  var errorBox = document.getElementById('errorBox');
  var submitHint = document.getElementById('submitHint');
  var resetBtn = document.getElementById('resetBtn');
  var buttons = Array.prototype.slice.call(form.querySelectorAll('button[type="submit"]'));

  var pickedFile = null;
  var objectUrl = null;
  var submitting = false;

  /* ---------- 提示区 ---------- */
  function clearErrors() {
    errorBox.innerHTML = '';
  }

  function row(code, title, detail, tone) {
    var wrap = document.createElement('div');
    wrap.className = 'errrow';

    var ec = document.createElement('span');
    ec.className = 'ec' + (tone === 'gold' ? ' gold' : '');
    ec.textContent = code;

    var p = document.createElement('p');
    p.textContent = title;
    if (detail) {
      var span = document.createElement('span');
      span.textContent = detail;
      p.appendChild(span);
    }

    wrap.appendChild(ec);
    wrap.appendChild(p);
    return wrap;
  }

  function showErrors(list) {
    clearErrors();
    if (!list.length) {
      errorBox.appendChild(row('200', '校验通过', '必填项与图片校验均已满足，可以直接提交。', 'gold'));
      return;
    }
    list.forEach(function (e) {
      errorBox.appendChild(row(String(e.code), e.message, e.detail || ''));
    });
  }

  /* ---------- 客户端校验（与服务端错误码保持一致） ---------- */
  function checkFile(file) {
    if (!file) return { code: 40001, message: '请上传作品封面图片', detail: 'coverImage 为必填项' };
    if (file.size > MAX_MB * 1024 * 1024) {
      return { code: 41301, message: '图片超过 ' + MAX_MB + ' MB，请压缩后重试', detail: '当前 ' + (file.size / 1024 / 1024).toFixed(2) + ' MB' };
    }
    var typeOk = OK_TYPES.indexOf(file.type) >= 0 || /\.(jpe?g|png|svg|webp)$/i.test(file.name);
    if (!typeOk) {
      return { code: 41501, message: '仅支持 JPG / PNG / SVG / WebP', detail: '已拒绝 ' + file.name };
    }
    return null;
  }

  function checkFields() {
    var errs = [];
    var title = document.getElementById('title').value.trim();
    var categoryId = document.getElementById('categoryId').value;
    var authorId = document.getElementById('authorId').value;

    mark('title', !title);
    mark('categoryId', !categoryId);
    mark('authorId', !authorId);

    if (!title) errs.push({ code: 40001, message: '作品名称不能为空', detail: 'title 为必填项' });
    if (!categoryId) errs.push({ code: 40001, message: '请选择作品分类', detail: 'categoryId 为必填项' });
    if (!authorId) errs.push({ code: 40001, message: '请选择创作者', detail: 'authorId 为必填项' });
    if (title.length > 60) errs.push({ code: 40002, message: '作品名称不得超过 60 字', detail: '当前 ' + title.length + ' 字' });

    var fileErr = checkFile(pickedFile);
    if (fileErr) errs.push(fileErr);

    return errs;
  }

  function mark(id, bad) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('invalid', !!bad);
  }

  /* ---------- 图片选择与预览 ---------- */
  function setPreview(file) {
    var previous = objectUrl;
    if (!file) {
      if (previous) { URL.revokeObjectURL(previous); objectUrl = null; }
      previewBox.hidden = true;
      dropInner.hidden = false;
      document.getElementById('cardImg').hidden = true;
      document.getElementById('cardFallback').hidden = false;
      return;
    }
    objectUrl = URL.createObjectURL(file);
    previewImg.hidden = false;
    previewFallback.hidden = true;
    previewImg.src = objectUrl;
    previewBox.hidden = false;
    dropInner.hidden = true;

    var cardImg = document.getElementById('cardImg');
    cardImg.hidden = false;
    cardImg.src = objectUrl;
    document.getElementById('cardFallback').hidden = true;

    // 延迟释放上一张，避免旧图的 error 事件把新图的占位顶出来
    if (previous) setTimeout(function () { URL.revokeObjectURL(previous); }, 1500);
  }

  // 图片加载失败占位（课程硬性要求：图片组件必须含失败占位交互）
  // 只处理「当前这张图」的错误，避免切换文件时的竞态误报
  previewImg.addEventListener('error', function () {
    if (this.src !== objectUrl) return;
    previewImg.hidden = true;
    previewFallback.hidden = false;
  });
  document.getElementById('cardImg').addEventListener('error', function () {
    if (this.src !== objectUrl) return;
    this.hidden = true;
    document.getElementById('cardFallback').hidden = false;
  });
  document.getElementById('previewRetry').addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    fileInput.click();
  });

  function acceptFile(file) {
    if (!file || file === pickedFile) return; // 同一个文件重复触发 change 时不重复处理
    var err = checkFile(file);
    if (err) {
      showErrors([err]);
      return;
    }
    pickedFile = file;
    setPreview(file);
    var info = document.querySelector('.ua-hint');
    if (info) {
      info.textContent = file.name + ' · ' + (file.size / 1024).toFixed(0) + ' KB · 已准备上传';
    }
    clearErrors();
  }

  dropZone.addEventListener('click', function () { fileInput.click(); });
  dropZone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) acceptFile(fileInput.files[0]);
  });
  ['dragenter', 'dragover'].forEach(function (t) {
    dropZone.addEventListener(t, function (e) { e.preventDefault(); dropZone.classList.add('over'); });
  });
  ['dragleave', 'dragend'].forEach(function (t) {
    dropZone.addEventListener(t, function () { dropZone.classList.remove('over'); });
  });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('over');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) acceptFile(f);
  });

  /* ---------- 实时预览与字数 ---------- */
  function syncCard() {
    var title = document.getElementById('title').value.trim();
    var catSel = document.getElementById('categoryId');
    var autSel = document.getElementById('authorId');
    var date = document.getElementById('createdAt').value;

    document.getElementById('cardTitle').textContent = title || '作品名称';
    document.getElementById('cardCat').textContent =
      catSel.value ? catSel.options[catSel.selectedIndex].text.replace(/^ARCHIVE-\d{3}\s·\s/, '') : '未分类';
    var author = autSel.value ? autSel.options[autSel.selectedIndex].text : '创作者';
    document.getElementById('cardMeta').textContent = author + ' · ' + (catSel.value ? '已选分类' : '分类待选');
    document.getElementById('cardYear').textContent = date ? String(date).slice(0, 4) : '年份';
  }

  ['title', 'categoryId', 'authorId', 'createdAt'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', syncCard);
    document.getElementById(id).addEventListener('change', syncCard);
  });

  Array.prototype.forEach.call(document.querySelectorAll('.ua-count'), function (el) {
    var input = document.getElementById(el.dataset.for);
    var max = input.getAttribute('maxlength');
    var upd = function () { el.textContent = input.value.length + ' / ' + max; };
    input.addEventListener('input', upd);
    upd();
  });

  /* ---------- 提交 ---------- */
  function lock(on) {
    submitting = on;
    buttons.forEach(function (b) { b.disabled = on; });
    if (on) submitHint.textContent = '正在提交，请勿重复点击…';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (submitting) return;

    var errs = checkFields();
    if (errs.length) { showErrors(errs); return; }

    var status = (e.submitter && e.submitter.dataset.status) || 'draft';
    var fd = new FormData();
    fd.append('coverImage', pickedFile);
    fd.append('title', document.getElementById('title').value.trim());
    fd.append('categoryId', document.getElementById('categoryId').value);
    fd.append('authorId', document.getElementById('authorId').value);
    fd.append('createdAt', document.getElementById('createdAt').value);
    fd.append('materials', document.getElementById('materials').value.trim());
    fd.append('concept', document.getElementById('concept').value.trim());
    fd.append('description', document.getElementById('description').value.trim());
    fd.append('status', status);

    lock(true);

    fetch('/api/admin/works', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (body) { return { status: res.status, body: body }; });
      })
      .then(function (r) {
        if (r.body && r.body.ok) {
          clearErrors();
          var w = r.body.data;
          errorBox.appendChild(row('200', '作品已保存为' + (w.status === 'published' ? '「已发布」' : '「草稿」'),
            '档案编号 ' + w.id + ' · 分类 ' + w.categoryName, 'gold'));
          paintTiers(w);
        } else {
          var err = (r.body && r.body.error) || { code: 50002, message: '提交失败' };
          showErrors([{ code: err.code, message: err.message, detail: 'HTTP ' + r.status }]);
          if (r.status === 401) setTimeout(function () { location.href = '/admin/login?next=/admin/upload'; }, 1200);
        }
      })
      .catch(function () {
        showErrors([{ code: 50002, message: '网络异常，提交未完成', detail: '请检查服务是否在运行' }]);
      })
      .then(function () {
        lock(false);
        submitHint.textContent = '发布后立即出现在前台展厅；草稿仅后台可见。';
      });
  });

  /* 提交成功后把三档地址回填到派生小卡，加载失败同样走占位 */
  function paintTiers(w) {
    var map = { original: w.coverImage, medium: w.coverMedium, thumb: w.coverThumb };
    Array.prototype.forEach.call(document.querySelectorAll('[data-tier]'), function (img) {
      var url = map[img.dataset.tier];
      img.hidden = false;
      img.onerror = function () {
        img.hidden = true;
        var ph = img.parentNode;
        if (!ph.querySelector('.fallback')) {
          var fb = document.createElement('div');
          fb.className = 'fallback';
          fb.innerHTML = '<span class="txt">加载失败</span>';
          ph.appendChild(fb);
        }
      };
      img.src = url;
    });
  }

  /* ---------- 重置 ---------- */
  resetBtn.addEventListener('click', function () {
    form.reset();
    pickedFile = null;
    setPreview(null);
    clearErrors();
    document.querySelectorAll('[data-tier]').forEach(function (img) {
      img.removeAttribute('src');
      img.hidden = true;
      var fb = img.parentNode.querySelector('.fallback');
      if (fb) fb.remove();
    });
    showErrors([]);
    clearErrors();
    errorBox.appendChild(row('就绪', '尚未提交', '提交后在此显示返回的业务错误码', 'gold'));
    document.querySelector('.ua-hint').textContent =
      '支持 JPG / PNG / SVG / WebP · 单文件 ≤ ' + MAX_MB + ' MB · 长边 ≤ ' + MAX_EDGE + ' px';
    syncCard();
  });

  syncCard();
})();
