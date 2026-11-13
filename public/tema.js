/* Tema claro/escuro. Carregado no <head> (sem defer) para evitar o "flash" de tema errado.
   Arquivo externo: compatível com a CSP script-src 'self'. */
(function () {
  var d = document.documentElement, K = 'fw_tema', t = null;
  d.classList.add('js');
  try { t = localStorage.getItem(K) } catch (e) { }
  if (t !== 'dark' && t !== 'light') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  d.setAttribute('data-theme', t);

  function rotulo() {
    var b = document.querySelector('[data-action="theme"]');
    if (b) { b.textContent = d.getAttribute('data-theme') === 'dark' ? 'Modo claro' : 'Modo escuro'; b.setAttribute('aria-pressed', String(d.getAttribute('data-theme') === 'dark')) }
  }
  document.addEventListener('DOMContentLoaded', rotulo);
  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-action="theme"]')) return;
    var novo = d.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    function aplicar() { d.setAttribute('data-theme', novo); try { localStorage.setItem(K, novo) } catch (x) { } rotulo() }
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(aplicar);
    else aplicar();
  });
})();
