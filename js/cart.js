/* Количка: промяна на количество, премахване, обща сума */
(function () {
  function render() {
    var box = document.getElementById("cart");
    if (!App.products()) {
      box.innerHTML = '<p class="notice error">' + App.escapeHtml(App.t("common.loadError")) + "</p>";
      return;
    }
    var lines = App.cartLines();
    if (!lines.length) {
      box.innerHTML = '<div class="empty-state"><p>' + App.escapeHtml(App.t("cart.empty")) +
        '</p><a class="btn" href="catalog.html">' + App.escapeHtml(App.t("nav.catalog")) + "</a></div>";
      return;
    }

    box.innerHTML =
      '<div class="cart-layout">' +
      '<div class="panel">' + lines.map(function (l) {
        var p = l.product;
        var img = (p.images && p.images[0]) || "images/logo.jpg";
        var url = "product.html?id=" + encodeURIComponent(p.id);
        return '<div class="cart-item" data-id="' + App.escapeHtml(p.id) + '">' +
          '<a href="' + url + '"><img src="' + App.escapeHtml(img) + '" alt=""></a>' +
          "<div>" +
          '<a href="' + url + '">' + App.escapeHtml(App.loc(p.name)) + "</a>" +
          '<div class="muted">' + App.escapeHtml(App.formatPrice(p.price)) + "</div>" +
          '<div class="cart-item-actions">' +
          '<div class="qty">' +
          '<button type="button" data-act="dec" aria-label="' + App.escapeHtml(App.t("cart.decrease")) + '">−</button>' +
          "<span>" + l.qty + "</span>" +
          '<button type="button" data-act="inc" aria-label="' + App.escapeHtml(App.t("cart.increase")) + '">+</button>' +
          "</div>" +
          "<strong>" + App.escapeHtml(App.formatPrice(l.sum)) + "</strong>" +
          '<button type="button" class="link-btn" data-act="remove">' + App.escapeHtml(App.t("cart.remove")) + "</button>" +
          "</div></div></div>";
      }).join("") + "</div>" +
      '<aside class="panel">' +
      '<div class="summary-row"><span>' + App.escapeHtml(App.t("cart.subtotal")) + "</span><span>" + App.escapeHtml(App.formatPrice(App.cartTotal())) + "</span></div>" +
      '<div class="summary-row"><span>' + App.escapeHtml(App.t("cart.shipping")) + '</span><span class="summary-note">' + App.escapeHtml(App.t("cart.shippingNote")) + "</span></div>" +
      '<div class="summary-row total"><span>' + App.escapeHtml(App.t("cart.total")) + "</span><span>" + App.escapeHtml(App.formatPrice(App.cartTotal())) + "</span></div>" +
      '<a class="btn btn-block" href="checkout.html" style="margin-top:14px">' + App.escapeHtml(App.t("cart.checkout")) + "</a>" +
      '<a class="btn btn-light btn-block" href="catalog.html" style="margin-top:10px">' + App.escapeHtml(App.t("cart.continue")) + "</a>" +
      "</aside></div>";
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("cart").addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]");
      if (!b) return;
      var id = b.closest(".cart-item").getAttribute("data-id");
      var item = App.getCart().filter(function (i) { return i.id === id; })[0];
      if (!item) return;
      var act = b.getAttribute("data-act");
      if (act === "remove" || (act === "dec" && item.qty <= 1)) App.removeFromCart(id);
      else App.setQty(id, item.qty + (act === "inc" ? 1 : -1));
      render();
    });
  });

  App.onReady(render);
})();
