<script>
// --- tiny helper: fetch JSON safely
async function loadJSON(url){
  const res = await fetch(url, {cache:"no-store"});
  if(!res.ok) throw new Error(`Failed to load ${url}`);
  return await res.json();
}

(function(){
  const ROOT_ID = (window.CYOA_CONFIG && window.CYOA_CONFIG.mount) || "#cyoa";
  const root = document.querySelector(ROOT_ID);
  if(!root){ console.warn("CYOA mount not found"); return; }

  const state = {
    avatarId: null,
    story: null,        // loaded JSON
    stepIndex: 0,       // 0..n-1
    chosen: {},         // stepId -> key
    muted: false
  };

  // --- read-more index (lazy loaded)
  let READMORE = null;
  async function getReadmore(){
    if(READMORE) return READMORE;
    try { READMORE = await loadJSON('assets/game/readmore.json'); }
    catch(e){ READMORE = { defaults: [] }; }
    return READMORE;
  }

  // --- storage
  const persist = () => sessionStorage.setItem("cyoa", JSON.stringify({
    avatarId: state.avatarId, stepIndex: state.stepIndex, chosen: state.chosen, muted: state.muted
  }));
  const restore = () => {
    try{
      const raw = sessionStorage.getItem("cyoa");
      if(!raw) return;
      const s = JSON.parse(raw);
      Object.assign(state, s);
    }catch(e){}
  };

  // --- assets map (scene name -> image path). Edit as you add sprites.
  const SCENES = { };

  const AVATARS = [
    { id:"city-planner", title:"City Planner", icon:"assets/game/pixel/city-planner.png" },
    { id:"policymaker", title:"Policymaker", icon:"assets/game/pixel/policymaker.png" },
    { id:"student", title:"Science Student", icon:"assets/game/pixel/student.png" },
    { id:"journalist", title:"Journalist", icon:"assets/game/pixel/journalist.png" }
  ];

  // map avatar -> data file
  const DATA_URL = (id)=> `assets/game/data/${id}.json`;
  // Background scene resolver: try PNG/SVG and hyphen/underscore variants
  const BG_CANDIDATES = (id)=> [
    `assets/game/pixel/scene-${id}.png`,
    `assets/game/pixel/scene-${id}.svg`,
    `assets/game/pixel/scene_${id}.png`,
    `assets/game/pixel/scene_${id}.svg`
  ];
  function setWindowBackground(container, id){
    const urls = BG_CANDIDATES(id);
    let idx = 0;
    function tryNext(){
      if(idx >= urls.length){ container.style.backgroundImage = "none"; return; }
      const url = urls[idx] + `?v=${idx}`;
      const img = new Image();
      img.onload = ()=> { container.style.backgroundImage = `url('${urls[idx]}')`; };
      img.onerror = ()=> { idx++; tryNext(); };
      img.src = url;
    }
    tryNext();
  }

  // --- entry
  restore();
  if(state.avatarId){
    startAvatar(state.avatarId); // will reload story json
  }else{
    renderIntro();
  }

  // --- renderers

  function renderIntro(){
    root.innerHTML = `
      <div class="cyoa-window">
        <div class="cyoa-titlebar">
          <div>Trust without Truth — Choose Your Own Adventure</div>
          <div class="cyoa-winbuttons"><div class="cyoa-winbtn"></div><div class="cyoa-winbtn"></div><div class="cyoa-winbtn"></div></div>
        </div>
        <div class="cyoa-content">
          <div class="cyoa-card crt">
            <div class="cyoa-title">Choose Your Avatar</div>
            <div class="cyoa-prompt">
              Everyone wants trustworthy guidance for decisions about the future. But every model is wrong, leaving us unsure whether to trust science. Choose your role to explore how science earns trust through uncertainty, disagreement, and even failure.
            </div>
            <div class="cyoa-avatars" role="list">
              ${AVATARS.map(a=>`
                <button class="cyoa-avatar" data-avatar="${a.id}" role="listitem">
                  <img alt="" src="${a.icon}" />
                  <div class="title">${a.title}</div>
                  <div class="muted">Start this path</div>
                </button>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    `;
    const win = root.querySelector('.cyoa-window');
    setWindowBackground(win, 'intro');
    root.querySelectorAll("[data-avatar]").forEach(btn=>{
      btn.addEventListener("click", ()=> startAvatar(btn.dataset.avatar));
    });
  }

  async function startAvatar(id){
    state.avatarId = id;
    state.stepIndex = 0;
    state.chosen = {};
    persist();
    try{
      state.story = await loadJSON(DATA_URL(id));
      renderAll();
      enableKeys();
    }catch(e){
      root.innerHTML = `<div class="cyoa-card"><div class="cyoa-title">Error</div><p>Could not load story for ${id}.</p></div>`;
      console.error(e);
    }
  }

  function renderAll(){
    const step = state.story.steps[state.stepIndex];
    const total = state.story.steps.length;

    root.innerHTML = `
      <div class="cyoa-window">
        <div class="cyoa-titlebar">
          <div>${avatarFor(state.avatarId).title}</div>
          <div class="cyoa-winbuttons"><div class="cyoa-winbtn"></div><div class="cyoa-winbtn"></div><div class="cyoa-winbtn"></div></div>
        </div>
        <div class="cyoa-content">
          <div class="cyoa-hud">
            <div class="cyoa-role">
              <img alt="" src="${avatarFor(state.avatarId).icon}" />
              <div class="name">${avatarFor(state.avatarId).title}</div>
            </div>
            <div class="cyoa-pips" aria-label="Progress" role="progressbar" aria-valuenow="${state.stepIndex}" aria-valuemin="0" aria-valuemax="${total}">
              ${Array.from({length: total}).map((_,i)=>`<div class=\"cyoa-pip ${i<=state.stepIndex? 'is-on':''}\"></div>`).join("")}
            </div>
            <div class="cyoa-actions">
              <button type="button" id="actBack" ${state.stepIndex===0?'disabled':''}>Back</button>
              <button type="button" id="actRestart">Restart</button>
              <button type="button" id="actAvatar">Choose avatar</button>
            </div>
          </div>
          <div class="cyoa-card crt">
            <div class="cyoa-top">
              ${renderScene(step.scene, step.id)}
              <div class="cyoa-toptext">
                <div class="cyoa-title">${state.story.title}</div>
                <div class="cyoa-prompt">${step.prompt}</div>
              </div>
            </div>
            <div class="cyoa-choices" role="group" aria-label="Choices">
              ${step.choices.map(c=>renderChoice(step.id, c)).join("")}
            </div>
            <div id="fb" class="cyoa-feedback hidden" aria-live="polite"></div>
          </div>
        </div>
      </div>
    `;
    // resolve prompt-specific illustration after mount
    const img = root.querySelector('#sceneImg');
    if(img){ resolvePromptImage(img, state.avatarId, step); }
    const win = root.querySelector('.cyoa-window');
    setWindowBackground(win, state.avatarId);

    // wire actions
    const back = root.querySelector("#actBack");
    if(back) back.addEventListener("click", ()=> { if(state.stepIndex>0){ state.stepIndex--; persist(); renderAll(); }});
    root.querySelector("#actRestart").addEventListener("click", ()=> { state.stepIndex=0; state.chosen={}; persist(); renderAll(); });
    root.querySelector("#actAvatar").addEventListener("click", ()=> { state.avatarId=null; persist(); renderIntro(); });

    // rehydrate prior feedback if user navigated back
    const prevKey = state.chosen[step.id];
    if(prevKey){
      const prev = step.choices.find(x=>x.key===prevKey);
      showFeedback(prev.feedback, step.next, step.id);
      // focus Next for accessibility
      const nextBtn = root.querySelector(".cyoa-next");
      if(nextBtn) nextBtn.focus();
    }
  }

  function renderScene(sceneKey, stepId){
    // Render container; we'll resolve the best-matching prompt image after mount
    const fallback = SCENES[sceneKey] || "";
    return `
      <div class="cyoa-illustration">
        <img id="sceneImg" alt="" src="${fallback || ''}" />
      </div>`;
  }

  function renderChoice(stepId, choice){
    const selected = state.chosen[stepId] === choice.key;
    return `
      <button class="cyoa-choice" data-choice="${choice.key}" data-step="${stepId}">
        <span class="label">[${choice.key}]</span>${choice.label}
      </button>
    `;
  }

  function avatarFor(id){ return AVATARS.find(a=>a.id===id) || AVATARS[0]; }

  function handleChoice(step, key){
    state.chosen[step.id] = key;
    persist();
    const obj = step.choices.find(c=>c.key===key);
    showFeedback(step, obj.feedback, step.next);
  }

  function showFeedback(step, text, nextId){
    const fb = root.querySelector("#fb");
    fb.classList.remove("hidden");
    const card = root.querySelector('.cyoa-card');
    if(card) card.classList.add('has-fb');
    fb.innerHTML = `
      <button class="cyoa-close" type="button" aria-label="Close">✕</button>
      <div>${text}</div>
      <div>
        <button class="cyoa-next" type="button">${nextId ? 'Next ▶' : 'Finish ▶'}</button>
        <button class="cyoa-readmore" type="button">Read more</button>
      </div>
    `;
    // Ensure the bubble is visible on small screens
    const content = root.querySelector('.cyoa-content');
    if(content){
      // give layout a tick
      setTimeout(()=>{ content.scrollTo({ top: content.scrollHeight, behavior: 'smooth' }); }, 0);
    }
    const btn = fb.querySelector(".cyoa-next");
    btn.addEventListener("click", ()=>{
      if(nextId){
        // advance by next id OR by index if sequential
        const idx = state.story.steps.findIndex(s=>s.id===nextId);
        state.stepIndex = (idx>=0) ? idx : Math.min(state.stepIndex+1, state.story.steps.length-1);
        persist(); 
        if(state.stepIndex < state.story.steps.length) renderAll();
        else renderEnd();
      }else{
        renderEnd();
      }
    });
    const rm = fb.querySelector(".cyoa-readmore");
    rm.addEventListener("click", ()=> openReadMore(step));

    // close button returns user to choices on same screen
    const close = fb.querySelector('.cyoa-close');
    close.addEventListener('click', ()=>{
      // clear stored choice so we don't auto-rehydrate
      if(step && step.id){ delete state.chosen[step.id]; persist(); }
      fb.classList.add('hidden');
      const card = root.querySelector('.cyoa-card');
      if(card) card.classList.remove('has-fb');
      // move focus to first choice for accessibility
      const firstChoice = root.querySelector('.cyoa-choice');
      if(firstChoice) firstChoice.focus();
    });
  }

  // Simple read-more: overlay with related links
  async function openReadMore(step){
    let overlay = root.querySelector('#cyoa-rm');
    if(overlay) return; // one at a time
    const idx = await getReadmore();
    const key = `${state.avatarId}/${step.id}`;
    const links = (step.readmore && step.readmore.length) ? step.readmore
                 : idx[key] || idx[`${step.id}`] || idx.defaults || [];
    overlay = document.createElement('div');
    overlay.id = 'cyoa-rm';
    overlay.style.position = 'absolute';
    overlay.style.inset = '0.5rem';
    overlay.style.background = 'rgba(10,20,30,0.95)';
    overlay.style.border = '1px solid #2a4d6f';
    overlay.style.borderRadius = '4px';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '10';
    const box = document.createElement('div');
    box.style.maxWidth = '560px';
    box.style.padding = '12px';
    box.style.background = 'color-mix(in oklab, var(--paper) 85%, black 15%)';
    box.style.border = '1px solid var(--brand-border, #d8dbe0)';
    box.style.borderRadius = '4px';
    const list = links.length ? links.map(l=>`<a href="${l.href}" target="_blank" rel="noopener" class="link-muted">${l.label}</a>`).join("")
                              : `<span>No links yet.</span>`;
    box.innerHTML = `
      <div style="font-size:12px; text-transform:uppercase; color:var(--muted); margin-bottom:.4rem;">Further reading</div>
      <div style="display:grid; gap:.35rem; font-size:13px;">
        ${list}
      </div>
      <div style="margin-top:.6rem; text-align:right;">
        <button type="button" id="rmClose" class="cyoa-next">Close</button>
      </div>`;
    overlay.appendChild(box);
    const card = root.querySelector('.cyoa-card');
    card && card.appendChild(overlay);
    overlay.querySelector('#rmClose').addEventListener('click', ()=> overlay.remove());
  }

  function renderEnd(){
    const end = state.story.end;
    root.innerHTML = `
      <div class="cyoa-window">
        <div class="cyoa-titlebar">
          <div>${avatarFor(state.avatarId).title}</div>
          <div class="cyoa-winbuttons"><div class="cyoa-winbtn"></div><div class="cyoa-winbtn"></div><div class="cyoa-winbtn"></div></div>
        </div>
        <div class="cyoa-content">
          <div class="cyoa-hud">
            <div class="cyoa-role">
              <img alt="" src="${avatarFor(state.avatarId).icon}" />
              <div class="name">${avatarFor(state.avatarId).title}</div>
            </div>
            <div class="cyoa-actions">
              <button type="button" id="actRestart">Replay</button>
              <button type="button" id="actAvatar">Choose avatar</button>
            </div>
          </div>
          <div class="cyoa-card crt">
            <div class="cyoa-title">${state.story.title} — Summary</div>
            <div class="cyoa-prompt">${end.summary}</div>
            ${end.links ? `<div style=\"margin-top:.5rem;\">${end.links.map(renderLink).join(" ")}</div>` : ""}
          </div>
        </div>
      </div>
    `;
    const win = root.querySelector('.cyoa-window');
    setWindowBackground(win, state.avatarId);
    root.querySelector("#actRestart").addEventListener("click", ()=> { state.stepIndex=0; state.chosen={}; persist(); renderAll(); });
    root.querySelector("#actAvatar").addEventListener("click", ()=> { state.avatarId=null; persist(); renderIntro(); });
  }

  function renderLink(l){ return `<a href="${l.href}" target="_blank" rel="noopener">${l.label}</a>`; }

  function enableKeys(){
    window.onkeydown = (e)=>{
      const step = state.story.steps[state.stepIndex];
      // number keys 1-4 map to A-D
      const map = { "1":"A", "2":"B", "3":"C", "4":"D" };
      if(map[e.key]){
        const btn = root.querySelector(`.cyoa-choice[data-choice="${map[e.key]}"]`);
        if(btn){ btn.click(); return; }
      }
      if(e.key === "Enter"){
        const next = root.querySelector(".cyoa-next");
        if(next){ next.click(); return; }
      }
      if(e.key === "Escape"){
        // Close read-more if present
        const overlay = root.querySelector('#cyoa-rm');
        if(overlay){ overlay.remove(); return; }
        // Or close feedback bubble
        const fb = root.querySelector('#fb');
        if(fb && !fb.classList.contains('hidden')){
          const close = fb.querySelector('.cyoa-close');
          if(close){ close.click(); return; }
        }
      }
      if(e.key === "Backspace"){
        const back = root.querySelector("#actBack");
        if(back && !back.disabled){ back.click(); return; }
      }
    };

    // delegate choice clicks
    root.addEventListener("click", (ev)=>{
      const el = ev.target.closest(".cyoa-choice");
      if(!el) return;
      const stepId = el.dataset.step;
      const step = state.story.steps[state.stepIndex];
      if(step.id !== stepId) return; // stale
      handleChoice(step, el.dataset.choice);
    });
    // Prompt image resolution handled in renderAll
  }

  // Resolve prompt-specific image with fallbacks
  function resolvePromptImage(imgEl, avatarId, step){
    const sceneKey = step.scene;
    const stepId = step.id;
    const candidates = [
      `assets/game/pixel/${avatarId}-${stepId}.png`,
      `assets/game/pixel/${avatarId}-${sceneKey}.png`,
      `assets/game/pixel/${avatarId}-${stepId}.svg`,
      `assets/game/pixel/${avatarId}-${sceneKey}.svg`,
      SCENES[sceneKey]
    ].filter(Boolean);
    let i = 0;
    function tryNext(){
      if(i >= candidates.length) return; // keep fallback if exists
      const url = candidates[i];
      // If current src already equals url, stop
      if(imgEl.getAttribute('src') === url){ return; }
      const tmp = new Image();
      tmp.onload = ()=> { imgEl.src = url; };
      tmp.onerror = ()=> { i++; tryNext(); };
      tmp.src = url + `?v=${i}`;
    }
    tryNext();
  }
})();
</script>
