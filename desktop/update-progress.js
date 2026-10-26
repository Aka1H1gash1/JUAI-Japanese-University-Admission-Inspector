const progress = document.querySelector('#progress');
const percent = document.querySelector('#percent');
const bytes = document.querySelector('#bytes');
window.juaiUpdate.onProgress((state) => {
  progress.value = state.percent;
  percent.textContent = `${state.percent}%`;
  bytes.textContent = `${(state.received / 1024 ** 2).toFixed(1)} / ${(state.total / 1024 ** 2).toFixed(1)} MB`;
  if (state.percent === 100)
    document.querySelector('#title').textContent = '正在校验安装包';
});
document
  .querySelector('#cancel')
  .addEventListener('click', () => window.juaiUpdate.cancel());
