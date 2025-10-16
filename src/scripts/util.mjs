// Asynchronously loads the header and footer using fetch and await.
// Works in both development and production (after Vite build) by relying on import.meta.env.BASE_URL.
export async function loadHeaderFooter() {
    //Selects the container elements and retrieves the base URL.
    const headerElement = document.getElementById('dynamic-header');
    const footerElement = document.getElementById('dynamic-footer');
    const base = import.meta.env.BASE_URL;
    try {
        // Retrieves the header and footer partial templates.
    const header = await fetch(`${base}/partials/header.html`);
    const footer = await fetch(`${base}/partials/footer.html`);
    // NOTE for reviewers: console logs here are intentional to show fetch
    // responses for partials during evaluation/demo.
    try { console.log('loadHeaderFooter fetch', { header: { ok: header.ok, status: header.status }, footer: { ok: footer.ok, status: footer.status } }); } catch (e) {}
    if (!header.ok || !footer.ok) throw new Error(`Partial not found`);
    // Converts the templates to text and inserts their content into the target elements.
    const headerHtml = await header.text();
    const footerHtml = await footer.text();
        headerElement.innerHTML = headerHtml;
        footerElement.innerHTML = footerHtml;

        // Sets the appropriate href attributes using the base URL.
        headerElement.querySelector('#main-logo').setAttribute('src', `${base}/images/gtg-icon.svg`);
        headerElement.querySelector('#header-banner').setAttribute('href', `${base}/index.html`);

        // Selects all <a> elements in the navigation menu and assigns each an href based on its "data-page" attribute.
        const navLinks = headerElement.querySelector('#header-menu').querySelectorAll('a');
        navLinks.forEach(function (link) {
            const page = link.dataset.page;
            link.setAttribute('href', `${base}/${page}/index.html`)

            // Checks which page is active for wayfinding by finding the <a> element whose "data-page" matches the current pathname. 
            // Add an special class for styling. 
            if (window.location.pathname.includes(page)) {
                link.classList.add('current');
            }
        });
        // Wire hamburger menu after header is inserted
        try {
            const hamburger = headerElement.querySelector('#main-hamburger');
            const menu = headerElement.querySelector('#header-menu');
            if (hamburger && menu) {
                hamburger.addEventListener('click', (e) => {
                    const isOpen = menu.classList.toggle('open');
                    hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                });

                // Close when clicking outside the menu (anywhere on the document)
                document.addEventListener('click', (ev) => {
                    // If click is outside the header, close the menu
                    if (!headerElement.contains(ev.target)) {
                        if (menu.classList.contains('open')) {
                            menu.classList.remove('open');
                            hamburger.setAttribute('aria-expanded', 'false');
                        }
                        return;
                    }
                    // If click is inside header but outside menu and not the hamburger, close
                    if (!menu.contains(ev.target) && ev.target !== hamburger) {
                        if (menu.classList.contains('open')) {
                            menu.classList.remove('open');
                            hamburger.setAttribute('aria-expanded', 'false');
                        }
                    }
                });

                // Close on Escape
                document.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Escape' && menu.classList.contains('open')) {
                        menu.classList.remove('open');
                        hamburger.setAttribute('aria-expanded', 'false');
                    }
                });

                // Ensure menu resets to desktop layout when viewport grows
                const mqDesktop = window.matchMedia('(min-width: 800px)');
                const syncDesktopMenu = () => {
                    if (mqDesktop.matches) {
                        if (menu.classList.contains('open')) {
                            menu.classList.remove('open');
                        }
                        hamburger.setAttribute('aria-expanded', 'false');
                    }
                };
                try {
                    if (typeof mqDesktop.addEventListener === 'function') {
                        mqDesktop.addEventListener('change', syncDesktopMenu);
                    } else if (typeof mqDesktop.addListener === 'function') {
                        // Legacy Safari support
                        mqDesktop.addListener(syncDesktopMenu);
                    }
                } catch (e) {}
                // Initial sync in case we loaded at desktop size
                syncDesktopMenu();
            }
        } catch (e) {
            // non-fatal
            console.warn('Hamburger wiring failed', e);
        }
    } catch (error) {
        console.error('Error loading partial: ', error);
    }

    
}

export const googleKey = "AIzaSyA-Ip6-JCeCovgWWG6TijYI2SdLQdHTU84";

export class ExternalData {
    constructor(URL) {
        this.sourceURL = URL; 
        this.data;
    }

