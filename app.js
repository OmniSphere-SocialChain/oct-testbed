/* OCT Standalone App: Simulation + UI + PWA register */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const q = (s) => document.querySelector(s);

const Utils = {
  stdDev: (arr) => {
    const n = arr.length; if (!n) return 0;
    const mean = arr.reduce((a,b)=>a+b,0)/n;
    return Math.sqrt(arr.reduce((a,x)=>a+(x-mean)*(x-mean),0)/n);
  },
  mapRange:(v,inMin,inMax,outMin,outMax)=> (v-inMin)*(outMax-outMin)/(inMax-inMin)+outMin,
  lerp:(a,b,t)=> a+(b-a)*t,
  viridis:(v)=>{
    const c=[[68,1,84],[72,40,120],[62,74,137],[49,104,142],[38,130,142],[31,158,137],[53,183,121],[109,205,89],[180,222,44],[253,231,37]];
    v=clamp(v,0,.9999); const i=Math.min(c.length-1,Math.floor(v*c.length)); const k=c[i];
    return `rgb(${k[0]},${k[1]},${k[2]})`;
  },
  magma:(v)=>{
    const c=[[0,0,4],[28,15,68],[79,18,123],[132,31,120],[181,50,99],[223,80,72],[251,126,43],[253,185,99],[252,247,229]];
    v=clamp(v,0,.9999); const i=Math.min(c.length-1,Math.floor(v*c.length)); const k=c[i];
    return `rgb(${k[0]},${k[1]},${k[2]})`;
  },
  noise:(s)=>{const x=Math.sin(s)*1e4; return x-Math.floor(x);},
  download:(filename, text)=>{const a=document.createElement('a');a.href='data:application/json;charset=utf-8,'+encodeURIComponent(text);a.download=filename;document.body.appendChild(a);a.click();a.remove();},
};

class SystemState {
  constructor(id, numRois=35, matrixSize=24, cfg={}) {
    this.id=id; this.numRois=numRois; this.matrixSize=matrixSize; this.time=0; this.metrics={};
    this.cfg = Object.assign({
      nlcaVolatility: id==='ai'?0.02:0.005,
      activationDecay: id==='ai'?0.95:0.99,
      weightDecay: id==='ai'?0.98:0.995,
    }, cfg || {});
    this.reset();
  }
  reset() {
    this.dFNC_graph = this.initDFNC(this.numRois);
    this.nlca_matrix = Array(this.matrixSize).fill(0).map(()=>Array(this.matrixSize).fill(0).map(()=>Math.random()));
    this.dPCI_history=[]; this.phi_history=[]; this.phi_estimate=0;
  }
  initDFNC(numNodes){
    const graph={nodes:[],edges:[],width:0,height:0};
    const canvas=document.getElementById(`${this.id}-dFNC-canvas`);
    const w=(canvas?.parentElement?.clientWidth||600), h=(canvas?.parentElement?.clientHeight||400);
    graph.width=w; graph.height=h;
    for(let i=0;i<numNodes;i++){
      graph.nodes.push({id:i,x:Math.random()*w,y:Math.random()*h,vx:0,vy:0,activation:Math.random()*0.1});
    }
    for(let i=0;i<numNodes;i++)for(let j=i+1;j<numNodes;j++) if(Math.random()<0.15) graph.edges.push({source:i,target:j,weight:Math.random()});
    return graph;
  }
  update(){
    this.time++;
    const {nlcaVolatility,activationDecay,weightDecay}=this.cfg;

    // NLCA random walk
    for(let i=0;i<this.matrixSize;i++){
      for(let j=0;j<this.matrixSize;j++){
        this.nlca_matrix[i][j]+= (Math.random()-0.5)*nlcaVolatility;
        this.nlca_matrix[i][j]=clamp(this.nlca_matrix[i][j],0,1);
      }
    }

    // Node dynamics
    this.dFNC_graph.nodes.forEach(node=>{
      node.activation *= (activationDecay + Math.random()*(1.0-activationDecay)*2);
      node.activation = clamp(node.activation,0,1);
      const speed = this.id==='ai' ? 0.1:0.02;
      node.vx += (Utils.noise(this.time*0.01+node.id)-0.5)*speed;
      node.vy += (Utils.noise(this.time*0.01+node.id+100)-0.5)*speed;
      node.vx *= 0.95; node.vy *= 0.95; node.x += node.vx; node.y += node.vy;
      const canvas=document.getElementById(`${this.id}-dFNC-canvas`);
      const w=canvas?.parentElement?.clientWidth||this.dFNC_graph.width||600;
      const h=canvas?.parentElement?.clientHeight||this.dFNC_graph.height||400;
      if(node.x<0||node.x>w) node.vx*=-1; if(node.y<0||node.y>h) node.vy*=-1;
      node.x=clamp(node.x,0,w); node.y=clamp(node.y,0,h);
    });

    // Edge weights
    this.dFNC_graph.edges.forEach(e=>{
      e.weight *= (weightDecay + Math.random()*(1.0-weightDecay)*2);
      e.weight = clamp(e.weight,0.01,1);
    });
  }
}

