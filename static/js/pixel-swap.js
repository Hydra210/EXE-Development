/* PixelSwap, vanilla port of the React Bits component (no React in this repo).
   Markup: <div class="pixel-swap" data-pixel-swap data-trigger="click"> with two .pixel-swap__layer children. */
(()=>{
const MAX=220,STEPS=14,clamp=(v,a,b)=>Math.min(Math.max(v,a),b);
const P={random:()=>null,center:(x,y)=>Math.hypot(x-.5,y-.5)/Math.SQRT1_2,edges:(x,y)=>Math.min(x,1-x,y,1-y)*2,'left-to-right':x=>x,'right-to-left':x=>1-x,'top-to-bottom':(_x,y)=>y,'bottom-to-top':(_x,y)=>1-y,diagonal:(x,y)=>(x+y)/2,spiral:(x,y)=>{const a=(Math.atan2(y-.5,x-.5)+Math.PI)/(Math.PI*2),r=Math.hypot(x-.5,y-.5)/Math.SQRT1_2;return(a+r)%1}};
const E={linear:[0,0,1,1],ease:[.25,.1,.25,1],'ease-in':[.42,0,1,1],'ease-out':[0,0,.58,1],'ease-in-out':[.42,0,.58,1]};
const noise=s=>{const v=Math.sin(s*127.1+311.7)*43758.5453;return v-Math.floor(v)};
function easing(v){const m=/cubic-bezier\(([^)]+)\)/.exec(v),pt=m?m[1].split(',').map(Number):E[v];
if(!pt||pt.length!==4||pt.some(Number.isNaN))return easing('ease');
const[x1,y1,x2,y2]=pt;if(x1===y1&&x2===y2)return p=>p;
const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
return p=>{let t=p;for(let i=0;i<5;i++){const s=(3*ax*t+2*bx)*t+cx;if(!s)break;t-=(((ax*t+bx)*t+cx)*t-p)/s}t=clamp(t,0,1);return((ay*t+by)*t+cy)*t}}
function coverScale(s,gap,rad){const p=clamp(rad,0,50)/100,c=Math.SQRT1_2/(Math.SQRT2*(.5-p)+p);return(s+gap)/s*Math.max(1,c)}
function build(w,h,o){let s=Math.max(8,Math.round(o.pixelSize)),gap=Math.max(0,Math.round(o.gap)),
c=Math.max(1,Math.ceil((w+gap)/(s+gap))),r=Math.max(1,Math.ceil((h+gap)/(s+gap)));
if(c*r>MAX){s=Math.ceil(s*Math.sqrt(c*r/MAX));c=Math.max(1,Math.ceil((w+gap)/(s+gap)));r=Math.max(1,Math.ceil((h+gap)/(s+gap)))}
const st=s+gap,ox=(w-(c*st-gap))/2,oy=(h-(r*st-gap))/2,ord=P[o.pattern]||P.random,mix=clamp(o.randomness,0,1),px=[];
for(let row=0;row<r;row++)for(let col=0;col<c;col++){const i=row*c+col,x=c<=1?.5:col/(c-1),y=r<=1?.5:row/(r-1),b=ord(x,y),rn=noise(i+1);
px.push({left:ox+col*st,top:oy+row*st,offset:b===null?rn:b*(1-mix)+rn*mix})}
return{px,s,gap,w,h}}
function frames(ease,a,b,spin,fade){const win=[],con=[];
for(let i=0;i<=STEPS;i++){const p=i/STEPS,e=ease(p),sc=a+(b-a)*e,ang=spin*(1-e);
win.push({offset:p,opacity:fade?Math.min(1,e*1.6):1,transform:`rotate(${ang}deg) scale(${sc})`});
con.push({offset:p,transform:`scale(${1/sc}) rotate(${-ang}deg)`})}
return{win,con}}
function init(el,o){
o=Object.assign({pixelSize:64,gap:0,radius:0,spin:0,scale:.35,fade:true,duration:1400,pixelDuration:450,pattern:'random',randomness:0,easing:'cubic-bezier(0.22, 1, 0.36, 1)',trigger:'hover'},o);
const layers=[...el.querySelectorAll(':scope > .pixel-swap__layer')];if(layers.length<2)return;
let shown=false,desired=false,busy=false,anims=[],timer=0,gridEl=null;
const setVis=()=>{layers.forEach((l,i)=>{const on=i===(shown?1:0);l.dataset.visible=on;l.style.zIndex=on?2:1;on?l.removeAttribute('aria-hidden'):l.setAttribute('aria-hidden','true')});el.dataset.active=shown};
const stop=()=>{anims.forEach(a=>a.cancel());anims=[];clearTimeout(timer);gridEl?.remove();gridEl=null};
function finish(to){stop();shown=to;busy=false;setVis();if(desired!==shown)run(desired)}
function run(to){busy=true;
const g=build(el.clientWidth,el.clientHeight,o),src=layers[to?1:0];
if(!g.px.length||matchMedia('(prefers-reduced-motion: reduce)').matches)return finish(to);
const total=Math.max(200,o.duration),pms=clamp(o.pixelDuration,60,total),spread=Math.max(0,total-pms),end=coverScale(g.s,g.gap,o.radius),
kf=frames(easing(o.easing),clamp(o.scale,.05,1)*end,end,o.spin,o.fade);
gridEl=document.createElement('div');gridEl.className='pixel-swap__grid';gridEl.setAttribute('aria-hidden','true');
g.px.forEach(p=>{const d=document.createElement('div');d.className='pixel-swap__pixel';
Object.assign(d.style,{left:p.left+'px',top:p.top+'px',width:g.s+'px',height:g.s+'px',borderRadius:clamp(o.radius,0,50)+'%'});
const c=document.createElement('div');c.className='pixel-swap__pixel-content';
Object.assign(c.style,{left:-p.left+'px',top:-p.top+'px',width:g.w+'px',height:g.h+'px',transformOrigin:`${p.left+g.s/2}px ${p.top+g.s/2}px`});
const cl=src.cloneNode(true);cl.dataset.visible='true';cl.removeAttribute('aria-hidden');c.append(cl);d.append(c);gridEl.append(d);
const t={duration:pms,delay:p.offset*spread,easing:'linear',fill:'both'};
anims.push(d.animate(kf.win,t),c.animate(kf.con,t))});
el.append(gridEl);timer=setTimeout(()=>finish(to),total)}
const req=n=>{desired=n;if(!busy&&desired!==shown)run(desired)};
if(o.trigger==='hover'){el.addEventListener('mouseenter',()=>req(true));el.addEventListener('mouseleave',()=>req(false));el.addEventListener('focus',()=>req(true));el.addEventListener('blur',()=>req(false));el.tabIndex=0}
else if(o.trigger==='click'){el.addEventListener('click',()=>req(!desired));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();req(!desired)}});el.setAttribute('role','button');el.tabIndex=0}
setVis();return{set:req}}
document.querySelectorAll('[data-pixel-swap]').forEach(el=>{const d=el.dataset,n=(k,f)=>d[k]!==undefined?+d[k]:f;
el._pixelSwap=init(el,{pixelSize:n('pixelSize',64),gap:n('gap',0),radius:n('radius',0),spin:n('spin',0),scale:n('scale',.35),duration:n('duration',1400),pixelDuration:n('pixelDuration',450),randomness:n('randomness',0),fade:d.fade!=='false',pattern:d.pattern||'random',trigger:d.trigger||'hover'})});
})();
