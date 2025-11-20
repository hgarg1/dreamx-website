(function(){
  if (window.__dxCursorInit) return; window.__dxCursorInit = true;
  function enable(){
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return; // skip touch
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      function start(){
        document.documentElement.classList.add('dx-cursor-enabled');
        const c = document.createElement('div');
        c.id = 'dx-cursor';
        const r = document.createElement('div');
        r.id = 'dx-cursor-ring';
        (document.body || document.documentElement).appendChild(r);
        (document.body || document.documentElement).appendChild(c);

        let x = -100, y = -100;
        let vx = x, vy = y; // inner
        let rx = x, ry = y; // ring follower
        const speed = 0.18;
        const ringSpeed = 0.12;
        let raf = null;

        function loop(){
          vx += (x - vx) * speed;
          vy += (y - vy) * speed;
          rx += (x - rx) * ringSpeed;
          ry += (y - ry) * ringSpeed;
          c.style.transform = `translate3d(${vx}px, ${vy}px, 0)`;
          r.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
          raf = requestAnimationFrame(loop);
        }
        raf = requestAnimationFrame(loop);

        function move(e){ x = e.clientX; y = e.clientY; }
        function down(){ c.classList.add('dx-click'); r.classList.add('dx-click'); }
        function up(){ c.classList.remove('dx-click'); r.classList.remove('dx-click'); }
        function enter(){ c.classList.remove('dx-hidden'); r.classList.remove('dx-hidden'); }
        function leave(){ c.classList.add('dx-hidden'); r.classList.add('dx-hidden'); }
        function onHoverEl(e){
          const t = e.target;
          if (!t || typeof t.closest !== 'function') {
            c.classList.remove('dx-link');
            r.classList.remove('dx-link');
            return;
          }
          const isLink = t.closest('a, button, .btn, [role="button"], .clickable');
          c.classList.toggle('dx-link', !!isLink);
          r.classList.toggle('dx-link', !!isLink);
        }

        window.addEventListener('mousemove', move, { passive: true });
        window.addEventListener('mousedown', down, { passive: true });
        window.addEventListener('mouseup', up, { passive: true });
        window.addEventListener('mouseenter', enter, { passive: true });
        window.addEventListener('mouseleave', leave, { passive: true });
        document.addEventListener('mouseover', onHoverEl, { passive: true });

        // Keep native cursor for inputs/contenteditable
        const restoreSel = 'input, textarea, select, [contenteditable="true"]';
        document.addEventListener('pointerenter', (e) => {
          if (e.target && typeof e.target.closest === 'function' && e.target.closest(restoreSel)) {
            document.documentElement.classList.remove('dx-cursor-enabled');
          }
        }, true);
        document.addEventListener('pointerleave', (e) => {
          if (e.target && typeof e.target.closest === 'function' && e.target.closest(restoreSel)) {
            document.documentElement.classList.add('dx-cursor-enabled');
          }
        }, true);

        // Clean up on SPA navs if used
        window.addEventListener('beforeunload', () => {
          cancelAnimationFrame(raf);
          c.remove();
          r.remove();
        });
      }

      if (document.body) start(); else window.addEventListener('DOMContentLoaded', start);
    } catch(err){
      console.error('Custom cursor init failed:', err);
    }
  }

  window.enableCustomCursor = enable;
})();
