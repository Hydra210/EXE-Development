
const $=(s,c=document)=>c.querySelector(s),$$=(s,c=document)=>[...c.querySelectorAll(s)];
const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
try{const t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}
addEventListener('load',()=>setTimeout(()=>$('#pre')?.classList.add('done'),350));
$('#theme').onclick=()=>{const d=document.documentElement,n=d.dataset.theme==='light'?'dark':'light';d.dataset.theme=n;try{localStorage.setItem('theme',n)}catch(e){}};
$('#burger').onclick=e=>{const o=$('.links').classList.toggle('open');e.currentTarget.setAttribute('aria-expanded',o)};
$$('.links a').forEach(a=>a.addEventListener('click',()=>$('.links').classList.remove('open')));
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);if(e.target.dataset.n)count(e.target)}}),{threshold:.2});
$$('.rv,[data-n]').forEach(e=>io.observe(e));
function count(el){const n=+el.dataset.n,t0=performance.now();(function f(t){const p=Math.min((t-t0)/1400,1);el.textContent=Math.round(n*(1-Math.pow(1-p,3))).toLocaleString()+(el.dataset.s||'');if(p<1)requestAnimationFrame(f)})(t0)}
const tp=$('#top');tp.onclick=()=>scrollTo({top:0});
const px=$$('[data-speed]');
addEventListener('scroll',()=>{tp.classList.toggle('on',scrollY>600);if(!reduce)px.forEach(e=>e.style.transform=`translateY(${scrollY*e.dataset.speed}px)`)},{passive:true});
const cv=$('#cv');
if(cv&&!reduce){const x=cv.getContext('2d');let w,h,m={x:-999,y:-999},ps=[];
const rs=()=>{w=cv.width=cv.offsetWidth;h=cv.height=cv.offsetHeight;ps=Array.from({length:Math.min(90,w/14|0)},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.4,vy:(Math.random()-.5)*.4}))};
rs();addEventListener('resize',rs);cv.parentElement.onmousemove=e=>{const r=cv.getBoundingClientRect();m={x:e.clientX-r.left,y:e.clientY-r.top}};
(function d(){x.clearRect(0,0,w,h);ps.forEach((p,i)=>{p.x=(p.x+p.vx+w)%w;p.y=(p.y+p.vy+h)%h;const dm=Math.hypot(p.x-m.x,p.y-m.y);if(dm<120){p.x+=(p.x-m.x)/dm*1.5;p.y+=(p.y-m.y)/dm*1.5}
x.fillStyle='#e5383b';x.fillRect(p.x,p.y,2,2);for(let j=i+1;j<ps.length;j++){const q=ps[j],l=Math.hypot(p.x-q.x,p.y-q.y);if(l<110){x.strokeStyle=`rgba(229,56,59,${.22*(1-l/110)})`;x.beginPath();x.moveTo(p.x,p.y);x.lineTo(q.x,q.y);x.stroke()}}});requestAnimationFrame(d)})()}
const car=$('.car');
if(car){const tr=$('.track',car),n=tr.children.length,ds=$('.dots',car.parentElement);let i=0,tm;
for(let k=0;k<n;k++){const b=document.createElement('button');b.setAttribute('aria-label','Slide '+(k+1));b.onclick=()=>go(k);ds.append(b)}
function go(k){i=(k+n)%n;tr.style.transform=`translateX(-${i*100}%)`;$$('button',ds).forEach((b,j)=>b.classList.toggle('on',j===i));clearInterval(tm);tm=setInterval(()=>go(i+1),6000)}go(0)}
const lb=$('#lb');
$$('.gal img').forEach(im=>{im.tabIndex=0;const o=()=>{$('img',lb).src=im.src.replace(/\/\d+\/\d+$/,'/1200/800');$('img',lb).alt=im.alt;lb.classList.add('on')};im.onclick=o;im.onkeydown=e=>e.key==='Enter'&&o()});
if(lb){lb.onclick=()=>lb.classList.remove('on');addEventListener('keydown',e=>e.key==='Escape'&&lb.classList.remove('on'))}
const f=$('#form');
if(f)f.onsubmit=e=>{e.preventDefault();let ok=true;
const chk=(id,t,m)=>{const el=$('#'+id),bad=!t(el.value.trim());el.setAttribute('aria-invalid',bad);$('#'+id+'-e').textContent=bad?m:'';if(bad&&ok){el.focus();ok=false}};
chk('name',v=>v.length>1,'Enter your name.');chk('email',v=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),'Enter a valid email address.');chk('msg',v=>v.length>=10,'Write at least 10 characters.');
if(ok)fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('#name').value.trim(),email:$('#email').value.trim(),message:$('#msg').value.trim()})}).then(r=>{if(!r.ok)throw 0;$('#ok').textContent='Message sent. We reply within two days.';f.reset()}).catch(()=>{$('#ok').textContent='Could not send. Reach us on Discord instead.'})};
