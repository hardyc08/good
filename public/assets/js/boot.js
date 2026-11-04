/* 盡早套用字級與顯示模式，避免畫面閃爍（在 <head> 同步載入） */
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('yd.settings.v1') || '{}');
    if (s.font && s.font !== 'normal') document.documentElement.setAttribute('data-font', s.font);
    if (s.theme === 'light' || s.theme === 'dark') document.documentElement.setAttribute('data-theme', s.theme);
  } catch (e) {
    /* 無法使用 localStorage 時維持預設 */
  }
})();
