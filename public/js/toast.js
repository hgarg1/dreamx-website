(function(){
  function getContainer(){
    let el=document.getElementById('fx-toast');
    if(!el){
      el=document.createElement('div');
      el.id='fx-toast';
      el.className='fx-toast';
      el.innerHTML='\n        <div class="fx-toast-icon" aria-hidden="true">✓</div>\n        <div class="fx-toast-message"></div>\n        <button class="fx-toast-close" aria-label="Close">×</button>\n      ';
      document.body.appendChild(el);
    }
    return el;
  }

  function sanitize(text){
    if(typeof text!=='string') return '';
    // Basic sanitize to avoid injecting HTML
    return text.replace(/[<>]/g,'');
  }

  function showToast(opts){
    const {type='success', message='', timeout=3500} = (opts||{});
    const container=getContainer();

    container.classList.remove('success','error');
    container.classList.add(type);

    const icon=container.querySelector('.fx-toast-icon');
    const msg=container.querySelector('.fx-toast-message');
    const closeBtn=container.querySelector('.fx-toast-close');

    if(type==='success') icon.textContent='✓';
    else if(type==='error') icon.textContent='!';
    else icon.textContent='•';

    msg.textContent=sanitize(String(message||''));

    // Show
    container.classList.add('show');

    // Close handling
    const hide=()=>{container.classList.remove('show');}
    closeBtn.onclick=hide;

    // Auto-hide
    if(timeout>0){
      setTimeout(hide, timeout);
    }
  }

  function maybeFromQuery(){
    try{
      const sp=new URLSearchParams(window.location.search||'');
      if(sp.has('success')){
        const m=sp.get('success');
        if(m) showToast({type:'success', message:m});
      } else if(sp.has('error')){
        const m=sp.get('error');
        if(m) showToast({type:'error', message:m});
      } else {
        return; // nothing in query
      }
      // Strip params so it won't reappear on refresh
      const url=new URL(window.location.href);
      url.searchParams.delete('success');
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url.toString());
    }catch(e){/* noop */}
  }

  function maybeFromPageFlash(){
    try{
      const pf = (window.pageFlash||{});
      if(pf.success){ showToast({type:'success', message:String(pf.success)}); return true; }
      if(pf.error){ showToast({type:'error', message:String(pf.error)}); return true; }
    }catch(e){/* noop */}
    return false;
  }

  // Expose globally
  window.showToast = showToast;

  document.addEventListener('DOMContentLoaded', function(){
    if(!maybeFromPageFlash()){
      maybeFromQuery();
    }
  });
})();
