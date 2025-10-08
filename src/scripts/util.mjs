// Async loader for header and footer. Uses fetch + await and works in dev
// and after the Vite build (uses import.meta.env.BASE_URL).
export async function loadHeaderFooter() {
    const headerElement = document.getElementById('dynamic-header');
    const footerElement = document.getElementById('dynamic-footer');
    const base = import.meta.env.BASE_URL;
    try {
        const header = await fetch(`${base}/partials/header.html`);
        const footer = await fetch(`${base}/partials/footer.html`);
        if (!header.ok || !footer.ok) throw new Error(`Partial not found`);
        const headerHtml = await header.text();
        const footerHtml = await footer.text();
        headerElement.innerHTML = headerHtml;
        footerElement.innerHTML = footerHtml;
    } catch (error) {
        console.error('Error loading partial: ', error);
    }
}