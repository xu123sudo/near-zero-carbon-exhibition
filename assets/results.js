(()=>{
  'use strict';
  const data=window.EXHIBIT_DATA,lib=window.ExhibitionCharts;if(!data||!lib)return;
  const daily=document.body.dataset.kind==='daily',key=document.body.dataset.key;
  const d=daily?data.daily[key]:data.scenarios[key],m=daily?data.dailyStats[key]:data.scenarioMeta[key];
  const C={green:'#527b59',blue:'#6c8d9d',gold:'#b29a65',rose:'#ab8270'};
  const charts=[],series=(name,values,color,extra={})=>({name,values,color,...extra});
  const hours=daily?d.t.map(t=>t/3600):null,x=daily?hours:d.t;
  const timeLabel=t=>daily?(String(Math.floor(t)).padStart(2,'0')+':'+String(Math.round((t%1)*60)).padStart(2,'0')):t.toFixed(3)+' s';
  const bands=daily&&key==='stress'?[{from:18,to:22}]:!daily?[{from:5,to:key==='short'?6:15}]:[];
  const cfg={x,bands,trendWindow:daily?1.15:.12,xLabel:t=>daily?t.toFixed(0)+':00':t.toFixed(t%1?1:0)+' s',pointLabel:timeLabel};
  function chart(id,s,extra={}){const canvas=document.getElementById(id);if(canvas)charts.push(new lib.Chart(canvas,{...cfg,series:s,...extra}));}
  let events=[];
  if(daily){
    chart('daily-generation',[series('光伏利用',d.pv,C.gold),series('总电负荷',d.load,C.blue)],{unit:'kW',tooltipDigits:2});
    chart('daily-exchange',[series('电网净交换',d.grid,C.green),series('储能净功率',d.bess,C.rose)],{unit:'kW',tooltipDigits:2});
    chart('daily-soc',[series('储能 SOC',d.soc,C.green)],{unit:'%',yMin:0,yMax:100,digits:0,tooltipDigits:2});
    chart('daily-voltage',[series('母线 2',d.bus2,C.blue),series('母线 3',d.bus3,C.green)],{unit:'pu',yMin:.95,yMax:1.06,digits:3,thresholds:[.95,1.05],tooltipDigits:4});
    const extremum=(arr,max=true)=>arr.indexOf((max?Math.max:Math.min)(...arr));
    events=[{index:extremum(d.pv),label:'光伏峰值'},{index:extremum(d.load),label:'负荷峰值'},{index:extremum(d.soc,false),label:'最低 SOC'}];
    if(key==='stress'){events.push({index:d.gridOn.findIndex((v,i)=>i>0&&v===0&&d.gridOn[i-1]===1),label:'外网失电'},{index:d.gridOn.findIndex((v,i)=>i>0&&v===1&&d.gridOn[i-1]===0),label:'外网恢复'});}
    events=events.filter(e=>e.index>=0).sort((a,b)=>a.index-b.index);
  }else{
    events=[{t:5,label:'电网失电'},{t:key==='short'?6:15,label:'恢复请求'}];
    if(key==='step'||key==='ramp')events.push({t:9,label:key==='step'?'阶跃扰动':'平滑扰动'},{t:12.5,label:'扰动结束'});
    if(m.syncAt!==null)events.push({t:m.syncAt,label:'同期许可'});
    if(m.command!==null)events.push({t:m.command,label:'合闸命令'});
    if(m.complete!==null)events.push({t:m.complete,label:'99% 等值连接'});
    events=events.sort((a,b)=>a.t-b.t).map(e=>({...e,index:lib.nearest(d.t,e.t)}));
    const lines=[5,key==='short'?6:15,...(key==='step'||key==='ramp'?[9,12.5]:[])];
    chart('dynamic-frequency',[series('系统频率',d.f,C.green)],{unit:'Hz',digits:3,tooltipDigits:5,thresholds:[49.8],events:lines});
    chart('dynamic-voltage',[series('母线电压',d.v,C.blue)],{unit:'pu',digits:3,tooltipDigits:6,yMin:Math.min(.94,m.minV-.01),yMax:Math.max(1.06,m.maxV+.01),thresholds:[.95,1.05],events:lines});
    chart('dynamic-power',[series('储能 BESS',d.pb,C.rose),series('PCC 电网',d.pg,C.green),series('光伏 PV',d.pv,C.gold,{visible:false}),series('负荷',d.load,C.blue,{visible:false})],{unit:'kW',tooltipDigits:3,events:lines});
    chart('dynamic-phase',[series('相角差',d.phase,C.rose,{jump:180})],{unit:'°',digits:1,tooltipDigits:4,events:lines});
    chart('dynamic-soc',[series('储能 SOC',d.soc,C.green)],{unit:'%',digits:4,tooltipDigits:6,events:lines});
    chart('dynamic-vdc',[series('DC-link 电压',d.vdc,C.gold)],{unit:'V',digits:1,tooltipDigits:4,events:lines});
    chart('dynamic-pcc',[series('PCC 连接系数',d.pcc,C.green,{step:true})],{unit:'',digits:2,yMin:0,yMax:1.05,tooltipDigits:4,events:lines});
  }
  const slider=document.getElementById('replay-range'),play=document.getElementById('play-toggle'),clock=document.getElementById('replay-time'),state=document.getElementById('replay-state'),chips=document.getElementById('event-chips');
  slider.max=d.t.length-1;let index=0,playing=false,last=0,elapsed=0,raf=0;
  const names={0:'正常并网',1:'孤岛预备',2:'解列过渡',3:'孤岛运行',4:'等待同期条件',5:'故障闭锁'};
  function update(){slider.value=index;clock.textContent=timeLabel(x[index]);state.textContent=daily?(d.gridOn[index]===1?'外部电网可用 · 并网运行':'外部电网不可用 · 储能支撑'):(names[d.state[index]]||'动态仿真回放');charts.forEach(c=>c.setCursor(x[index]));chips.querySelectorAll('button').forEach(b=>b.classList.toggle('active',Number(b.dataset.index)===index));}
  function stop(){playing=false;cancelAnimationFrame(raf);play.innerHTML='播放 <span>▷</span>';play.setAttribute('aria-label','播放仿真时间轴');play.setAttribute('aria-pressed','false');last=0;}
  function seek(i){index=Math.max(0,Math.min(d.t.length-1,i));elapsed=d.t[index];update();}
  events.forEach(e=>{const b=document.createElement('button');b.dataset.index=e.index;b.innerHTML='<b></b>';b.querySelector('b').textContent=timeLabel(daily?x[e.index]:e.t);b.append(document.createTextNode(e.label));b.addEventListener('click',()=>{stop();seek(e.index);});chips.append(b);});
  slider.addEventListener('input',()=>{stop();seek(Number(slider.value));});
  document.getElementById('replay-reset').addEventListener('click',()=>{stop();seek(0);});
  function tick(t){if(!playing)return;if(!last)last=t;elapsed+=(t-last)/1000*(daily?3600:1);last=t;const i=lib.nearest(d.t,elapsed);if(i!==index){index=i;update();}if(elapsed>=d.t[d.t.length-1])stop();else raf=requestAnimationFrame(tick);}
  play.addEventListener('click',()=>{if(playing){stop();return;}if(index===d.t.length-1)seek(0);playing=true;last=0;play.innerHTML='暂停 <span>Ⅱ</span>';play.setAttribute('aria-label','暂停仿真时间轴');play.setAttribute('aria-pressed','true');raf=requestAnimationFrame(tick);});
  document.querySelectorAll('[data-curve]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-curve]').forEach(btn=>{const selected=btn===b;btn.classList.toggle('active',selected);btn.setAttribute('aria-pressed',String(selected));});charts.forEach(c=>c.setMode(b.dataset.curve));document.querySelector('.display-tools>p').lastChild.textContent=b.dataset.curve==='smooth'?'平滑趋势 · 圆点保留原始极值':'原始曲线 · 全部采样数值';}));
  document.querySelectorAll('details').forEach(el=>el.addEventListener('toggle',()=>charts.forEach(c=>c.draw())));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  update();window.exhibitionReplay={charts,seek,get index(){return index;},get key(){return key;}};
})();
