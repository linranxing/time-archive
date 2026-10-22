/**
 * 前台画廊 / 详情页公共脚本（子任务 B / C）
 * 只做两件事：
 *   1) 图片加载失败统一兜底 —— 加载失败不留破图，切到站内占位（课程硬性要求）
 *   2) 搜索框：空白关键词不发起请求，避免产生无意义的历史记录 / 空查询
 * 不做任何数据拉取：页面数据全部由服务端渲染，前端不再二次请求接口
 */
(function () {
  'use strict';

  // 1) 图片错误兜底（捕获阶段监听，img 的 error 不冒泡）
  document.addEventListener(
    'error',
    function (e) {
      var img = e.target;
      if (!img || img.tagName !== 'IMG') return;

      if (img.hasAttribute('data-cover')) {
        img.style.display = 'none';
        var box = img.closest('.thumb, .mainimg, .ph');
        if (!box) return;
        var fb = box.querySelector('[data-fallback]');
        if (fb) {
          fb.hidden = false;
        } else {
          box.classList.add('is-broken');
        }
        box.setAttribute('data-broken', '1');
      }
    },
    true
  );

  // 2) 搜索框：空白不提交；有历史记录时同步一次（避免回显丢词）
  var form = document.querySelector('form[role="search"]');
  if (form) {
    var input = form.querySelector('input[name="q"]');
    form.addEventListener('submit', function (e) {
      if (input && input.value.trim() === '') {
        e.preventDefault();
        window.location.href = '/works';
        return;
      }
      if (input) input.value = input.value.trim();
    });
  }

  // 3) 详情页灯箱：只放大中图，Esc / 点击空白 / 关闭按钮退出
  var zoomBtn = document.querySelector('[data-zoom]');
  var zoomBox = document.getElementById('zoomBox');
  if (zoomBtn && zoomBox) {
    var openZoom = function () {
      zoomBox.hidden = false;
      document.body.style.overflow = 'hidden';
    };
    var closeZoom = function () {
      zoomBox.hidden = true;
      document.body.style.overflow = '';
    };
    zoomBtn.addEventListener('click', openZoom);
    zoomBox.addEventListener('click', function (e) {
      if (e.target === zoomBox || e.target.closest('[data-zoom-close]')) closeZoom();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !zoomBox.hidden) closeZoom();
    });
  }
})();
