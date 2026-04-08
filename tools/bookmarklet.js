/**
 * SCQ Paper Database — Browser Bookmarklet
 *
 * This file contains both:
 * 1. A minified, single-line bookmarklet for the browser bookmarks bar
 * 2. A readable, commented source version for reference
 *
 * === MINIFIED VERSION (drag this to bookmarks bar) ===
 * javascript:(function(){function e(t){let a=document.querySelector(`meta[name="${t}"]`)||document.querySelector(`meta[property="${t}"]`);return a?a.getAttribute("content"):""}let t=e("citation_doi")||e("DC.identifier"),a=e("citation_title")||document.title,i=e("citation_author")||e("author"),n=e("citation_abstract")||e("description")||"",r=window.location.href,o={url:r,title:a,authors:i?[i]:[],abstract:n,doi:t,source:"webpage"},c=/arxiv\.org\/abs\/(\d{4}\.\d{4,5})/i.exec(r);if(c&&(o.arxivId=c[1]),!o.doi&&!o.arxivId)return alert("No arXiv ID or DOI found on this page.");fetch("http://localhost:8080/api/bookmarklet",{method:"POST",mode:"no-cors",headers:{"Content-Type":"application/json"},body:JSON.stringify(o)}).then(()=>{let e=document.createElement("div");e.textContent="✓ Sent to SCQ Database",e.style.cssText="position:fixed;top:16px;right:16px;background:#3fb950;color:white;padding:12px 16px;border-radius:6px;font-family:system-ui;font-size:14px;z-index:999999;box-shadow:0 2px 8px rgba(0,0,0,0.3)",document.body.appendChild(e),setTimeout(()=>e.remove(),2500)}).catch(t=>{console.error("Bookmarklet error:",t);let a=document.createElement("div");a.textContent="✗ Error sending to database",a.style.cssText="position:fixed;top:16px;right:16px;background:#f85149;color:white;padding:12px 16px;border-radius:6px;font-family:system-ui;font-size:14px;z-index:999999;box-shadow:0 2px 8px rgba(0,0,0,0.3)",document.body.appendChild(a),setTimeout(()=>a.remove(),2500)})})();
 *
 * === READABLE SOURCE (below) ===
 */

// ── Readable bookmarklet source (for reference, do not use directly) ────

function getMetaTag(name) {
  let elem = document.querySelector(`meta[name="${name}"]`) ||
             document.querySelector(`meta[property="${name}"]`);
  return elem ? elem.getAttribute("content") : "";
}

function capturePageMetadata() {
  // Try various DOI sources
  let doi = getMetaTag("citation_doi") ||
            getMetaTag("DC.identifier") ||
            getMetaTag("doi");

  // Title: citation_title > og:title > page title
  let title = getMetaTag("citation_title") ||
              getMetaTag("og:title") ||
              document.title;

  // Authors: might be a single string with commas or 'and'
  let author = getMetaTag("citation_author") ||
               getMetaTag("author");
  let authors = author ? [author] : [];

  // Abstract / description
  let abstract = getMetaTag("citation_abstract") ||
                 getMetaTag("description") ||
                 "";

  // Page URL
  let url = window.location.href;

  // Build payload
  let payload = {
    url: url,
    title: title,
    authors: authors,
    abstract: abstract,
    doi: doi || null,
    source: "webpage"
  };

  // Check for arXiv page
  let arxivMatch = /arxiv\.org\/abs\/(\d{4}\.\d{4,5})/i.exec(url);
  if (arxivMatch) {
    payload.arxivId = arxivMatch[1];
  }

  return payload;
}

function sendToDatabase(payload) {
  // Require either arXiv ID or DOI
  if (!payload.doi && !payload.arxivId) {
    alert("No arXiv ID or DOI found on this page.");
    return;
  }

  fetch("http://localhost:8080/api/bookmarklet", {
    method: "POST",
    mode: "no-cors",  // Fallback if CORS headers missing
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
  .then(() => {
    // Success notification
    let notification = document.createElement("div");
    notification.textContent = "✓ Sent to SCQ Database";
    notification.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      background: #3fb950;
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-family: system-ui;
      font-size: 14px;
      z-index: 999999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2500);
  })
  .catch(error => {
    console.error("Bookmarklet error:", error);
    // Error notification
    let notification = document.createElement("div");
    notification.textContent = "✗ Error sending to database";
    notification.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      background: #f85149;
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-family: system-ui;
      font-size: 14px;
      z-index: 999999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2500);
  });
}

// Main entry point
(function() {
  let metadata = capturePageMetadata();
  sendToDatabase(metadata);
})();
