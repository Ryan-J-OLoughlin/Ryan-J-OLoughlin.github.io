/* ===== Interactive Timeline renderer + fit-to-window logic ================== */

(async function () {
  const root = document.getElementById('timeline');
  root.classList.add('timeline');

  // Build track
  const track = document.createElement('div');
  track.className = 'timeline__track';
  root.appendChild(track);

  // Your timeline data
    // --- Load timeline data from external JSON file ----------------------------
  let data = [];
  try {
    const response = await fetch('/assets/timeline/timeline.json');
    if (!response.ok) throw new Error(`Failed to load timeline.json: ${response.status}`);
    data = await response.json();
  } catch (err) {
    console.error("Error loading timeline data:", err);
    return;
  }

  // Normalize: alternate sides if not provided & calculate proportional positions
  const years = data.map(d => parseInt(d.year));
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const yearRange = maxYear - minYear;
  
  data.forEach((d, i) => {
    if (!d.side) d.side = i % 2 === 0 ? 'up' : 'down';
    // 1) Normalize year to [0,1]
    const t = (parseInt(d.year, 10) - minYear) / yearRange;

    // 2) Nonlinear warp (γ > 1 expands the high end; try 1.6–2.0)
    const gamma = 2.0;               // tweak this
    d.position = Math.pow(t, gamma); // t ** gamma
  });

  // Create a container div that will hold all positioned items
  const itemsContainer = document.createElement('div');
  itemsContainer.style.position = 'relative';
  itemsContainer.style.width = 'calc(100% - 4rem)'; // FIXED: Account for padding
  itemsContainer.style.height = '100%';
  itemsContainer.style.left = '4rem'; // FIXED: Offset for left padding
  track.appendChild(itemsContainer);

  // Render items with proportional positioning
  data.forEach((d, idx) => {
    const item = document.createElement('button');
    item.className = 'timeline__item';
    item.type = 'button';
    item.setAttribute('aria-label', `${d.year}: ${stripMd(d.line || '')}`);
    item.dataset.index = String(idx);
    
    // Position the item proportionally
    item.style.position = 'absolute';
    item.style.left = `${d.position * 100}%`;
    //item.style.transform = 'translateX(-50%)'; // Center on the position
    item.style.top = '50%';
    //item.style.transform += ' translateY(-50%)'; // Center vertically too

    const year = el('div', 'timeline__year', d.year);

    const dot = el('div', 'timeline__dot');
    dot.setAttribute('aria-hidden', 'true');

    const imgwrap = el('div', 'timeline__imgwrap');
    imgwrap.dataset.side = d.side;
    const img = document.createElement('img');
    img.src = d.img;
    img.alt = `${d.year} marker`;
    img.loading = 'lazy';
    imgwrap.appendChild(img);

    const line = el('div', 'timeline__line', toHTML(d.line || ''));
    line.dataset.side = d.side;

    item.appendChild(year);
    item.appendChild(dot);
    item.appendChild(imgwrap);
    item.appendChild(line);
    itemsContainer.appendChild(item);
  });

  const items = Array.from(itemsContainer.querySelectorAll('.timeline__item'));

  // Interaction: hover/focus sets active with enhanced slide effect
  function setActive(activeIdx) {
    if (activeIdx == null) {
      itemsContainer.removeAttribute('data-active-index');
      items.forEach(it => {
        it.classList.remove('is-active');
        it.style.removeProperty('--slide-offset');
        it.style.removeProperty('--slide-opacity');
      });
      return;
    }
    itemsContainer.dataset.activeIndex = String(activeIdx);
    
    const activePosition = data[activeIdx].position;
    
    items.forEach((it, i) => {
      if (i === activeIdx) {
        it.classList.add('is-active');
        return;
      }
      
      const itemPosition = data[i].position;
      const delta = itemPosition - activePosition;
      
      // Enhanced slide calculation with distance-based effects
      const distance = Math.abs(delta);
      const slideDirection = Math.sign(delta);
      
      // Items further away slide more dramatically and fade more
      let slideOffset = delta * 120; // ← increase/decrease to change push
      let opacity = Math.max(0, 1 - distance * 2.5); // ← steeper/shallower fade
      
      // Very distant items slide completely off-screen
      if (distance > 0.3) {
        slideOffset = slideDirection * 400; // Slide way off screen
        opacity = 0; // Completely invisible
      }
      
      it.style.setProperty('--slide-offset', slideOffset);
      it.style.setProperty('--slide-opacity', opacity);
      it.classList.remove('is-active');
    });
  }

  items.forEach((it, i) => {
    it.addEventListener('mouseenter', () => setActive(i));
    it.addEventListener('mouseleave', () => setActive(null));
    it.addEventListener('focus', () => {
      setActive(i);
      // keep focused item centered in horizontal layout
      if (!isVertical()) {
        it.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
    });
    it.addEventListener('blur', () => setActive(null));
  });

  // --- Fit-to-window logic ---------------------------------------------------
  function setScale(value) {
    root.style.setProperty('--scale', String(value));
  }

  function isVertical() {
    return window.matchMedia('(max-width: 720px)').matches;
  }

  function viewportHeight() {
    return window.innerHeight;
  }

  function measureAndFit() {
    // Reset scale to measure natural size
    setScale(1);

    // Force reflow to ensure measurement is accurate
    itemsContainer.offsetWidth;

    const naturalWidth = itemsContainer.scrollWidth;
    const naturalHeight = itemsContainer.scrollHeight;

    // FIXED: Use actual available space
    const availableWidth = window.innerWidth;
    const availableHeight = window.innerHeight;

    const eps = 0.05; // FIXED: Increased epsilon for better fit

    let scaleW = (availableWidth / naturalWidth) - eps;
    let scaleH = (availableHeight / naturalHeight) - eps;

    // Ensure scales don't exceed 1
    scaleW = Math.min(1, scaleW);
    scaleH = Math.min(1, scaleH);

    // Use the more restrictive scale to ensure everything fits
    const scale = Math.max(0.4, Math.min(scaleW, scaleH)); // FIXED: Lower minimum scale

    setScale(scale);
  }

  // Initial fit
  measureAndFit();

  // Refit on resize (debounced)
  let fitTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(measureAndFit, 100);
  });

  // Refit when images load
  itemsContainer.querySelectorAll('img').forEach(img => {
    if (!img.complete) img.addEventListener('load', measureAndFit, { once: true });
  });

    // Copy the image side ("up"/"down") onto the year pill for styling
  document.querySelectorAll('#timeline .timeline__item').forEach(item => {
    const side = item.querySelector('.timeline__imgwrap')?.getAttribute('data-side') || 'up';
    const year = item.querySelector('.timeline__year');
    if (year) year.setAttribute('data-side', side);
  });


  // --- Utilities -------------------------------------------------------------
  function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }

  // Simple Markdown → HTML (support *italic*)
  function toHTML(s) {
    return (s || '').replace(/\*(.+?)\*/g, '<em>$1</em>');
  }
  function stripMd(s) {
    return (s || '').replace(/\*(.+?)\*/g, '$1');
  }
})();