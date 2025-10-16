(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))s(e);new MutationObserver(e=>{for(const a of e)if(a.type==="childList")for(const o of a.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&s(o)}).observe(document,{childList:!0,subtree:!0});function t(e){const a={};return e.integrity&&(a.integrity=e.integrity),e.referrerPolicy&&(a.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?a.credentials="include":e.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function s(e){if(e.ep)return;e.ep=!0;const a=t(e);fetch(e.href,a)}})();const p=`<header>
  <a href="" id="header-banner">
    <img src="" alt="Guatemala Touristic Guide Logo" id="main-logo" />
    <span id="header-name">Guatemala Touristic Guide</span>
  </a>
  <button id="main-hamburger" aria-label="Drop Down Menu"></button>
  <nav class="drop-down" id="header-menu">
    <ul>
      <li>
        <a data-page="favorites" href=""
          >Favorites<span class="wayfinding"></span
        ></a>
      </li>
      <li>
        <a data-page="destinations" href=""
          >Destinations<span class="wayfinding"></span
        ></a>
      </li>
      <li>
        <a data-page="cuisine" href=""
          >Cuisine<span class="wayfinding"></span
        ></a>
      </li>
      <li>
        <a data-page="events" href="">Events<span class="wayfinding"></span></a>
      </li>
    </ul>
  </nav>
</header>
`,y=`<footer>
  <section id="contact-info">
    <p>
      <strong>Guatemala Touristic Guide</strong><br />
      7a Avenida 12-45, Zona 10<br />
      Ciudad de Guatemala, Guatemala<br />
      (+502) 4567-8910
    </p>
  </section>
  <section id="social-media">
    <a href="https://www.youtube.com/"
      ><img src="" alt="Youtube Icon" data-name="youtube"
    /></a>
    <a href="https://x.com"
      ><img src="" alt="Twitter Icon" data-name="twitter-x"
    /></a>
    <a href="https://www.linkedin.com"
      ><img src="" alt="Linkedin Icon" data-name="linkedin"
    /></a>
  </section>
  <section id="creation-info">
    <p>
      WDD330 Class Project<br />
      Luis Maradiaga<br />
      &copy; <span id="currentYear"></span> Guatemala Touristic Guide<br />
    </p>
  </section>
</footer>
`;async function b(){const r=document.getElementById("dynamic-header"),n=document.getElementById("dynamic-footer"),t="/wdd330-final-project-guatemala-touristic-guide/";try{r.innerHTML=p||'<header><a id="header-banner"><img id="main-logo" alt="" /><span id="header-name"></span></a><button id="main-hamburger" aria-label="Drop Down Menu"></button><nav id="header-menu"><ul></ul></nav></header>';try{r.querySelector("#main-logo").setAttribute("src",`${t}/images/gtg-icon.svg`)}catch{}try{r.querySelector("#header-banner").setAttribute("href",`${t}/index.html`)}catch{}r.querySelector("#header-menu").querySelectorAll("a").forEach(function(e){const a=e.dataset.page;e.setAttribute("href",`${t}/${a}/index.html`),window.location.pathname.includes(a)&&e.classList.add("current")});try{const e=r.querySelector("#main-hamburger"),a=r.querySelector("#header-menu");if(e&&a){e.addEventListener("click",i=>{const l=a.classList.toggle("open");e.setAttribute("aria-expanded",l?"true":"false")}),document.addEventListener("click",i=>{if(!r.contains(i.target)){a.classList.contains("open")&&(a.classList.remove("open"),e.setAttribute("aria-expanded","false"));return}!a.contains(i.target)&&i.target!==e&&a.classList.contains("open")&&(a.classList.remove("open"),e.setAttribute("aria-expanded","false"))}),document.addEventListener("keydown",i=>{i.key==="Escape"&&a.classList.contains("open")&&(a.classList.remove("open"),e.setAttribute("aria-expanded","false"))});const o=window.matchMedia("(min-width: 800px)"),c=()=>{o.matches&&(a.classList.contains("open")&&a.classList.remove("open"),e.setAttribute("aria-expanded","false"))};try{typeof o.addEventListener=="function"?o.addEventListener("change",c):typeof o.addListener=="function"&&o.addListener(c)}catch{}c()}}catch(e){console.warn("Hamburger wiring failed",e)}try{n.innerHTML=y||"",n.querySelector("#social-media").querySelectorAll("img").forEach(function(a){const o=a.dataset.name;a.setAttribute("src",`${t}/images/${o}.svg`)});try{const a=new Date().getFullYear(),o=n.querySelector("#currentYear");o&&(o.textContent=String(a))}catch{}}catch(e){console.warn("Footer insertion failed",e)}}catch(s){console.error("Error loading partial: ",s)}}const w="AIzaSyA-Ip6-JCeCovgWWG6TijYI2SdLQdHTU84";class S{constructor(n){this.sourceURL=n,this.data}async getData(){try{const n=await fetch(this.sourceURL);try{console.log("ExternalData.getData response",{url:this.sourceURL,ok:n.ok,status:n.status})}catch{}if(!n.ok)return console.error(`ExternalData.getData: network error ${n.status} ${n.statusText} for ${this.sourceURL}`),null;let t;try{t=await n.clone().json();try{console.log("ExternalData.getData body",t)}catch{}}catch(e){return console.error(`ExternalData.getData: invalid JSON from ${this.sourceURL}:`,e),null}const s=t&&Object.prototype.hasOwnProperty.call(t,"Result")?t.Result:t;return s==null?(console.warn(`ExternalData.getData: no data returned from ${this.sourceURL}`),null):(this.data=s,this.data)}catch(n){return console.error(`ExternalData.getData: fetch failed for ${this.sourceURL}:`,n),null}}}const d="favoriteRestaurants_v1",f="favoriteDestinations_v1";function g(){try{const r=JSON.parse(localStorage.getItem(d)||"[]"),n=JSON.parse(localStorage.getItem(f)||"[]");return{restaurants:Array.isArray(r)?r:[],destinations:Array.isArray(n)?n:[]}}catch(r){return console.warn("loadFavorites: corrupt data, resetting",r),localStorage.removeItem(d),localStorage.removeItem(f),{restaurants:[],destinations:[]}}}function v({restaurants:r=[],destinations:n=[]}={}){localStorage.setItem(d,JSON.stringify(r)),localStorage.setItem(f,JSON.stringify(n))}function D(r,n="destination"){const t=g();return n==="restaurant"?t.restaurants.includes(r):t.destinations.includes(r)}function E(r,n="destination"){const t=g();if(n==="restaurant"){const s=new Set(t.restaurants);s.has(r)?s.delete(r):s.add(r),t.restaurants=Array.from(s)}else{const s=new Set(t.destinations);s.has(r)?s.delete(r):s.add(r),t.destinations=Array.from(s)}return v(t),t}function x(r,n=250){let t=null;return(...s)=>{t&&clearTimeout(t),t=setTimeout(()=>r(...s),n)}}class L{constructor(n=3,t=4,s=300){this.concurrency=n,this.queue=[],this.active=0,this.maxRetries=t,this.baseDelay=s}enqueue(n,t,s=0){return new Promise(e=>{this.queue.push({img:n,src:t,resolve:e,attempts:s}),this._next()})}_next(){if(this.active>=this.concurrency||this.queue.length===0)return;const n=this.queue.shift(),{img:t,src:s,resolve:e,attempts:a}=n;this.active++;let o=!1;const c=()=>l(!0),i=()=>l(!1),l=m=>{if(o)return;o=!0;try{t.removeEventListener("load",c),t.removeEventListener("error",i)}catch{}if(this.active--,setTimeout(()=>this._next(),0),m)return e(!0);const u=(a||0)+1;if(u<=this.maxRetries){const h=Math.round(this.baseDelay*Math.pow(2,u-1)+Math.random()*this.baseDelay);setTimeout(()=>{this.queue.push({img:t,src:s,resolve:e,attempts:u}),this._next()},h)}else e(!1)};t.addEventListener("load",c),t.addEventListener("error",i);try{t.src=s}catch{l(!1)}}}const A=new L(2,6,500);export{S as ExternalData,x as debounce,w as googleKey,A as imageLoader,D as isFavorite,g as loadFavorites,b as loadHeaderFooter,v as saveFavorites,E as toggleFavorite};
