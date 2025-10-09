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
        console.log(navLinks);
        navLinks.forEach(function (link) {
            const page = link.dataset.page;
            link.setAttribute('href', `${base}/${page}/index.html`)

            // Checks which page is active for wayfinding by finding the <a> element whose "data-page" matches the current pathname. 
            // Add an special class for styling. 
            if (window.location.pathname.includes(page)) {
                link.classList.add('current');
            }
        });
    } catch (error) {
        console.error('Error loading partial: ', error);
    }

    
}