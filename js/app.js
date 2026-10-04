/*
 * Хартиени Самолети: общ код за всички страници на магазина.
 * Езици, хедър и футър, продукти, количка, помощни функции.
 */
(function () {
  "use strict";

  var LANG_KEY = "hs_lang";
  var CART_KEY = "hs_cart";
  var CATEGORIES = ["bags", "cards", "bookmarks", "notebooks", "giftsets"];

  var dict = {};
  var products = null;
  var readyCallbacks = [];

  // ---------- Безопасна работа с localStorage ----------
  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { return null; }
  }

  // ---------- Иконки (дебел черен контур, като самолета) ----------
  var S = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  var icons = {
    cart: '<svg ' + S + '><path d="M6 8h5l4 22h22l4-15H14"/><circle cx="18" cy="38" r="3"/><circle cx="34" cy="38" r="3"/></svg>',
    menu: '<svg ' + S + '><path d="M9 14h30M9 24h30M9 34h30"/></svg>',
    search: '<svg ' + S + '><circle cx="21" cy="21" r="12"/><path d="M30 30l9 9"/></svg>',
    plane: '<svg ' + S + '><path d="M42 6L5 21l14 5 3 14 6-9 10 5z" fill="#a3d3cf"/><path d="M19 26L42 6M22 40l3-10"/></svg>',
    bags: '<svg ' + S + '><path d="M9 17h30l-3 25H12z" fill="#fbf6ee"/><path d="M17 20v-6a7 7 0 0 1 14 0v6"/></svg>',
    cards: '<svg ' + S + '><rect x="7" y="12" width="34" height="24" rx="3" fill="#fbf6ee"/><path d="M7 14l17 12 17-12"/></svg>',
    bookmarks: '<svg ' + S + '><path d="M14 6h20v36l-10-8-10 8z" fill="#fbf6ee"/><path d="M24 14l1.8 3.8 4 .6-3 2.8.8 4-3.6-2-3.6 2 .8-4-3-2.8 4-.6z" fill="#e8c45a"/></svg>',
    notebooks: '<svg ' + S + '><rect x="11" y="6" width="28" height="36" rx="3" fill="#fbf6ee"/><path d="M11 13H7M11 21H7M11 29H7M11 37H7M18 15h14M18 22h10"/></svg>',
    giftsets: '<svg ' + S + '><rect x="7" y="18" width="34" height="9" rx="2" fill="#fbf6ee"/><path d="M10 27v14h28V27M24 18v23"/><path d="M24 18c-3-8-12-8-10-2 1 2 5 2 10 2zM24 18c3-8 12-8 10-2-1 2-5 2-10 2z"/></svg>',
    instagram: '<svg ' + S + '><rect x="8" y="8" width="32" height="32" rx="9"/><circle cx="24" cy="24" r="7"/><circle cx="34" cy="14" r="1.5" fill="currentColor"/></svg>',
    facebook: '<svg ' + S + '><path d="M28 42V26h6l1-6h-7v-4c0-2 1-3 3-3h4V7h-5c-6 0-8 3-8 8v5h-5v6h5v16"/></svg>'
  };

  // ---------- Езици ----------
  function getLang() {
    var l = store(LANG_KEY);
    return l === "en" ? "en" : "bg";
  }

  function t(key, vars) {
    var s = dict[key];
    if (s === undefined) return key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split("{" + k + "}").join(vars[k]);
      });
    }
    return s;
  }

  function loadDict(lang) {
    return fetch("i18n/" + lang + ".json", { cache: "no-cache" })
      .then(function (r) { return r.json(); })
      .then(function (d) { dict = d; });
  }

  function applyTranslations(root) {
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    root.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
    });
    var titleKey = document.body.getAttribute("data-title");
    if (titleKey) document.title = t(titleKey);
    document.documentElement.lang = getLang();
    document.querySelectorAll(".lang-switch button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === getLang()));
    });
  }

  function setLang(lang) {
    if (lang === getLang()) return;
    store(LANG_KEY, lang);
    loadDict(lang).then(function () {
      applyTranslations();
      runReady();
    });
  }

  // ---------- Помощни ----------
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function formatPrice(n) {
    var cur = (window.SHOP_CONFIG && window.SHOP_CONFIG.currency) || "EUR";
    try {
      return new Intl.NumberFormat(getLang() === "en" ? "en-IE" : "bg-BG", {
        style: "currency", currency: cur
      }).format(Number(n) || 0);
    } catch (e) {
      return (Number(n) || 0).toFixed(2) + " €";
    }
  }

  function loc(obj) {
    if (!obj) return "";
    if (typeof obj === "string") return obj;
    return obj[getLang()] || obj.bg || "";
  }

  function param(name) {
    return new URLSearchParams(location.search).get(name);
  }

  // ---------- Продукти ----------
  function loadProducts() {
    if (products) return Promise.resolve(products);
    // ?v= заобикаля кеша, за да се виждат веднага продуктите, добавени през админ панела
    return fetch("products.json?v=" + Date.now(), { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (list) {
        products = Array.isArray(list) ? list : [];
        return products;
      });
  }

  function findProduct(id) {
    return (products || []).filter(function (p) { return p.id === id; })[0] || null;
  }

  function priceHtml(p) {
    var html = escapeHtml(formatPrice(p.price));
    if (p.sale && p.oldPrice && Number(p.oldPrice) > Number(p.price)) {
      html += "<del>" + escapeHtml(formatPrice(p.oldPrice)) + "</del>";
    }
    return html;
  }

  function productCard(p) {
    var img = (p.images && p.images[0]) || "images/logo.jpg";
    return '<a class="card" href="product.html?id=' + encodeURIComponent(p.id) + '">' +
      (p.sale ? '<span class="badge-sale">' + escapeHtml(t("product.sale")) + "</span>" : "") +
      '<div class="card-img"><img src="' + escapeHtml(img) + '" alt="' + escapeHtml(loc(p.name)) + '" loading="lazy"></div>' +
      '<div class="card-body">' +
      '<span class="card-cat">' + escapeHtml(t("cat." + p.category)) + "</span>" +
      '<span class="card-title">' + escapeHtml(loc(p.name)) + "</span>" +
      '<span class="price">' + priceHtml(p) + "</span>" +
      "</div></a>";
  }

  // ---------- Количка ----------
  function getCart() {
    try {
      var c = JSON.parse(store(CART_KEY) || "[]");
      return Array.isArray(c) ? c.filter(function (i) { return i && i.id && i.qty > 0; }) : [];
    } catch (e) { return []; }
  }

  function saveCart(cart) {
    store(CART_KEY, JSON.stringify(cart));
    updateCartBadge();
  }

  function addToCart(id, qty) {
    var cart = getCart();
    var item = cart.filter(function (i) { return i.id === id; })[0];
    if (item) item.qty = Math.min(99, item.qty + qty);
    else cart.push({ id: id, qty: Math.min(99, qty) });
    saveCart(cart);
  }

  function setQty(id, qty) {
    var cart = getCart();
    cart.forEach(function (i) { if (i.id === id) i.qty = Math.max(1, Math.min(99, qty)); });
    saveCart(cart);
  }

  function removeFromCart(id) {
    saveCart(getCart().filter(function (i) { return i.id !== id; }));
  }

  function clearCart() { saveCart([]); }

  // Редовете от количката заедно с данните за продукта; липсващите продукти се пропускат.
  function cartLines() {
    return getCart().map(function (i) {
      var p = findProduct(i.id);
      return p ? { product: p, qty: i.qty, sum: Number(p.price) * i.qty } : null;
    }).filter(Boolean);
  }

  function cartTotal() {
    return cartLines().reduce(function (s, l) { return s + l.sum; }, 0);
  }

  function updateCartBadge() {
    var n = getCart().reduce(function (s, i) { return s + i.qty; }, 0);
    document.querySelectorAll(".cart-count").forEach(function (el) {
      el.textContent = n ? String(n) : "";
      el.setAttribute("data-n", String(n));
    });
  }

  function toast(msg) {
    var el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  // ---------- Хедър и футър ----------
  function renderChrome() {
    var page = document.body.getAttribute("data-page") || "";
    var cfg = window.SHOP_CONFIG || {};
    var header = document.getElementById("site-header");
    if (header) {
      header.innerHTML =
        '<div class="test-banner" data-i18n="testBanner"></div>' +
        '<div class="site-header"><div class="container header-inner">' +
        '<a class="brand" href="index.html"><img src="images/logo.jpg" alt="" width="56" height="56"><span data-i18n="brand.name"></span></a>' +
        '<nav class="main-nav" id="main-nav">' +
        '<a href="index.html"' + (page === "home" ? ' aria-current="page"' : "") + ' data-i18n="nav.home"></a>' +
        '<a href="catalog.html"' + (page === "catalog" ? ' aria-current="page"' : "") + ' data-i18n="nav.catalog"></a>' +
        '<a href="about.html"' + (page === "about" ? ' aria-current="page"' : "") + ' data-i18n="nav.about"></a>' +
        "</nav>" +
        '<div class="lang-switch" role="group" data-i18n-aria="lang.switch">' +
        '<button type="button" data-lang="bg">BG</button><button type="button" data-lang="en">EN</button></div>' +
        '<a class="icon-btn" href="cart.html" data-i18n-aria="nav.cart">' + icons.cart + '<span class="cart-count"></span></a>' +
        '<button class="icon-btn menu-toggle" type="button" aria-controls="main-nav" aria-expanded="false" data-i18n-aria="nav.menu">' + icons.menu + "</button>" +
        "</div></div>";

      header.querySelectorAll(".lang-switch button").forEach(function (b) {
        b.addEventListener("click", function () { setLang(b.getAttribute("data-lang")); });
      });
      var toggle = header.querySelector(".menu-toggle");
      var nav = header.querySelector(".main-nav");
      toggle.addEventListener("click", function () {
        var open = nav.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
      });
    }

    var footer = document.getElementById("site-footer");
    if (footer) {
      footer.innerHTML =
        '<footer class="site-footer"><div class="container footer-inner">' +
        '<div class="footer-social">' +
        '<a class="icon-btn" href="' + escapeHtml(cfg.instagram) + '" target="_blank" rel="noopener" aria-label="Instagram">' + icons.instagram + "</a>" +
        '<a class="icon-btn" href="' + escapeHtml(cfg.facebook) + '" target="_blank" rel="noopener" aria-label="Facebook">' + icons.facebook + "</a>" +
        "</div>" +
        '<nav class="footer-links">' +
        '<a href="catalog.html" data-i18n="nav.catalog"></a>' +
        '<a href="about.html" data-i18n="nav.about"></a>' +
        '<a href="cart.html" data-i18n="nav.cart"></a>' +
        "</nav>" +
        '<div><span data-i18n="footer.made"></span> · © ' + new Date().getFullYear() + ' <span data-i18n="brand.name"></span></div>' +
        '<div class="muted" data-i18n="footer.test"></div>' +
        "</div></footer>";
    }
  }

  // ---------- Старт ----------
  function runReady() {
    readyCallbacks.forEach(function (fn) {
      try { fn(); } catch (e) { console.error(e); }
    });
  }

  function onReady(fn) { readyCallbacks.push(fn); }

  document.addEventListener("DOMContentLoaded", function () {
    renderChrome();
    updateCartBadge();
    var needProducts = document.body.hasAttribute("data-products");
    Promise.all([
      loadDict(getLang()),
      needProducts ? loadProducts().catch(function (e) { console.error(e); products = null; }) : null
    ]).then(function () {
      applyTranslations();
      runReady();
    });
  });

  // Количката се синхронизира между отворени раздели
  window.addEventListener("storage", function (e) {
    if (e.key === CART_KEY) { updateCartBadge(); runReady(); }
  });

  window.App = {
    CATEGORIES: CATEGORIES,
    icons: icons,
    t: t,
    lang: getLang,
    loc: loc,
    param: param,
    escapeHtml: escapeHtml,
    formatPrice: formatPrice,
    priceHtml: priceHtml,
    products: function () { return products; },
    findProduct: findProduct,
    productCard: productCard,
    getCart: getCart,
    addToCart: addToCart,
    setQty: setQty,
    removeFromCart: removeFromCart,
    clearCart: clearCart,
    cartLines: cartLines,
    cartTotal: cartTotal,
    toast: toast,
    applyTranslations: applyTranslations,
    onReady: onReady
  };
})();
