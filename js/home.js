/* Начална страница: избрани продукти, категории, банер „Намаление“ */
App.onReady(function () {
  var list = App.products();
  var featured = document.getElementById("featured");
  if (!list) {
    featured.innerHTML = '<p class="notice error">' + App.escapeHtml(App.t("common.loadError")) + "</p>";
    return;
  }

  // Избрани: продуктите с отметка "featured"; ако няма такива, първите 4.
  var picked = list.filter(function (p) { return p.featured; });
  if (!picked.length) picked = list.slice(0, 4);
  featured.innerHTML = picked.slice(0, 8).map(App.productCard).join("");

  document.getElementById("cats").innerHTML = App.CATEGORIES.map(function (c) {
    var n = list.filter(function (p) { return p.category === c; }).length;
    return '<a class="cat-tile" href="catalog.html?cat=' + c + '">' + App.icons[c] +
      "<span>" + App.escapeHtml(App.t("cat." + c)) + "</span>" +
      "<small>" + App.escapeHtml(n ? App.t("cat.count", { n: n }) : App.t("cat.soon")) + "</small></a>";
  }).join("");

  var sale = list.filter(function (p) { return p.sale; });
  var section = document.getElementById("sale-section");
  section.hidden = !sale.length;
  document.getElementById("sale-grid").innerHTML = sale.slice(0, 4).map(App.productCard).join("");
});
