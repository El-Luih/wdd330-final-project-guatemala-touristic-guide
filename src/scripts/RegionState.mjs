// Small utility module to centralize region query param handling and UI application
export function getRegionFromQuery() {
  try {
    const p = new URLSearchParams(location.search);
    const r = p.get('region');
    return r || null;
  } catch (e) {
    return null;
  }
}

export function addRegionToUrlString(urlString, region) {
  try {
    const url = new URL(urlString, location.href);
    if (region && region !== 'All') url.searchParams.set('region', region);
    return url.toString();
  } catch (e) {
    return urlString;
  }
}

export function applyRegionToUI(region) {
  if (!region) return;
  // try button-based UI
  const btns = document.querySelectorAll('.filtering-buttons button');
  if (btns && btns.length) {
    btns.forEach(b => b.classList.toggle('active', b.dataset.region === region));
  }
  // try select-based UI
  const sel = document.querySelector('#regions');
  if (sel) {
    // ensure option exists before setting
    const opt = Array.from(sel.options).find(o => o.value === region || o.text === region);
    if (opt) sel.value = opt.value;
  }
}

export function getActiveRegionFromUI() {
  // first try button UI
  const activeBtn = document.querySelector('.filtering-buttons button.active');
  if (activeBtn) return activeBtn.dataset.region || 'All';
  // then try select
  const sel = document.querySelector('#regions');
  if (sel) return sel.value || 'All';
  return 'All';
}
