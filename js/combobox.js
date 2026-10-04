/*
 * Търсачка с падащ списък в стила на сайта (вместо стандартния <datalist>,
 * който браузърът рисува черен и не може да се оформи).
 *
 * Употреба: Combobox(input, function () { return ["вариант 1", "вариант 2"]; })
 */
(function () {
  "use strict";

  var MAX_ITEMS = 60;
  var counter = 0;

  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Удебелява първото съвпадение на търсения текст
  function highlight(text, q) {
    var i = q ? text.toLowerCase().indexOf(q) : -1;
    if (i === -1) return esc(text);
    return esc(text.slice(0, i)) + "<strong>" + esc(text.slice(i, i + q.length)) + "</strong>" + esc(text.slice(i + q.length));
  }

  window.Combobox = function (input, source) {
    var id = "combo-" + (++counter);
    var wrap = document.createElement("div");
    wrap.className = "combo";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var list = document.createElement("ul");
    list.className = "combo-list";
    list.id = id;
    list.setAttribute("role", "listbox");
    list.hidden = true;
    wrap.appendChild(list);

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", id);
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("autocomplete", "off");

    var items = [];
    var active = -1;

    function close() {
      list.hidden = true;
      active = -1;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }

    function setActive(i) {
      var els = list.children;
      if (active >= 0 && els[active]) els[active].setAttribute("aria-selected", "false");
      active = i;
      if (active >= 0 && els[active]) {
        els[active].setAttribute("aria-selected", "true");
        els[active].scrollIntoView({ block: "nearest" });
        input.setAttribute("aria-activedescendant", els[active].id);
      }
    }

    function open() {
      var all = source() || [];
      var q = norm(input.value);
      var words = q.split(" ").filter(Boolean);
      // Първо вариантите, които започват с текста, после тези с дума, която започва с него
      function score(n) {
        if (!q) return 0;
        if (n.indexOf(q) === 0) return 0;
        if ((" " + n).indexOf(" " + q) !== -1) return 1;
        return 2;
      }
      items = all.filter(function (v) {
        var n = norm(v);
        if (n === q) return true;
        return words.every(function (w) { return n.indexOf(w) !== -1; });
      }).map(function (v, i) { return { v: v, s: score(norm(v)), i: i }; })
        .sort(function (a, b) { return a.s - b.s || a.i - b.i; })
        .map(function (x) { return x.v; });
      // Ако текстът точно съвпада с един вариант, списъкът не пречи
      if (items.length === 1 && norm(items[0]) === q) return close();
      items = items.slice(0, MAX_ITEMS);
      if (!items.length) return close();

      list.innerHTML = items.map(function (v, i) {
        return '<li role="option" id="' + id + "-" + i + '" aria-selected="false" data-i="' + i + '">' + highlight(v, words[0] || "") + "</li>";
      }).join("");
      list.hidden = false;
      active = -1;
      input.setAttribute("aria-expanded", "true");
    }

    function choose(i) {
      if (i < 0 || i >= items.length) return;
      input.value = items[i];
      close();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      close();
    }

    input.addEventListener("input", function (e) {
      if (e.isTrusted) open();
    });
    input.addEventListener("focus", open);
    input.addEventListener("click", function () { if (list.hidden) open(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (list.hidden) open();
        setActive(Math.min(active + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive(Math.max(active - 1, 0));
      } else if (e.key === "Enter" && !list.hidden && active >= 0) {
        e.preventDefault();
        choose(active);
      } else if (e.key === "Escape" || e.key === "Tab") {
        close();
      }
    });
    // mousedown вместо click, за да се избере преди полето да загуби фокуса
    list.addEventListener("mousedown", function (e) {
      var li = e.target.closest("li");
      if (!li) return;
      e.preventDefault();
      choose(Number(li.getAttribute("data-i")));
    });
    input.addEventListener("blur", function () { setTimeout(close, 120); });

    return { refresh: function () { if (document.activeElement === input) open(); else close(); } };
  };
})();
