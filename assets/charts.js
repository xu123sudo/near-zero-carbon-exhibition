/* Raw data stays immutable. The explicitly labelled trend display uses a
 * time-weighted kernel within event boundaries, then shape-preserving Hermite
 * interpolation. Tooltips and extreme markers always use original values. */
(function(root){
  'use strict';
  function slopes(x,y){
    const n=x.length;if(n<2)return new Array(n).fill(0);
    const h=[],d=[],m=new Array(n).fill(0);
    for(let i=0;i<n-1;i++){h[i]=x[i+1]-x[i];d[i]=h[i]>0?(y[i+1]-y[i])/h[i]:0;}
    if(n===2)return [d[0],d[0]];
    function edge(h0,h1,d0,d1){let v=((2*h0+h1)*d0-h0*d1)/(h0+h1);if(Math.sign(v)!==Math.sign(d0))return 0;if(Math.sign(d0)!==Math.sign(d1)&&Math.abs(v)>3*Math.abs(d0))return 3*d0;return v;}
    m[0]=edge(h[0],h[1],d[0],d[1]);m[n-1]=edge(h[n-2],h[n-3],d[n-2],d[n-3]);
    for(let i=1;i<n-1;i++){
      if(d[i-1]===0||d[i]===0||Math.sign(d[i-1])!==Math.sign(d[i]))m[i]=0;
      else{const w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];m[i]=(w1+w2)/(w1/d[i-1]+w2/d[i]);}
    }
    return m;
  }
  function sampleSegment(x0,x1,y0,y1,m0,m1,t){
    const h=x1-x0,a=2*t*t*t-3*t*t+1,b=t*t*t-2*t*t+t,c=-2*t*t*t+3*t*t,d=t*t*t-t*t;
    return a*y0+b*h*m0+c*y1+d*h*m1;
  }
  function segments(x,y,jump,boundaries=[]){
    const groups=[];let current=[];
    for(let i=0;i<x.length;i++){
      if(!Number.isFinite(x[i])||!Number.isFinite(y[i])){if(current.length)groups.push(current);current=[];continue;}
      if(current.length&&(x[i]<=x[current[current.length-1]]||(jump&&Math.abs(y[i]-y[current[current.length-1]])>jump)||boundaries.some(t=>x[current[current.length-1]]<t&&x[i]>=t))){groups.push(current);current=[];}
      current.push(i);
    }
    if(current.length)groups.push(current);return groups;
  }
  function trend(x,y,window,groups){
    const out=y.slice();if(!window)return out;
    groups.forEach(g=>{let l=0;for(let q=0;q<g.length;q++){
      const i=g[q];while(l<q&&x[g[l]]<x[i]-window)l++;
      let total=0,weights=0;
      for(let z=l;z<g.length&&x[g[z]]<=x[i]+window;z++){
        const j=g[z],u=Math.abs(x[j]-x[i])/window,w=Math.pow(Math.max(0,1-u*u),2);
        // Sampling density varies around switching events; time-cell weights
        // prevent dense solver samples from dominating the visual trend.
        const left=z?x[g[z-1]]:x[j],right=z+1<g.length?x[g[z+1]]:x[j];
        const cell=Math.max((right-left)/2,1e-9);total+=y[j]*w*cell;weights+=w*cell;
      }if(weights>0)out[i]=total/weights;
    }});return out;
  }
  const F=(v,n)=>Number(v).toLocaleString('en-US',{minimumFractionDigits:n,maximumFractionDigits:n,useGrouping:false});
  function nearest(x,target){let l=0,r=x.length-1;while(l<r){const m=(l+r)>>1;if(x[m]<target)l=m+1;else r=m;}return l>0&&Math.abs(x[l-1]-target)<Math.abs(x[l]-target)?l-1:l;}
  class Chart{
    constructor(canvas,config){
      this.canvas=canvas;this.config=config;this.series=config.series.map(s=>({...s,visible:s.visible!==false}));this.mode='smooth';this.cursor=null;
      this.groups=this.series.map(s=>segments(config.x,s.values,s.jump));
      this.trendGroups=this.series.map(s=>segments(config.x,s.values,s.jump,[...(config.events||[]),...(config.bands||[]).flatMap(b=>[b.from,b.to])]));
      this.trends=this.series.map((s,j)=>s.step?s.values.slice():trend(config.x,s.values,config.trendWindow,this.trendGroups[j]));
      this.tangents=this.series.map((s,j)=>this.trendGroups[j].map(g=>slopes(g.map(i=>config.x[i]),g.map(i=>this.trends[j][i]))));
      this.legend=document.querySelector(`[data-legend="${canvas.id}"]`);this.renderLegend();
      canvas.addEventListener('pointermove',event=>this.hover(event));canvas.addEventListener('pointerleave',()=>{canvas.parentElement.querySelector('output').hidden=true;this.hoverIndex=null;this.draw();});
      this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(canvas.parentElement);this.draw();
    }
    renderLegend(){
      this.legend.replaceChildren();this.series.forEach((s,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-pressed',String(s.visible));b.style.setProperty('--series-color',s.color);b.innerHTML='<i aria-hidden="true"></i>';b.append(document.createTextNode(s.name));b.addEventListener('click',()=>{if(s.visible&&this.series.filter(x=>x.visible).length===1)return;s.visible=!s.visible;b.setAttribute('aria-pressed',String(s.visible));this.draw();});this.legend.append(b);});
    }
    setMode(mode){this.mode=mode;this.draw();}
    setCursor(value){this.cursor=value;this.draw();}
    draw(){
      const rect=this.canvas.parentElement.getBoundingClientRect();if(rect.width<2||rect.height<2)return;
      const w=Math.round(rect.width),h=Math.round(rect.height),dpr=Math.min(devicePixelRatio||1,2);
      if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}
      const c=this.canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
      const cfg=this.config,x=cfg.x,lo=x[0],hi=x[x.length-1];
      let vals=[];this.series.filter(s=>s.visible).forEach(s=>s.values.forEach(v=>{if(Number.isFinite(v))vals.push(v);}));
      let min=cfg.yMin??Math.min(...vals),max=cfg.yMax??Math.max(...vals);
      if(!Number.isFinite(min)||!Number.isFinite(max)){min=0;max=1;}
      if(min===max){const p=Math.max(Math.abs(min)*.001,.001);min-=p;max+=p;}
      const pad=(max-min)*.11;if(cfg.yMin===undefined)min-=pad;if(cfg.yMax===undefined)max+=pad;
      const digits=cfg.digits??(max-min<.01?4:max-min<.5?3:max-min<4?2:max-min<25?1:0);
      c.font='10px "Microsoft YaHei", sans-serif';
      const left=Math.max(43,c.measureText(F(min,digits)).width+12,c.measureText(F(max,digits)).width+12),right=25,top=19,bottom=30,pw=w-left-right,ph=h-top-bottom;
      const X=v=>left+(v-lo)/(hi-lo||1)*pw,Y=v=>top+(max-v)/(max-min)*ph;
      this.geometry={X,Y,left,right,top,bottom,pw,ph,lo,hi,min,max,w,h,digits};
      c.save();c.beginPath();c.rect(left,top,pw,ph);c.clip();
      (cfg.bands||[]).forEach(b=>{c.fillStyle=b.color||'#b2a17d12';c.fillRect(X(b.from),top,X(b.to)-X(b.from),ph);});
      c.restore();c.lineWidth=.6;c.textBaseline='middle';c.strokeStyle='#e6eade';
      for(let i=0;i<=4;i++){const y=top+ph*i/4;c.beginPath();c.moveTo(left,y);c.lineTo(w-right,y);c.stroke();c.fillStyle='#96a08a';c.textAlign='right';c.fillText(F(max-(max-min)*i/4,digits),left-9,y);}
      for(let i=0;i<=4;i++){const t=lo+(hi-lo)*i/4,xx=X(t);c.fillStyle='#96a08a';c.textAlign='center';c.fillText(cfg.xLabel?cfg.xLabel(t):F(t,0),xx,h-11);}
      c.save();c.beginPath();c.rect(left,top,pw,ph);c.clip();
      (cfg.thresholds||[]).forEach(value=>{c.save();c.strokeStyle='#b39a6480';c.lineWidth=.8;c.setLineDash([4,5]);c.beginPath();c.moveTo(left,Y(value));c.lineTo(w-right,Y(value));c.stroke();c.restore();});
      (cfg.events||[]).forEach(t=>{c.save();c.strokeStyle='#b9ac8c66';c.lineWidth=.65;c.setLineDash([2,5]);c.beginPath();c.moveTo(X(t),top);c.lineTo(X(t),top+ph);c.stroke();c.restore();});
      this.series.forEach((s,j)=>{
        if(!s.visible)return;c.strokeStyle=s.color;c.lineWidth=s.width||1.65;c.lineJoin='round';c.lineCap='round';c.setLineDash(s.dash||[]);
        const display=this.mode==='smooth'?this.trends[j]:s.values,groups=this.mode==='smooth'?this.trendGroups[j]:this.groups[j];
        groups.forEach((g,k)=>{if(!g.length)return;const m=this.tangents[j][k];c.beginPath();c.moveTo(X(x[g[0]]),Y(display[g[0]]));
          for(let q=1;q<g.length;q++){const a=g[q-1],b=g[q],dx=x[b]-x[a];if(s.step){c.lineTo(X(x[b]),Y(s.values[a]));c.lineTo(X(x[b]),Y(s.values[b]));}
            else if(this.mode==='smooth'){c.bezierCurveTo(X(x[a]+dx/3),Y(display[a]+m[q-1]*dx/3),X(x[b]-dx/3),Y(display[b]-m[q]*dx/3),X(x[b]),Y(display[b]));}
            else c.lineTo(X(x[b]),Y(s.values[b]));
          }c.stroke();});
        if(this.mode==='smooth'&&!s.step){
          const valid=s.values.filter(Number.isFinite),low=Math.min(...valid),high=Math.max(...valid);
          for(const value of new Set([low,high])){const i=s.values.indexOf(value);if(i>=0&&Math.abs(value-display[i])>(max-min)*.015){c.fillStyle='#fff';c.strokeStyle=s.color;c.lineWidth=1.1;c.beginPath();c.arc(X(x[i]),Y(value),2.5,0,Math.PI*2);c.fill();c.stroke();}}
        }
      });c.setLineDash([]);
      if(this.cursor!==null){const xx=X(this.cursor);c.strokeStyle='#a58a5388';c.lineWidth=.8;c.setLineDash([4,5]);c.beginPath();c.moveTo(xx,top);c.lineTo(xx,top+ph);c.stroke();c.setLineDash([]);}
      if(this.hoverIndex!==undefined&&this.hoverIndex!==null){const i=this.hoverIndex;this.series.filter(s=>s.visible).forEach(s=>{if(Number.isFinite(s.values[i])){c.fillStyle='#fff';c.strokeStyle=s.color;c.lineWidth=1.2;c.beginPath();c.arc(X(x[i]),Y(s.values[i]),3,0,Math.PI*2);c.fill();c.stroke();}});}
      c.restore();
    }
    hover(event){if(!this.geometry)return;const r=this.canvas.getBoundingClientRect(),g=this.geometry,px=event.clientX-r.left,target=g.lo+Math.max(0,Math.min(1,(px-g.left)/g.pw))*(g.hi-g.lo),i=nearest(this.config.x,target);this.hoverIndex=i;this.draw();const tip=this.canvas.parentElement.querySelector('output');tip.replaceChildren();const strong=document.createElement('strong');strong.textContent=this.config.pointLabel?this.config.pointLabel(this.config.x[i]):F(this.config.x[i],3)+' s';tip.append(strong);this.series.filter(s=>s.visible).forEach(s=>{const row=document.createElement('span');row.textContent=s.name+'：'+F(s.values[i],s.digits??this.config.tooltipDigits??3)+' '+(s.unit||this.config.unit||'');tip.append(row);});tip.hidden=false;tip.style.left=Math.max(6,Math.min(r.width-tip.offsetWidth-6,px+12))+'px';tip.style.top=Math.max(5,Math.min(r.height-tip.offsetHeight-5,event.clientY-r.top-tip.offsetHeight-10))+'px';}
  }
  root.ExhibitionCharts={Chart,slopes,sampleSegment,segments,nearest,trend};
  if(typeof module!=='undefined'&&module.exports)module.exports={slopes,sampleSegment,segments,nearest,trend};
})(typeof window!=='undefined'?window:globalThis);
