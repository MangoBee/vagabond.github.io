// Only search main rules/equipment pages – no class pages.
const PAGES_TO_SEARCH = [
  { title: "Main Page",       url: "index.html" },
  { title: "Stats & Skills",  url: "skills.html" },
  { title: "Advancement",     url: "advencement.html" },
  { title: "Perks",           url: "perks.html" },
  { title: "Magic",           url: "magic.html" },
  { title: "Basics",          url: "basics.html" },
  { title: "Adventuring",     url: "adventuring.html" },
  { title: "Encounters",      url: "encounters.html" },
  { title: "Exploration",     url: "exploration.html" },
  { title: "Downtime",        url: "downtime.html" },
  { title: "Armory",          url: "armory.html" },
  { title: "Crafting",        url: "crafting.html" },
  { title: "Expedition",      url: "expidition.html" },
  { title: "Knowledge",       url: "knowledge.html" },
  { title: "Gear",            url: "gear.html" },
];

// Page priority for ranking:
// 0 = highest priority, bigger numbers = lower priority
const PAGE_PRIORITY = {
  "basics.html":      0, // Basics first
  "skills.html":      1, // then Stats & Skills
  "adventuring.html": 2,
  "encounters.html":  2,
  "exploration.html": 2,
  "downtime.html":    2,
  "magic.html":       3,
  "advencement.html": 3,
  "armory.html":      4,
  "crafting.html":    4,
  "expidition.html":  4,
  "perks.html":       4,
  "index.html":       10,
  // everything else defaults to 4
};

// Fetch and parse a page as DOM
async function fetchPageDOM(url) {
  try {
    const res = await fetch(url);
    const html = await res.text();
    return new DOMParser().parseFromString(html, "text/html");
  } catch (e) {
    console.warn("Could not fetch:", url, e);
    return null;
  }
}

// Highlight all matches of queryLower inside element el, return HTML string
function highlightElementHTML(el, queryLower, doc) {
  const clone = el.cloneNode(true);
  const walker = doc.createTreeWalker(clone, NodeFilter.SHOW_TEXT, null);
  const qLen = queryLower.length;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.nodeValue;
    const lower = text.toLowerCase();

    if (!lower.includes(queryLower)) continue;

    const frag = doc.createDocumentFragment();
    let lastIndex = 0;
    let index;

    while ((index = lower.indexOf(queryLower, lastIndex)) !== -1) {
      if (index > lastIndex) {
        frag.appendChild(doc.createTextNode(text.slice(lastIndex, index)));
      }
      const span = doc.createElement("span");
      span.className = "search-highlight";
      span.textContent = text.slice(index, index + qLen);
      frag.appendChild(span);
      lastIndex = index + qLen;
    }

    if (lastIndex < text.length) {
      frag.appendChild(doc.createTextNode(text.slice(lastIndex)));
    }

    node.parentNode.replaceChild(frag, node);
  }

  return clone.innerHTML;
}

// Get the first sentence from a paragraph element
function getFirstSentenceFromParagraph(pEl) {
  if (!pEl) return "";
  const paraText = (pEl.textContent || "").trim();
  if (!paraText) return "";

  const match = paraText.match(/(.+?[.!?])(\s|$)/);
  return (match ? match[1] : paraText).trim();
}

