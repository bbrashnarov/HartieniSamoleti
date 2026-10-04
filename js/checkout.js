/*
 * Поръчка: проверява формата и изпраща имейл с поръчката чрез Web3Forms.
 * Ключът за Web3Forms се задава в js/config.js (вижте README.md).
 */
(function () {
  var KEY_PLACEHOLDER = "ПОСТАВЕТЕ_ТУК_ВАШИЯ_КЛЮЧ";

  function renderSummary() {
    if (!App.products()) {
      document.getElementById("summary").innerHTML = '<p class="notice error">' + App.escapeHtml(App.t("common.loadError")) + "</p>";
      return;
    }
    var lines = App.cartLines();
    var empty = !lines.length;
    document.getElementById("checkout-empty").hidden = !empty;
    document.getElementById("checkout-grid").hidden = empty;
    if (empty) return;

    document.getElementById("summary").innerHTML = lines.map(function (l) {
      return '<div class="mini-item"><span>' + App.escapeHtml(App.loc(l.product.name)) + " × " + l.qty +
        "</span><strong>" + App.escapeHtml(App.formatPrice(l.sum)) + "</strong></div>";
    }).join("") +
      '<div class="summary-row"><span>' + App.escapeHtml(App.t("cart.shipping")) + '</span><span class="summary-note">' + App.escapeHtml(App.t("cart.shippingNote")) + "</span></div>" +
      '<div class="summary-row total"><span>' + App.escapeHtml(App.t("cart.total")) + "</span><span>" + App.escapeHtml(App.formatPrice(App.cartTotal())) + "</span></div>";
    updatePlaceLabel();
  }

  function updatePlaceLabel() {
    var to = document.querySelector('input[name="deliveryTo"]:checked').value;
    var label = document.getElementById("place-label");
    label.setAttribute("data-i18n", to === "office" ? "checkout.office" : "checkout.address");
    label.textContent = App.t(label.getAttribute("data-i18n"));
    document.getElementById("f-place").setAttribute("autocomplete", to === "office" ? "off" : "street-address");
  }

  function orderNumber() {
    var d = new Date();
    function pad(n) { return String(n).padStart(2, "0"); }
    return "HS-" + String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" +
      pad(d.getHours()) + pad(d.getMinutes()) + "-" + Math.floor(100 + Math.random() * 900);
  }

  // Текстът на имейла е винаги на български, защото е за магазина.
  function buildMessage(data, lines, no) {
    function eur(n) { return (Number(n) || 0).toFixed(2).replace(".", ",") + " €"; }
    var rows = lines.map(function (l, i) {
      return (i + 1) + ". " + l.product.name.bg + " (" + l.product.id + ") × " + l.qty + " = " + eur(l.sum);
    });
    var total = lines.reduce(function (s, l) { return s + l.sum; }, 0);
    return [
      "НОВА ПОРЪЧКА " + no + " (ТЕСТОВ САЙТ)",
      "",
      "ПРОДУКТИ:",
      rows.join("\n"),
      "",
      "ОБЩО: " + eur(total) + " (без доставката)",
      "Плащане: наложен платеж",
      "",
      "КЛИЕНТ:",
      "Име: " + data.name,
      "Телефон: " + data.phone,
      "Имейл: " + data.email,
      "",
      "ДОСТАВКА:",
      "Куриер: " + data.courier,
      "До: " + (data.deliveryTo === "office" ? "офис на куриера" : "адрес"),
      "Град: " + data.city,
      (data.deliveryTo === "office" ? "Офис: " : "Адрес: ") + data.place,
      "",
      "Бележка: " + (data.note || "-"),
      "",
      "Език на сайта: " + App.lang().toUpperCase()
    ].join("\n");
  }

  function showError(msg) {
    var el = document.getElementById("form-msg");
    el.textContent = msg;
    el.hidden = false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function onSubmit(e) {
    e.preventDefault();
    var form = e.target;
    var msg = document.getElementById("form-msg");
    msg.hidden = true;

    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = typeof v === "string" ? v.trim() : v; });
    if (data.botcheck) return; // бот

    if (!data.name || !data.phone || !data.email || !data.city || !data.place) {
      return showError(App.t("checkout.required"));
    }
    if (!/^[+0-9 ()-]{6,20}$/.test(data.phone) || data.phone.replace(/\D/g, "").length < 6) {
      return showError(App.t("checkout.badPhone"));
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return showError(App.t("checkout.badEmail"));
    }

    var lines = App.cartLines();
    if (!lines.length) return showError(App.t("checkout.emptyCart"));

    var no = orderNumber();
    var key = (window.SHOP_CONFIG && window.SHOP_CONFIG.web3formsKey) || "";
    var done = function (demo) {
      App.clearCart();
      location.href = "thanks.html?order=" + encodeURIComponent(no) + (demo ? "&demo=1" : "");
    };

    // Ако имейл услугата още не е настроена, поръчката минава в демо режим.
    if (!key || key === KEY_PLACEHOLDER) {
      console.warn("Web3Forms не е настроен: имейл не е изпратен. Вижте README.md.");
      return done(true);
    }

    var btn = document.getElementById("submit-btn");
    btn.disabled = true;
    btn.textContent = App.t("checkout.sending");

    fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: key,
        subject: "Нова поръчка " + no + " – Хартиени Самолети (тест)",
        from_name: "Хартиени Самолети",
        name: data.name,
        email: data.email,
        replyto: data.email,
        message: buildMessage(data, lines, no)
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.success) throw new Error((res && res.message) || "error");
        done(false);
      })
      .catch(function (err) {
        console.error(err);
        btn.disabled = false;
        btn.textContent = App.t("checkout.submit");
        showError(App.t("checkout.error"));
      });
  }

  // ---------- Град и офис ----------
  // Офисите на Еконт идват от data/econt-offices.json, който се обновява всяка седмица
  // от GitHub Action (.github/workflows/econt-offices.yml). За Спиди няма публичен
  // списък без договор, затова там офисът се пише на ръка.
  var econtOffices = [];

  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }

  function current(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
  }

  function officeLabel(o) {
    return o.name + (o.aps ? " (" + App.t("checkout.aps") + ")" : "") + (o.address ? " – " + o.address : "");
  }

  function options(list) {
    return list.map(function (v) { return '<option value="' + App.escapeHtml(v) + '"></option>'; }).join("");
  }

  function useEcontList() {
    return current("courier") === "Еконт" && current("deliveryTo") === "office" && econtOffices.length > 0;
  }

  function updateLists() {
    var econt = useEcontList();
    var cities;
    if (econt) {
      var seen = {};
      cities = [];
      econtOffices.forEach(function (o) { if (!seen[o.city]) { seen[o.city] = true; cities.push(o.city); } });
    } else {
      cities = (window.BG_CITIES || []).slice();
    }
    cities.sort(function (a, b) { return a.localeCompare(b, "bg"); });
    document.getElementById("city-list").innerHTML = options(cities);

    var place = document.getElementById("f-place");
    var hint = document.getElementById("place-hint");
    if (econt) {
      var city = norm(document.getElementById("f-city").value);
      var inCity = city ? econtOffices.filter(function (o) { return norm(o.city) === city; }) : [];
      document.getElementById("office-list").innerHTML = options(inCity.map(officeLabel));
      place.setAttribute("list", "office-list");
      hint.textContent = App.t(inCity.length ? "checkout.officeHintEcont" : "checkout.officeHintCityFirst");
      hint.hidden = false;
    } else {
      place.removeAttribute("list");
      hint.textContent = current("deliveryTo") === "office" ? App.t("checkout.officeHintFree") : "";
      hint.hidden = !hint.textContent;
    }
  }

  function loadEcontOffices() {
    fetch("data/econt-offices.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        econtOffices = Array.isArray(list) ? list.filter(function (o) { return o && o.city && o.name; }) : [];
        updateLists();
      })
      .catch(function () { econtOffices = []; });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("order-form");
    form.addEventListener("submit", onSubmit);
    form.querySelectorAll('input[name="deliveryTo"], input[name="courier"]').forEach(function (r) {
      r.addEventListener("change", function () {
        updatePlaceLabel();
        updateLists();
      });
    });
    document.getElementById("f-city").addEventListener("input", updateLists);
    updateLists();
    loadEcontOffices();
  });

  App.onReady(function () { renderSummary(); updateLists(); });
})();
