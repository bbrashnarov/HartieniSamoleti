/* Страница на продукт: голяма снимка, име, цена, описание, „Добави в количката“ */
(function () {
  var qty = 1;
  var current = 0;

  function render() {
    var box = document.getElementById("product");
    var p = App.findProduct(App.param("id"));
    if (!App.products()) {
      box.innerHTML = '<p class="notice error">' + App.escapeHtml(App.t("common.loadError")) + "</p>";
      return;
    }
    if (!p) {
      box.innerHTML = '<div class="empty-state"><p>' + App.escapeHtml(App.t("product.notFound")) +
        '</p><a class="btn" href="catalog.html">' + App.escapeHtml(App.t("nav.catalog")) + "</a></div>";
      return;
    }

    var name = App.loc(p.name);
    document.title = name + " | " + App.t("brand.name");
    var images = p.images && p.images.length ? p.images : ["images/logo.jpg"];
    if (current >= images.length) current = 0;

    box.innerHTML =
      '<div class="product">' +
      "<div>" +
      '<div class="gallery-main">' +
      (p.sale ? '<span class="badge-sale">' + App.escapeHtml(App.t("product.sale")) + "</span>" : "") +
      '<img id="main-img" src="' + App.escapeHtml(images[current]) + '" alt="' + App.escapeHtml(name) + '"></div>' +
      (images.length > 1 ? '<div class="thumbs">' + images.map(function (src, i) {
        return '<button type="button" data-i="' + i + '" aria-current="' + (i === current) + '"><img src="' +
          App.escapeHtml(src) + '" alt=""></button>';
      }).join("") + "</div>" : "") +
      "</div>" +
      '<div class="product-info">' +
      '<span class="card-cat">' + App.escapeHtml(App.t("cat." + p.category)) + "</span>" +
      "<h1>" + App.escapeHtml(name) + "</h1>" +
      '<span class="price">' + App.priceHtml(p) + "</span>" +
      "<p>" + App.escapeHtml(App.loc(p.description)) + "</p>" +
      '<div class="qty-row">' +
      '<div class="qty" role="group" aria-label="' + App.escapeHtml(App.t("product.qty")) + '">' +
      '<button type="button" data-q="-1" aria-label="' + App.escapeHtml(App.t("cart.decrease")) + '">−</button>' +
      '<span id="qty">' + qty + "</span>" +
      '<button type="button" data-q="1" aria-label="' + App.escapeHtml(App.t("cart.increase")) + '">+</button>' +
      "</div>" +
      '<button type="button" class="btn" id="add">' + App.escapeHtml(App.t("product.add")) + "</button>" +
      "</div></div></div>";

    box.querySelectorAll(".thumbs button").forEach(function (b) {
      b.addEventListener("click", function () {
        current = Number(b.getAttribute("data-i"));
        render();
      });
    });
    box.querySelectorAll("[data-q]").forEach(function (b) {
      b.addEventListener("click", function () {
        qty = Math.max(1, Math.min(99, qty + Number(b.getAttribute("data-q"))));
        document.getElementById("qty").textContent = qty;
      });
    });
    document.getElementById("add").addEventListener("click", function () {
      App.addToCart(p.id, qty);
      App.toast(App.t("product.added"));
    });

    var related = App.products().filter(function (o) { return o.id !== p.id && o.category === p.category; }).slice(0, 4);
    document.getElementById("related-section").hidden = !related.length;
    document.getElementById("related").innerHTML = related.map(App.productCard).join("");
  }

  App.onReady(render);
})();
