const portalLink=document.createElement('a');portalLink.href='/portal';portalLink.textContent='Client portal ↗';portalLink.style.cssText='position:fixed;bottom:24px;left:24px;z-index:9999;background:#265d58;color:white;border:1px solid #d3b66c;border-radius:30px;padding:13px 24px;font:600 15px Outfit,sans-serif;box-shadow:0 4px 20px #0002';document.body.append(portalLink);

// Keep legacy network-backed widgets visibly marked as unavailable in this local clone.
function markLegacy(){
 document.querySelectorAll('form').forEach(form=>{if(form.dataset.localNotice)return;form.dataset.localNotice='1';const note=document.createElement('p');note.textContent='Local website preview: online inquiries are not connected. Please contact info@jinscpa.com.';note.style.cssText='font-size:13px;padding:12px;background:#fff6df;color:#594b27;border-radius:8px';form.append(note);form.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation()},true);});
}
new MutationObserver(markLegacy).observe(document.querySelector('#root'),{childList:true,subtree:true});markLegacy();
