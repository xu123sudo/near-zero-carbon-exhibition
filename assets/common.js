(()=>{
  'use strict';
  let returnFocus=null;
  let imageZoom=1;
  const image=document.getElementById('image-full');
  const zoomTo=value=>{imageZoom=Math.max(.75,Math.min(4,value));if(image){image.style.width=(imageZoom*100)+'%';document.getElementById('image-zoom-label').textContent=Math.round(imageZoom*100)+'%';}};
  document.querySelectorAll('[data-image-zoom]').forEach(b=>b.addEventListener('click',()=>zoomTo(b.dataset.imageZoom==='fit'?1:imageZoom+(b.dataset.imageZoom==='in'?.5:-.5))));
  const openDialog=dialog=>{if(!dialog)return;returnFocus=document.activeElement;dialog.showModal();};
  document.querySelectorAll('[data-scope]').forEach(b=>b.addEventListener('click',()=>openDialog(document.getElementById('scope-dialog'))));
  document.querySelectorAll('dialog').forEach(dialog=>{
    dialog.querySelector('[data-close]')?.addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
    dialog.addEventListener('close',()=>returnFocus?.focus());
  });
  document.querySelectorAll('[data-image]').forEach(button=>button.addEventListener('click',()=>{
    const title=button.dataset.title||'仿真原始输出';
    document.getElementById('image-title').textContent=title;
    image.src=button.dataset.image;image.alt=title;zoomTo(1);
    const download=document.getElementById('image-download');download.href=button.dataset.image;
    openDialog(document.getElementById('image-dialog'));
  }));
  document.querySelector('[data-fullscreen]')?.addEventListener('click',async event=>{
    const stage=document.querySelector('.twin-stage');
    try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen();}
    catch{window.open(stage.querySelector('iframe').src,'_blank','noopener');}
  });
  document.addEventListener('fullscreenchange',()=>{const b=document.querySelector('[data-fullscreen]');if(b)b.textContent=document.fullscreenElement?'退出全屏 ↙':'全屏展开 ↗';});
})();
