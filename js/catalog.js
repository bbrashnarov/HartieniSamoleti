/* Каталог: филтър по категория и търсене по име (на двата езика) */
(function () {
  var state = {
    cat: App.param("cat") || (App.param("sale") ? "sale" : "all"),
    q: App.param("q") || ""
  };

  function norm(s) { return String(s || "").toLowerCase().trim(); }

  function render() {
    var list = App.products();
    var grid = document.getElementById("grid");
    if (!list) {
      grid.innerHTML = '<p class="notice error">' + App.escapeHtml(App.t("common.loadError")) + "</p>";
      return;
    }

    var chips = ["all"].concat(App.CATEGORIES);
    if (list.some(function (p) { return p.sale; })) chips.push("sale");
    document.getElementById("chips").innerHTML = chips.map(function (c) {
      return '<button type="button" class="chip" data-cat="' + c + '" aria-pressed="' + (state.cat === c) + '">' +
        App.escapeHtml(App.t("cat." + c)) + "</button>";
    }).join("");

    var q = norm(state.q);
    var shown = list.filter(function (p) {
      if (state.cat === "sale" && !p.sale) return false;
      if (state.cat !== "all" && state.cat !== "sale" && p.category !== state.cat) return false;
      if (!q) return true;
      var hay = norm((p.name && p.name.bg) + " " + (p.name && p.name.en));
      return hay.indexOf(q) !== -1;
    });

    document.getElementById("found").textContent = App.t("catalog.found", { n: shown.length });
    grid.innerHTML = shown.length
      ? shown.map(App.productCard).join("")
      : '<div class="empty-state" style="grid-column:1/-1">' + App.escapeHtml(App.t("catalog.none")) + "</div>";
  }

  function syncUrl() {
    var p = new URLSearchParams();
    if (state.cat !== "all") p.set("cat", state.cat);
    if (state.q) p.set("q", state.q);
    var s = p.toString();
    history.replaceState(null, "", location.pathname + (s ? "?" + s : ""));
  }

  document.addEventListener("DOMContentLoaded", function () {
    var input = document.getElementById("search");
    input.value = state.q;
    input.addEventListener("input", function () {
      state.q = input.value;
      syncUrl();
      render();
    });
    document.getElementById("chips").addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      state.cat = b.getAttribute("data-cat");
      syncUrl();
      render();
    });
  });

  App.onReady(render);
})();
