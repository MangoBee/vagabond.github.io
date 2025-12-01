document.addEventListener('DOMContentLoaded', () => {
  // Attach to all search forms on the page (header + sidebar)
  const searchForms = document.querySelectorAll('form.search-box');

  searchForms.forEach(form => {
    const input = form.querySelector('input[type="search"]');
    if (!input) return;

    // Submit handler (Enter key in some browsers)
    form.addEventListener('submit', event => {
      event.preventDefault();
      runSiteSearch(input.value);
    });

    // Explicitly handle Enter in the input
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runSiteSearch(input.value);
      }
    });
  });

  function runSiteSearch(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return;

    // Things we’ll search through:
    const candidates = document.querySelectorAll(
      'h1, h2, h3, h4, .link-list a, .contents-list a'
    );

    let match = null;

    for (const el of candidates) {
      const text = el.textContent.toLowerCase();
      if (text.includes(q)) {
        match = el;
        break;
      }
    }

    if (!match) {
      alert(`No matching section found for "${query}".`);
      return;
    }

    // If it’s a sidebar/contents link, follow its #hash target
    let targetElement = match;
    const href = match.getAttribute('href');
    if (href && href.startsWith('#')) {
      const id = href.slice(1);
      const byId = document.getElementById(id);
      if (byId) targetElement = byId;
    }

    // Scroll and flash highlight
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    targetElement.classList.add('search-hit');
    setTimeout(() => {
      targetElement.classList.remove('search-hit');
    }, 1500);
  }
});