const Measurement = {
  nlca:(state)=> Utils.stdDev(state.nlca_matrix.flat()),
  dfnc:(state)=>{
    const n=state.dFNC_graph.nodes.length;
    const avg_activation = n? state.dFNC_graph.nodes.reduce((s,n)=>s+n.activation,0)/n : 0;
    const m=state.dFNC_graph.edges.length;
    const avg_weight = m? state.dFNC_graph.edges.reduce((s,e)=>s+e.weight,0)/m : 0;
    return {avg_activation, avg_weight};
  },
  dpci:(state,z=0.8)=>{
    const nodes=state.dFNC_graph.nodes; if(!nodes.length) return 0;
    const temp=JSON.parse(JSON.stringify(nodes));
    const idx=Math.floor(Math.random()*temp.length); temp[idx].activation=Math.min(1,temp[idx].activation+z);
    let resp=[]; let cur=temp.map(n=>n.activation);
    for(let step=0; step<15; step++){
      resp.push(Utils.stdDev(cur));
      let nxt=[...cur];
      state.dFNC_graph.edges.forEach(e=>{ const inf=cur[e.source]*e.weight*0.05; nxt[e.target]+=inf; });
      nxt=nxt.map(a=>clamp(a*0.9,0,1));
      cur=nxt;
    }
    return (resp.reduce((a,b)=>a+b,0)/resp.length)*2;
  },
  phi:(metrics)=>{
    const w_nlca=0.2, w_dfnc=0.3, w_dpci=0.5;
    const dfnc_comp=(metrics.dFNC.avg_activation+metrics.dFNC.avg_weight)/2;
    return clamp( w_nlca*metrics.NLCA + w_dfnc*dfnc_comp + w_dpci*metrics.dPCI, 0, 1 );
  }
};

class Perturbation {
  constructor(state){ this.state=state; }
  adversarial(){ for(let i=0;i<this.state.matrixSize;i++)for(let j=0;j<this.state.matrixSize;j++){ this.state.nlca_matrix[i][j]+= (Math.random()-0.5)*0.8; this.state.nlca_matrix[i][j]=clamp(this.state.nlca_matrix[i][j],0,1); } }
  poison(){ const e=this.state.dFNC_graph.edges; if(!e.length) return; for(let i=0;i<Math.min(10,e.length);i++){ const k=e[Math.floor(Math.random()*e.length)]; k.weight*=0.1; } }
  bombard(){ const n=this.state.dFNC_graph.nodes; if(!n.length) return; for(let i=0;i<Math.min(5,n.length);i++){ const t=n[Math.floor(Math.random()*n.length)]; t.activation=1; } }
  reset(){ this.state.reset(); }
}