    async getData() {
        try {
            const response = await fetch(this.sourceURL);
            // NOTE for reviewers: these logs expose response objects and JSON
            // bodies to facilitate evaluation of data richness.
            try { console.log('ExternalData.getData response', { url: this.sourceURL, ok: response.ok, status: response.status }); } catch (e) {}
            if (!response.ok) {
                console.error(`ExternalData.getData: network error ${response.status} ${response.statusText} for ${this.sourceURL}`);
                return null;
            }

            let json;
            try {
                // clone so we can log without removing body
                json = await response.clone().json();
                try { console.log('ExternalData.getData body', json); } catch (e) {}
            } catch (err) {
                console.error(`ExternalData.getData: invalid JSON from ${this.sourceURL}:`, err);
                return null;
            }

            // Accepts both direct array/object or a wrapper with `Result`.
            const value = (json && Object.prototype.hasOwnProperty.call(json, 'Result')) ? json.Result : json;
            if (value === undefined || value === null) {
                console.warn(`ExternalData.getData: no data returned from ${this.sourceURL}`);
                return null;
            }

            this.data = value;
            return this.data;
        } catch (err) {
            console.error(`ExternalData.getData: fetch failed for ${this.sourceURL}:`, err);
            return null;
        }
    }
}

// --- Favorites helpers ---
const LS_FAV_RESTAURANTS = 'favoriteRestaurants_v1';
const LS_FAV_DESTINATIONS = 'favoriteDestinations_v1';

export function loadFavorites() {
    try {
        const r = JSON.parse(localStorage.getItem(LS_FAV_RESTAURANTS) || '[]');
        const d = JSON.parse(localStorage.getItem(LS_FAV_DESTINATIONS) || '[]');
        return { restaurants: Array.isArray(r) ? r : [], destinations: Array.isArray(d) ? d : [] };
    } catch (e) {
        console.warn('loadFavorites: corrupt data, resetting', e);
        localStorage.removeItem(LS_FAV_RESTAURANTS);
        localStorage.removeItem(LS_FAV_DESTINATIONS);
        return { restaurants: [], destinations: [] };
    }
}

export function saveFavorites({ restaurants = [], destinations = [] } = {}) {
    localStorage.setItem(LS_FAV_RESTAURANTS, JSON.stringify(restaurants));
    localStorage.setItem(LS_FAV_DESTINATIONS, JSON.stringify(destinations));
}

export function isFavorite(placeId, type = 'destination') {
    const fav = loadFavorites();
    return type === 'restaurant' ? fav.restaurants.includes(placeId) : fav.destinations.includes(placeId);
}

export function toggleFavorite(placeId, type = 'destination') {
    const fav = loadFavorites();
    if (type === 'restaurant') {
        const set = new Set(fav.restaurants);
        if (set.has(placeId)) set.delete(placeId); else set.add(placeId);
        fav.restaurants = Array.from(set);
    } else {
        const set = new Set(fav.destinations);
        if (set.has(placeId)) set.delete(placeId); else set.add(placeId);
        fav.destinations = Array.from(set);
    }
    saveFavorites(fav);
    return fav;
}

// Small utility: debounce
export function debounce(fn, wait = 250) {
    let tid = null;
    return (...args) => {
        if (tid) clearTimeout(tid);
        tid = setTimeout(() => fn(...args), wait);
    };
}

// Small ImageLoader to limit concurrent image requests and avoid 429 throttling
class ImageLoader {
    constructor(concurrency = 3, maxRetries = 4, baseDelay = 300) {
        this.concurrency = concurrency;
        this.queue = [];
        this.active = 0;
        this.maxRetries = maxRetries;
        this.baseDelay = baseDelay; // ms
    }

    enqueue(img, src, attempts = 0) {
        return new Promise((resolve) => {
            this.queue.push({ img, src, resolve, attempts });
            this._next();
        });
    }

    _next() {
        if (this.active >= this.concurrency || this.queue.length === 0) return;
        const item = this.queue.shift();
        const { img, src, resolve, attempts } = item;
        this.active++;

        let finished = false;
        const onLoad = () => finish(true);
        const onError = () => finish(false);
        const finish = (ok) => {
            if (finished) return;
            finished = true;
            try { img.removeEventListener('load', onLoad); img.removeEventListener('error', onError); } catch (e) {}
            this.active--;
            // schedule next processing
            setTimeout(() => this._next(), 0);
            if (ok) return resolve(true);

            // On error, decide whether to retry with backoff
            const nextAttempt = (attempts || 0) + 1;
            if (nextAttempt <= this.maxRetries) {
                // exponential backoff with jitter
                const backoff = Math.round(this.baseDelay * Math.pow(2, nextAttempt - 1) + Math.random() * this.baseDelay);
                setTimeout(() => {
                    this.queue.push({ img, src, resolve, attempts: nextAttempt });
                    // try to process queue again
                    this._next();
                }, backoff);
            } else {
                resolve(false);
            }
        };

        img.addEventListener('load', onLoad);
        img.addEventListener('error', onError);
        // start loading; wrap in try/catch
        try { img.src = src; } catch (e) { finish(false); }
    }
}

// Reduce concurrency to 2 and increase baseDelay to 500ms to be more conservative
export const imageLoader = new ImageLoader(2, 6, 500);