// Escape plain text for safe HTML injection
function escapeHTML(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Search a single page and return the *best* result object or null
async function searchPageForQuery(page, queryLower) {
  const doc = await fetchPageDOM(page.url);
  if (!doc) return null;

  // Now we care about headings, text blocks, and table cells
  const blocks = doc.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,th,td");

  let currentSectionTitle = null;
  let currentSectionId = null;
  let blockIndex = 0;
  let bestResult = null;

  for (const el of blocks) {
    const tag = el.tagName.toLowerCase();

    // Skip anything in the sidebar / nav (<aside>)
    if (el.closest("aside")) {
      blockIndex++;
      continue;
    }

    // Update section info when we hit a heading
    if (/^h[1-6]$/.test(tag)) {
      currentSectionTitle = el.textContent.trim();
      const sectionContainer =
        el.closest("article, section, div.card, div[id]") || el;
      currentSectionId = sectionContainer.id || null;
      // note: we still allow the heading itself to be searched below
    }

    const text = el.textContent || "";
    const lower = text.toLowerCase();
    const idx = lower.indexOf(queryLower);

    if (idx !== -1) {
      // ---- We found a match in this element ----
      let snippetHTML;

      const isHeading = /^h[1-6]$/.test(tag);
      const isExactHeadingMatch =
        // prioritize exact matches for H1–H4
        /^h[1-4]$/.test(tag) &&
        text.trim().toLowerCase() === queryLower;

      if (isHeading) {
        // Match in a heading (e.g. spell name, stat name)
        const headingHTML = highlightElementHTML(el, queryLower, doc);

        // Try to grab the first following <p> for the description sentence
        let para = el.nextElementSibling;
        while (para && para.tagName.toLowerCase() !== "p") {
          // Stop if we hit another heading (new section)
          if (/^h[1-6]$/.test(para.tagName.toLowerCase())) break;
          para = para.nextElementSibling;
        }

        const sentence = getFirstSentenceFromParagraph(para);
        if (sentence) {
          snippetHTML = `<strong>${headingHTML}</strong> — ${escapeHTML(
            sentence
          )}`;
        } else {
          snippetHTML = `<strong>${headingHTML}</strong>`;
        }
      } else if (tag === "td" || tag === "th") {
        // Match in a table cell: show the whole row
        const row = el.closest("tr");
        if (row) {
          snippetHTML = highlightElementHTML(row, queryLower, doc);
        } else {
          snippetHTML = highlightElementHTML(el, queryLower, doc);
        }
      } else {
        // Normal case: paragraphs, list items, etc.
        snippetHTML = highlightElementHTML(el, queryLower, doc);
      }

      // Build URL with hash if we have a section id
      const baseUrl = page.url;
      const urlWithHash = currentSectionId
        ? `${baseUrl}#${currentSectionId}`
        : baseUrl;

      // --- Relevance score within this page ---
      // Tag weight: headings > paragraphs/lists > table cells
      let tagWeight;
      if (isHeading) {
        tagWeight = 3; // top
      } else if (tag === "p" || tag === "li") {
        tagWeight = 2; // mid
      } else if (tag === "td" || tag === "th") {
        tagWeight = 1; // lowest
      } else {
        tagWeight = 1;
      }

      // Earlier blocks & earlier positions get a slight bonus
      const positionBonus = Math.max(0, 1000 - blockIndex * 5 - idx);
      const score = tagWeight * 1000 + positionBonus;

      const candidate = {
        title: page.title,
        pageUrl: page.url,
        sectionTitle: currentSectionTitle, // may be null
        sectionId: currentSectionId,       // may be null
        url: urlWithHash,
        snippetHTML,
        score,
        exactHeadingMatch: isExactHeadingMatch,
      };

      if (!bestResult || candidate.score > bestResult.score) {
        bestResult = candidate;
      }
    }

    blockIndex++;
  }

  return bestResult;
}

async function searchSite(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results = [];

  for (const page of PAGES_TO_SEARCH) {
    const result = await searchPageForQuery(page, q);
    if (result) results.push(result);
  }

  // --- Sort results ---
  // 1) exact heading matches first
  // 2) then by page priority
  // 3) then by relevance score
  results.sort((a, b) => {
    const aExact = !!a.exactHeadingMatch;
    const bExact = !!b.exactHeadingMatch;

    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    const baseA = a.pageUrl.split("#")[0];
    const baseB = b.pageUrl.split("#")[0];

    const priA = PAGE_PRIORITY[baseA] ?? 4;
    const priB = PAGE_PRIORITY[baseB] ?? 4;

    if (priA !== priB) {
      return priA - priB; // lower = higher priority
    }

    // Within same group, higher score first
    return b.score - a.score;
  });

  return results;
}

function renderResults(results, query) {
  const container = document.getElementById("search-results");
  container.innerHTML = "";

  if (!query.trim()) return;

  if (results.length === 0) {
    container.textContent = `No results found for "${query}".`;
    return;
  }

  const heading = document.createElement("p");
  heading.textContent = `Results for "${query}":`;
  container.appendChild(heading);

  for (const result of results) {
    const div = document.createElement("div");
    div.className = "search-result";

    const a = document.createElement("a");
    a.className = "search-result-title";

    // "Stats & Skills | Might"
    a.textContent = result.sectionTitle
      ? `${result.title} | ${result.sectionTitle}`
      : result.title;

    a.href = result.url;

    const snippet = document.createElement("p");
    snippet.className = "search-result-snippet";

    if (result.snippetHTML) {
      snippet.innerHTML = result.snippetHTML; // with <span class="search-highlight">
    }

    div.appendChild(a);
    div.appendChild(snippet);
    container.appendChild(div);
  }
}

// Highlight the section when arriving via #hash (whole card glow)
function highlightFromHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;

  const el = document.getElementById(hash);
  if (!el) return;

  el.classList.add("search-hit");
  el.scrollIntoView({ behavior: "smooth", block: "start" });

  setTimeout(() => {
    el.classList.remove("search-hit");
  }, 2500);
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const clearBtn = document.getElementById("search-clear");
  const resultsContainer = document.getElementById("search-results");

  const classToggle = document.getElementById("class-toggle");
  const classDropdown = document.getElementById("class-dropdown");

  let typingTimeout = null;

  async function runSearch(query) {
    const trimmed = query.trim();
    if (!trimmed) {
      resultsContainer.innerHTML = "";
      return;
    }
    const results = await searchSite(trimmed);
    renderResults(results, trimmed);
  }

  // Submit still works (Enter key or clicking Search)
  if (form && input) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const query = input.value;
      runSearch(query);
    });
  }

  // Search as you type (debounced)
  if (input && resultsContainer) {
    input.addEventListener("input", () => {
      const query = input.value;
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        runSearch(query);
      }, 250); // adjust delay if you want faster/slower
    });
  }

  // Clear button ✕
  if (clearBtn && input && resultsContainer) {
    clearBtn.addEventListener("click", () => {
      clearTimeout(typingTimeout);
      input.value = "";
      resultsContainer.innerHTML = "";
      input.focus();
    });
  }

  // Classes dropdown toggle
  if (classToggle && classDropdown) {
    classToggle.addEventListener("click", () => {
      const isHidden = classDropdown.hasAttribute("hidden");
      if (isHidden) {
        classDropdown.removeAttribute("hidden");
        classToggle.setAttribute("aria-expanded", "true");
      } else {
        classDropdown.setAttribute("hidden", "");
        classToggle.setAttribute("aria-expanded", "false");
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (event) => {
      if (
        !classDropdown.contains(event.target) &&
        !classToggle.contains(event.target)
      ) {
        if (!classDropdown.hasAttribute("hidden")) {
          classDropdown.setAttribute("hidden", "");
          classToggle.setAttribute("aria-expanded", "false");
        }
      }
    });
  }

  // If we arrived with a #section in the URL, highlight it
  highlightFromHash();
});