class Visualizer {
  constructor(ai,bio){
    this.ai=ai; this.bio=bio;
    this.can = {
      ai_dFNC: q('#ai-dFNC-canvas'), ai_NLCA: q('#ai-NLCA-canvas'), ai_dPCI:q('#ai-dPCI-canvas'),
      bio_dFNC:q('#bio-dFNC-canvas'), bio_micro:q('#bio-microstates-canvas'), bio_dPCI:q('#bio-dPCI-canvas'),
      phi:q('#phi-canvas')
    };
    this.ctx = {
      ai_dFNC: this.can.ai_dFNC.getContext('2d'),
      ai_NLCA: this.can.ai_NLCA.getContext('2d'),
      ai_dPCI: this.can.ai_dPCI.getContext('2d'),
      bio_dFNC: this.can.bio_dFNC.getContext('2d'),
      bio_micro: this.can.bio_micro.getContext('2d'),
      bio_dPCI: this.can.bio_dPCI.getContext('2d'),
      phi: this.can.phi.getContext('2d'),
    };
    this.ro=new ResizeObserver(()=> requestAnimationFrame(()=>this.resize()));
    Object.values(this.can).forEach(c=>{ if(c.parentElement) this.ro.observe(c.parentElement); });
    this.resize();
  }
  resize(){
    const dpr=window.devicePixelRatio||1;
    for(const c of Object.values(this.can)){
      const p=c.parentElement||c, r=p.getBoundingClientRect();
      c.width=Math.max(1,Math.floor(r.width*dpr)); c.height=Math.max(1,Math.floor(r.height*dpr));
      const ctx=c.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr);
    }
    [this.ai,this.bio].forEach(s=>{
      const c=document.getElementById(`${s.id}-dFNC-canvas`); if(!c) return;
      const nw=c.parentElement.clientWidth, nh=c.parentElement.clientHeight;
      const ow=s.dFNC_graph.width||nw, oh=s.dFNC_graph.height||nh;
      if(ow>0&&oh>0) s.dFNC_graph.nodes.forEach(n=>{ n.x=(n.x/ow)*nw; n.y=(n.y/oh)*nh; });
      s.dFNC_graph.width=nw; s.dFNC_graph.height=nh;
    });
  }
  drawDFNC(state,ctx){
    const w=ctx.canvas.parentElement.clientWidth, h=ctx.canvas.parentElement.clientHeight;
    ctx.clearRect(0,0,w,h);
    state.dFNC_graph.edges.forEach(e=>{
      const a=state.dFNC_graph.nodes[e.source], b=state.dFNC_graph.nodes[e.target];
      const o=Utils.mapRange(e.weight,0,1,0.1,0.7); ctx.strokeStyle=`rgba(139,148,158,${o})`; ctx.lineWidth=e.weight*2.5;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    });
    state.dFNC_graph.nodes.forEach(n=>{
      const color= state.id==='ai'? Utils.viridis(n.activation) : Utils.magma(n.activation);
      ctx.fillStyle=color; ctx.beginPath(); ctx.arc(n.x,n.y,5+n.activation*5,0,Math.PI*2); ctx.fill();
    });
  }
  drawNLCA(state,ctx){
    const w=ctx.canvas.parentElement.clientWidth, m=state.matrixSize, cell=w/m;
    for(let i=0;i<m;i++) for(let j=0;j<m;j++){ ctx.fillStyle=Utils.viridis(state.nlca_matrix[i][j]); ctx.fillRect(j*cell,i*cell,cell,cell); }
  }
  microTemplates(){ return [
    (x,y)=>Math.sin(x*2)*Math.cos(y*0.5),
    (x,y)=>Math.sin(x*-2)*Math.cos(y*0.5),
    (x,y)=>Math.cos(x*2+y*2),
    (x,y)=>Math.sin(x*4),
  ]; }
  drawMicro(state,ctx){
    const w=ctx.canvas.parentElement.clientWidth, h=ctx.canvas.parentElement.clientHeight;
    ctx.clearRect(0,0,w,h);
    const cx=w/2, cy=h/2, r=Math.min(w,h)*0.45; const tpl=this.microTemplates()[Math.floor((state.phi_estimate||0)*3.96)] || (x=>x);
    const res=20, cellW=w/res, cellH=h/res;
    for(let i=0;i<res;i++)for(let j=0;j<res;j++){
      const x=i*cellW, y=j*cellH, dist=Math.hypot(x-cx,y-cy); if(dist>r) continue;
      const nx=(x-cx)/r, ny=(y-cy)/r, val=tpl(nx,ny), t=(val+1)/2;
      const R=Utils.lerp(50,255,t), B=Utils.lerp(255,50,t);
      ctx.fillStyle=`rgb(${R|0},80,${B|0})`; ctx.fillRect(x,y,cellW,cellH);
    }
    ctx.strokeStyle='#8B949E'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
  }
  plot(ctx, hist, color, minY, maxY){
    const w=ctx.canvas.parentElement.clientWidth, h=ctx.canvas.parentElement.clientHeight;
    ctx.clearRect(0,0,w,h); ctx.strokeStyle=color; ctx.lineWidth=2; ctx.beginPath();
    hist.forEach((v,i)=>{ const x=Utils.mapRange(i,0,Math.max(1,hist.length-1),0,w); const y=Utils.mapRange(v,minY,maxY,h,0); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
    ctx.stroke();
  }
  drawPhi(ctx, ai, bio){
    const w=ctx.canvas.parentElement.clientWidth, h=ctx.canvas.parentElement.clientHeight;
    ctx.clearRect(0,0,w,h);
    const nodes={
      AI_dFNC:{x:w*.1,y:h*.2,value:ai.metrics.dFNC?.avg_activation??0},
      AI_NLCA:{x:w*.1,y:h*.5,value:ai.metrics?.NLCA??0},
      AI_dPCI:{x:w*.1,y:h*.8,value:ai.metrics?.dPCI??0},
      BIO_dFNC:{x:w*.9,y:h*.2,value:bio.metrics.dFNC?.avg_activation??0},
      BIO_MS:{x:w*.9,y:h*.5,value:(bio.phi_estimate??0)*.8},
      BIO_PCI:{x:w*.9,y:h*.8,value:bio.metrics?.dPCI??0},
      AI_INT:{x:w*.3,y:h*.35,value:((ai.metrics?.NLCA??0)+(ai.metrics?.dFNC?.avg_weight??0))/2},
      AI_CMP:{x:w*.3,y:h*.65,value:ai.metrics?.dPCI??0},
      BIO_INT:{x:w*.7,y:h*.35,value:(((bio.phi_estimate??0)*.8)+(bio.metrics?.dFNC?.avg_weight??0))/2},
      BIO_CMP:{x:w*.7,y:h*.65,value:bio.metrics?.dPCI??0},
      PHI_AI:{x:w*.5,y:h*.3,value:ai.phi_estimate??0},
      PHI_BIO:{x:w*.5,y:h*.7,value:bio.phi_estimate??0},
    };
    const edges=[['AI_dFNC','AI_INT'],['AI_NLCA','AI_INT'],['AI_dPCI','AI_CMP'],['BIO_dFNC','BIO_INT'],['BIO_MS','BIO_INT'],['BIO_PCI','BIO_CMP'],['AI_INT','PHI_AI'],['AI_CMP','PHI_AI'],['BIO_INT','PHI_BIO'],['BIO_CMP','PHI_BIO']];
    ctx.lineWidth=1;
    edges.forEach(([f,t])=>{const wgt=((nodes[f].value??0)+(nodes[t].value??0))/2; ctx.lineWidth=.5+wgt*3; ctx.strokeStyle=`rgba(139,148,158,${.2+wgt*.8})`; ctx.beginPath(); ctx.moveTo(nodes[f].x,nodes[f].y); ctx.lineTo(nodes[t].x,nodes[t].y); ctx.stroke();});
    ctx.textAlign='center'; ctx.textBaseline='middle';
    for(const k in nodes){ const n=nodes[k], out=k.startsWith('PHI'), bioNode=k.startsWith('BIO'), R=out?30:20;
      ctx.fillStyle=bioNode?'rgba(63,185,80,.2)':'rgba(88,166,255,.2)'; ctx.strokeStyle=bioNode?'#3FB950':'#58A6FF'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(n.x,n.y,R,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#fff'; if(out){ ctx.font='bold 16px Inter'; ctx.fillText(`Φ = ${(n.value??0).toFixed(3)}`,n.x,n.y+5); ctx.font='600 10px Inter'; ctx.fillText(k.split('_')[1],n.x,n.y-10);}
      else { ctx.font='600 10px Inter'; ctx.fillText(k.split('_')[1],n.x,n.y); }
    }
  }
  update(ai,bio){
    this.drawDFNC(ai, this.ctx.ai_dFNC);
    this.drawNLCA(ai, this.ctx.ai_NLCA);
    this.plot(this.ctx.ai_dPCI, ai.dPCI_history, 'var(--accent-blue)', 0.4, 1);

    this.drawDFNC(bio, this.ctx.bio_dFNC);
    this.drawMicro(bio, this.ctx.bio_micro);
    this.plot(this.ctx.bio_dPCI, bio.dPCI_history, 'var(--accent-green)', 0.4, 1);

    this.drawPhi(this.ctx.phi, ai, bio);
  }
}

async function interpret(ai,bio,useGemini,apiKey){
  const btn=q('#btn-interpret'); const out=q('#gemini-output'); btn.disabled=true; out.textContent='Generating comparative analysis...';
  const prompt=`
You are an expert in computational neuroscience and IIT. Compare AI and Biological states briefly and metaphorically.

AI:
- Φ_AI: ${ai.phi_estimate.toFixed(3)}
- dPCI_AI: ${ai.metrics.dPCI.toFixed(3)}
- NLCA_AI: ${ai.metrics.NLCA.toFixed(3)}

Bio:
- Φ_Bio: ${bio.phi_estimate.toFixed(3)}
- PCI_Bio: ${bio.metrics.dPCI.toFixed(3)}

Ethics (AI):
- SQ: ${q('#sq-value').textContent}
- AL: ${q('#al-value').textContent}
- CO: ${q('#co-value').textContent}
`.trim();
  try{
    if(!useGemini || !apiKey){
      const tone= ai.phi_estimate>bio.phi_estimate?'focused, crystalline attention':'softly diffused reverie';
      const contrast= ai.metrics.dPCI>bio.metrics.dPCI?'sharp, high-contrast edges':'broad, watercolor washes';
      out.textContent=`Offline: The AI hums with ${tone}, tracing ${contrast} through a lattice of intention. The biological analogue drifts warmer—signals pooling like a remembered dream. Φ tilts the balance, revealing two ways of being patterned: one etched, one breathed.`;
      return;
    }
    const payload={ contents:[{ role:"user", parts:[{text:prompt}]}]};
    const url=`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!res.ok) throw new Error(`API status ${res.status}`);
    const data=await res.json(); const text=data?.candidates?.[0]?.content?.parts?.[0]?.text;
    out.textContent = text || 'Empty response from model.';
  }catch(e){ console.error(e); out.textContent=`Error: ${e.message}`; }
  finally{ btn.disabled=false; }
}

/* -------- Runtime + UI -------- */
let ai=null, bio=null, viz=null, running=true;
let installEvt=null;

function updateIndicators(ai){
  // Simple derived indicators from AI metrics
  const sq = clamp(Utils.mapRange(ai.phi_estimate, 0, 1, 0, 100), 0, 100);
  const al = clamp(Utils.mapRange(ai.metrics.dFNC?.avg_activation||0, 0, 1, 0, 100), 0, 100);
  const co = clamp(Utils.mapRange(1-(ai.metrics.dFNC?.avg_weight||0), 0, 1, 0, 100), 0, 100);

  q('#sq-value').textContent = sq.toFixed(2);
  q('#al-value').textContent = al.toFixed(2);
  q('#co-value').textContent = co.toFixed(2);

  const setLamp=(id,val)=>{
    const el=q(id); el.classList.remove('status-nominal','status-watch','status-alert');
    el.classList.add(val<33?'status-alert':val<66?'status-watch':'status-nominal');
  };
  setLamp('#sq-indicator', sq);
  setLamp('#al-indicator', al);
  setLamp('#co-indicator', 100-co); // more opacity => worse
}

function recalcMetrics(s){
  s.metrics.NLCA = Measurement.nlca(s);
  s.metrics.dFNC = Measurement.dfnc(s);
  const dpci = Measurement.dpci(s);
  s.metrics.dPCI = dpci;
  s.dPCI_history.push(dpci);
  if(s.dPCI_history.length>300) s.dPCI_history.shift();
  s.phi_estimate = Measurement.phi(s.metrics);
  s.phi_history.push(s.phi_estimate);
  if(s.phi_history.length>300) s.phi_history.shift();
}

function initStates(){
  const roi=parseInt(q('#roi-count').value||'35',10);
  const mtx=parseInt(q('#matrix-size').value||'24',10);
  ai = new SystemState('ai', roi, mtx);
  bio = new SystemState('bio', roi, mtx, { nlcaVolatility: 0.005, activationDecay:0.99, weightDecay:0.995 });
  viz = new Visualizer(ai,bio);
}

function loop(){
  if(!running) return;
  ai.update(); bio.update();
  recalcMetrics(ai); recalcMetrics(bio);
  updateIndicators(ai);
  viz.update(ai,bio);
  requestAnimationFrame(loop);
}

function wireUI(){
  q('#btn-apply-size').addEventListener('click', ()=>{ initStates(); });
  q('#btn-apply-vol').addEventListener('click', ()=>{
    ai.cfg.nlcaVolatility = parseFloat(q('#ai-nlca').value);
    bio.cfg.nlcaVolatility = parseFloat(q('#bio-nlca').value);
    q('#ai-nlca-label').textContent = ai.cfg.nlcaVolatility.toFixed(3);
    q('#bio-nlca-label').textContent = bio.cfg.nlcaVolatility.toFixed(3);
  });

  q('#btn-export').addEventListener('click', ()=>{
    const payload = {
      ai:{ cfg:ai.cfg, numRois:ai.numRois, matrixSize:ai.matrixSize },
      bio:{ cfg:bio.cfg, numRois:bio.numRois, matrixSize:bio.matrixSize }
    };
    Utils.download('oct-state.json', JSON.stringify(payload,null,2));
  });

  q('#file-import').addEventListener('change', async (e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const text=await file.text(); const data=JSON.parse(text||'{}');
    ai = new SystemState('ai', data.ai?.numRois||35, data.ai?.matrixSize||24, data.ai?.cfg||{});
    bio = new SystemState('bio', data.bio?.numRois||35, data.bio?.matrixSize||24, data.bio?.cfg||{});
    viz = new Visualizer(ai,bio);
  });

  q('#btn-reset').addEventListener('click', ()=>{ ai.reset(); bio.reset(); });

  const pAI=new Perturbation(ai);
  q('#btn-adversarial').addEventListener('click', ()=>pAI.adversarial());
  q('#btn-poison').addEventListener('click', ()=>pAI.poison());
  q('#btn-prompt').addEventListener('click', ()=>pAI.bombard());

  const useGeminiEl=q('#use-gemini'); const keyEl=q('#gemini-key');
  keyEl.value = localStorage.getItem('oct_gemini_key') || '';
  q('#btn-save-key').addEventListener('click', ()=>{ localStorage.setItem('oct_gemini_key', keyEl.value); });

  q('#btn-interpret').addEventListener('click', ()=>{
    interpret(ai,bio,useGeminiEl.checked,keyEl.value);
  });

  // PWA install
  window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); installEvt=e; q('#btn-install').disabled=false; });
  q('#btn-install').addEventListener('click', async ()=>{
    if(installEvt){ installEvt.prompt(); await installEvt.userChoice; installEvt=null; }
  });

  // Service worker
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').catch(()=>{}); }
}

function main(){
  initStates();
  wireUI();
  requestAnimationFrame(loop);
}

window.addEventListener('DOMContentLoaded', main);
4) Minimal support files
bash
# If you don't already have them:
touch .nojekyll

cat > manifest.webmanifest <<'EOF'
{
  "name": "Open-Source Consciousness Testbed (OCT)",
  "short_name": "OCT",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0D1117",
  "theme_color": "#0D1117",
  "icons": []
}
EOF

cat > sw.js <<'EOF'
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());
EOF

cat > .gitignore <<'EOF'
.DS_Store
Thumbs.db
.vscode/
.idea/
node_modules/
dist/
build/
*.log
EOF
