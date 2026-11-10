function debounce(func, wait) {
    var timeout;
    return function () {
        var context = this, args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(function () {
            func.apply(context, args);
        }, wait);
    };
}

document.addEventListener("DOMContentLoaded", function () {
    var searchInput = document.getElementById("search-input");
    var resultsContainer = document.getElementById("search-results");
    var searchContainer = document.querySelector(".search-container");

    if (!searchInput || !resultsContainer) return;

    var indexUrl = (searchContainer && searchContainer.getAttribute("data-search-index"))
        || "/search_index.en.json";

    var index = null;

    fetch(indexUrl)
        .then(function (response) {
            if (!response.ok) {
                throw new Error("HTTP " + response.status);
            }
            return response.json();
        })
        .then(function (data) {
            index = elasticlunr.Index.load(data);
            searchInput.removeAttribute("disabled");
            searchInput.setAttribute("placeholder", "Search...");
            if (searchInput.value.trim().length > 0) {
                doSearch();
            }
        })
        .catch(function (err) {
            console.error("Failed to load search index:", err);
            searchInput.removeAttribute("disabled");
            searchInput.setAttribute("placeholder", "Search...");
            resultsContainer.innerHTML = "<p class=\"search-no-results\">Failed to load search index at: " + indexUrl + "</p>";
        });

    function doSearch() {
        if (!index) return;

        var query = searchInput.value.trim();
        if (query.length === 0) {
            resultsContainer.innerHTML = "";
            return;
        }

        var results = index.search(query, {
            bool: "OR",
            fields: {
                title: { boost: 3 },
                description: { boost: 2 },
                body: { boost: 1 }
            }
        });

        if (results.length === 0) {
            resultsContainer.innerHTML = "<p class=\"search-no-results\">No results found.</p>";
            return;
        }

        var html = "<ul class=\"search-results-list\">";
        results.forEach(function (result) {
            var doc = index.documentStore.getDoc(result.ref);
            if (!doc) return;

            var title = doc.title || result.ref;
            var description = doc.description || "";
            var body = doc.body || "";
            var snippet = description || body.substring(0, 200);

            html += "<li class=\"search-result-item\">";
            html += "<h2 class=\"search-result-title\"><a href=\"" + result.ref + "\">" + title + "</a></h2>";
            if (snippet) {
                html += "<div class=\"search-result-snippet\">" + snippet + "</div>";
            }
            html += "</li>";
        });
        html += "</ul>";

        resultsContainer.innerHTML = html;
    }

    searchInput.addEventListener("input", debounce(doSearch, 200));
});
