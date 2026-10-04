/*
 * Админ панел на „Хартиени Самолети“.
 *
 * Работи изцяло в браузъра: чрез GitHub REST API качва снимките в
 * images/products/ и обновява products.json в хранилището. След всеки запис
 * GitHub Pages публикува сайта наново (обикновено до 1-2 минути).
 *
 * Токенът се пази само в localStorage на този браузър и никога в кода.
 */
(function () {
  "use strict";

  var TOKEN_KEY = "hs_admin_token";
  var REPO_KEY = "hs_admin_repo";
  var PRODUCTS_PATH = "products.json";
  var IMAGES_DIR = "images/products";
  var MAX_SIZE = 1600;          // макс. ширина/височина в пиксели
  var JPEG_QUALITY = 0.82;
  var MAX_BYTES = 900 * 1024;   // ако снимката е по-голяма, компресираме още

  var CATEGORY_NAMES = {
    bags: "Текстилни торби", cards: "Картички", bookmarks: "Книгоразделители",
    notebooks: "Тефтери", giftsets: "Подаръчни комплекти"
  };

  var cfg = null;          // { token, owner, repo, branch }
  var products = [];       // последно заредените продукти
  var editingId = null;    // id на редактирания продукт или null за нов
  var images = [];         // [{ path } | { file, url }]
  var localPreviews = {};  // path -> objectURL за снимки, качени в тази сесия
  var busy = false;

  var $ = function (id) { return document.getElementById(id); };

  // ---------- localStorage ----------
  function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function save(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* няма място */ } }
  function remove(key) { try { localStorage.removeItem(key); } catch (e) { /* нищо */ } }

  // ---------- Съобщения ----------
  function say(text, type) {
    var el = $("msg");
    el.textContent = text;
    el.className = "notice admin-msg" + (type ? " " + type : "");
    el.hidden = false;
    if (type === "ok") {
      clearTimeout(el._t);
      el._t = setTimeout(function () { el.hidden = true; }, 12000);
    }
  }
  function hideMsg() { $("msg").hidden = true; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---------- Настройки на хранилището ----------
  function guessRepo() {
    var host = location.hostname;
    if (/\.github\.io$/i.test(host)) {
      var owner = host.split(".")[0];
      var first = location.pathname.split("/").filter(Boolean)[0];
      var repo = first && !/\.html$/i.test(first) ? decodeURIComponent(first) : owner + ".github.io";
      return { owner: owner, repo: repo, branch: "" };
    }
    // При отваряне от компютъра (не от GitHub Pages)
    return { owner: "bbrashnarov", repo: "HartieniSamoleti", branch: "" };
  }

  function readCfg() {
    var token = load(TOKEN_KEY);
    var repo = null;
    try { repo = JSON.parse(load(REPO_KEY) || "null"); } catch (e) { repo = null; }
    repo = repo || guessRepo();
    return { token: token, owner: repo.owner, repo: repo.repo, branch: repo.branch };
  }

  // ---------- GitHub API ----------
  function friendlyError(status, body) {
    if (status === 0) return "Няма връзка с интернет. Проверете връзката и опитайте пак.";
    if (status === 401) return "Токенът не е валиден или е изтекъл. Натиснете „Изход“ и въведете нов токен (вижте ръководството).";
    if (status === 403) return "Токенът няма право да записва. При създаването му изберете Contents: Read and write.";
    if (status === 404) return "Хранилището или файлът не е намерен. Проверете дали токенът е създаден за правилното хранилище.";
    if (status === 409 || status === 422) return "Файлът беше променен от друго място в същия момент. Натиснете „Обнови списъка“ и опитайте пак.";
    if (status >= 500) return "GitHub има временен проблем. Опитайте пак след минута.";
    return "Нещо се обърка (код " + status + "). " + ((body && body.message) || "");
  }

  function api(method, path, body) {
    var url = "https://api.github.com/repos/" + encodeURIComponent(cfg.owner) + "/" + encodeURIComponent(cfg.repo) + path;
    return fetch(url, {
      method: method,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + cfg.token,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.text().then(function (txt) {
        var json = null;
        try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
        if (!r.ok) {
          var err = new Error(friendlyError(r.status, json));
          err.status = r.status;
          throw err;
        }
        return json;
      });
    }, function () {
      var err = new Error(friendlyError(0));
      err.status = 0;
      throw err;
    });
  }

  function contentsPath(path) {
    return "/contents/" + path.split("/").map(encodeURIComponent).join("/");
  }

  // UTF-8 текст <-> base64
  function textToB64(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }
  function b64ToText(b64) {
    var bin = atob(String(b64).replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function blobToB64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(",")[1]); };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  // Винаги чете най-новия products.json от GitHub (а не от кеша на сайта)
  function fetchProducts() {
    return api("GET", contentsPath(PRODUCTS_PATH) + "?ref=" + encodeURIComponent(cfg.branch))
      .then(function (file) {
        var list = JSON.parse(b64ToText(file.content));
        return { list: Array.isArray(list) ? list : [], sha: file.sha };
      });
  }

  // Прилага промяна върху най-новата версия и записва; при сблъсък опитва още веднъж.
  function updateProducts(change, message, attempt) {
    attempt = attempt || 1;
    return fetchProducts().then(function (cur) {
      var next = change(cur.list.slice());
      return api("PUT", contentsPath(PRODUCTS_PATH), {
        message: message,
        content: textToB64(JSON.stringify(next, null, 2) + "\n"),
        sha: cur.sha,
        branch: cfg.branch
      }).then(function () { return next; });
    }).catch(function (err) {
      if ((err.status === 409 || err.status === 422) && attempt < 3) {
        return updateProducts(change, message, attempt + 1);
      }
      throw err;
    });
  }

  function deleteFile(path, message) {
    return api("GET", contentsPath(path) + "?ref=" + encodeURIComponent(cfg.branch))
      .then(function (f) {
        return api("DELETE", contentsPath(path), { message: message, sha: f.sha, branch: cfg.branch });
      });
  }

  // ---------- Смаляване на снимките ----------
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Файлът не е снимка или е повреден.")); };
      img.src = url;
    });
  }

  function toJpeg(canvas, quality) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, "image/jpeg", quality); });
  }

  function shrink(file) {
    return loadImage(file).then(function (r) {
      var w = r.img.naturalWidth, h = r.img.naturalHeight;
      var scale = Math.min(1, MAX_SIZE / Math.max(w, h));
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; // прозрачен фон (PNG) става бял
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(r.img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(r.url);
      return toJpeg(canvas, JPEG_QUALITY).then(function (blob) {
        if (blob && blob.size > MAX_BYTES) return toJpeg(canvas, 0.7);
        return blob;
      });
    });
  }

  // ---------- Имена на файлове ----------
  var TRANSLIT = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
    щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya"
  };
  function slugify(text) {
    var s = String(text || "").toLowerCase().split("").map(function (c) {
      return TRANSLIT[c] !== undefined ? TRANSLIT[c] : c;
    }).join("");
    s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "");
    return s || "produkt";
  }
  function uniqueId(base, list) {
    var id = base, n = 2;
    var taken = function (x) { return list.some(function (p) { return p.id === x; }); };
    while (taken(id)) id = base + "-" + n++;
    return id;
  }

  // ---------- Списък с продукти ----------
  function imgSrc(path) { return localPreviews[path] || path; }

  function renderList() {
    $("count").textContent = products.length;
    if (!products.length) {
      $("list").innerHTML = '<p class="muted">Още няма продукти. Добавете първия от формата горе.</p>';
      return;
    }
    $("list").innerHTML = products.map(function (p) {
      var img = (p.images && p.images[0]) || "images/logo.jpg";
      return '<div class="admin-item">' +
        '<img src="' + esc(imgSrc(img)) + '" alt="" loading="lazy" onerror="this.src=\'images/logo.jpg\'">' +
        "<div><strong>" + esc(p.name && p.name.bg) + "</strong>" +
        '<div class="meta">' + esc(CATEGORY_NAMES[p.category] || p.category) + " · " +
        esc(Number(p.price).toFixed(2).replace(".", ",")) + " €" + (p.sale ? " · Намален" : "") +
        (p.featured ? " · На началната" : "") + "</div></div>" +
        '<div class="actions">' +
        '<button type="button" class="btn btn-light" data-edit="' + esc(p.id) + '">Редактирай</button>' +
        '<button type="button" class="btn btn-danger" data-del="' + esc(p.id) + '">Изтрий</button>' +
        "</div></div>";
    }).join("");
  }

  function reload() {
    $("list").innerHTML = '<p class="loading">Зареждане…</p>';
    return fetchProducts().then(function (r) {
      products = r.list;
      renderList();
    }).catch(function (err) {
      $("list").innerHTML = "";
      say(err.message, "error");
    });
  }

  // ---------- Формата ----------
  function renderPreviews() {
    $("previews").innerHTML = images.map(function (im, i) {
      var src = im.url || imgSrc(im.path);
      return '<div class="preview">' +
        '<img src="' + esc(src) + '" alt="">' +
        (i === 0 ? '<span class="tag">Главна</span>' : '<button type="button" class="move" data-main="' + i + '">Направи главна</button>') +
        '<button type="button" data-remove="' + i + '" aria-label="Махни снимката">✕</button>' +
        "</div>";
    }).join("");
  }

  function addFiles(fileList) {
    var added = 0;
    Array.prototype.forEach.call(fileList || [], function (f) {
      if (!/^image\//.test(f.type)) return;
      images.push({ file: f, url: URL.createObjectURL(f) });
      added++;
    });
    if (!added && fileList && fileList.length) say("Моля, изберете снимка (JPG, PNG или подобна).", "error");
    renderPreviews();
  }

  function resetForm() {
    editingId = null;
    images.forEach(function (im) { if (im.url) URL.revokeObjectURL(im.url); });
    images = [];
    $("product-form").reset();
    $("files").value = "";
    $("form-title").textContent = "Нов продукт";
    $("save-btn").textContent = "Запиши продукта";
    $("cancel-btn").hidden = true;
    renderPreviews();
  }

  function startEdit(id) {
    var p = products.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    resetForm();
    editingId = id;
    images = (p.images || []).map(function (path) { return { path: path }; });
    $("category").value = p.category;
    $("name-bg").value = (p.name && p.name.bg) || "";
    $("name-en").value = (p.name && p.name.en) || "";
    $("desc-bg").value = (p.description && p.description.bg) || "";
    $("desc-en").value = (p.description && p.description.en) || "";
    $("price").value = String(p.price).replace(".", ",");
    $("old-price").value = p.oldPrice ? String(p.oldPrice).replace(".", ",") : "";
    $("sale").checked = !!p.sale;
    $("featured").checked = !!p.featured;
    $("form-title").textContent = "Редакция: " + ((p.name && p.name.bg) || "");
    $("save-btn").textContent = "Запиши промените";
    $("cancel-btn").hidden = false;
    renderPreviews();
    $("editor").scrollIntoView({ behavior: "smooth" });
  }

  function parsePrice(v) {
    var n = parseFloat(String(v || "").replace(",", ".").replace(/[^\d.]/g, ""));
    return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }

  function setBusy(on, text) {
    busy = on;
    document.querySelectorAll("#app button").forEach(function (b) { b.disabled = on; });
    if (on) say(text || "Качване… моля, изчакайте и не затваряйте страницата.");
  }

  function onSave(e) {
    e.preventDefault();
    if (busy) return;
    hideMsg();

    var data = {
      category: $("category").value,
      nameBg: $("name-bg").value.trim(),
      nameEn: $("name-en").value.trim(),
      descBg: $("desc-bg").value.trim(),
      descEn: $("desc-en").value.trim(),
      price: parsePrice($("price").value),
      oldPrice: parsePrice($("old-price").value),
      sale: $("sale").checked,
      featured: $("featured").checked
    };

    if (!images.length) return say("Добавете поне една снимка.", "error");
    if (!data.nameBg || !data.nameEn) return say("Попълнете името на двата езика.", "error");
    if (!data.descBg || !data.descEn) return say("Попълнете описанието на двата езика.", "error");
    if (!data.price) return say("Въведете цена, например 10,50.", "error");

    var isNew = !editingId;
    var id = isNew ? uniqueId(slugify(data.nameBg), products) : editingId;
    var old = isNew ? null : products.filter(function (p) { return p.id === id; })[0];
    var stamp = Date.now().toString(36);
    var newPaths = [];

    setBusy(true, "Подготвям снимките…");

    // 1) Смаляваме и качваме новите снимки една по една
    var chain = Promise.resolve();
    images.forEach(function (im, i) {
      if (!im.file) return;
      chain = chain.then(function () {
        say("Качвам снимка " + (newPaths.length + 1) + "… моля, изчакайте.");
        return shrink(im.file);
      }).then(function (blob) {
        if (!blob) throw new Error("Снимката не можа да бъде обработена. Опитайте с друга.");
        return blobToB64(blob).then(function (b64) {
          var path = IMAGES_DIR + "/" + id + "-" + stamp + "-" + i + ".jpg";
          return api("PUT", contentsPath(path), {
            message: "Снимка за продукт: " + data.nameBg,
            content: b64,
            branch: cfg.branch
          }).then(function () {
            localPreviews[path] = URL.createObjectURL(blob);
            newPaths.push(path);
            im.path = path;
          });
        });
      });
    });

    // 2) Обновяваме products.json
    chain.then(function () {
      say("Записвам продукта…");
      var finalImages = images.map(function (im) { return im.path; });
      var entry = {
        id: id,
        category: data.category,
        name: { bg: data.nameBg, en: data.nameEn },
        description: { bg: data.descBg, en: data.descEn },
        price: data.price,
        sale: data.sale,
        images: finalImages
      };
      if (data.sale && data.oldPrice && data.oldPrice > data.price) entry.oldPrice = data.oldPrice;
      if (data.featured) entry.featured = true;

      return updateProducts(function (list) {
        var idx = -1;
        list.forEach(function (p, i) { if (p.id === id) idx = i; });
        if (idx === -1) list.unshift(entry); // новите продукти излизат първи
        else list[idx] = entry;
        return list;
      }, (isNew ? "Нов продукт: " : "Редакция на продукт: ") + data.nameBg);
    }).then(function (list) {
      products = list;
      // 3) Изтриваме снимките, които вече не се ползват
      var removed = old ? (old.images || []).filter(function (p) {
        return images.every(function (im) { return im.path !== p; });
      }) : [];
      return cleanupImages(removed, list);
    }).then(function () {
      setBusy(false);
      resetForm();
      renderList();
      say("Качено успешно! Продуктът ще се появи на сайта до 1-2 минути.", "ok");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }).catch(function (err) {
      setBusy(false);
      // качените снимки остават в images; при повторен опит няма да се качат отново
      images.forEach(function (im) { if (im.path && im.file) im.file = null; });
      say(err.message || "Нещо се обърка. Опитайте пак.", "error");
    });
  }

  // Трие снимки, които не се използват от никой продукт. Грешките тук не спират работата.
  function cleanupImages(paths, list) {
    var used = {};
    list.forEach(function (p) { (p.images || []).forEach(function (x) { used[x] = true; }); });
    var chain = Promise.resolve();
    paths.forEach(function (path) {
      if (used[path] || path.indexOf(IMAGES_DIR + "/") !== 0) return;
      chain = chain.then(function () {
        return deleteFile(path, "Изтрита снимка").catch(function (e) { console.warn(path, e); });
      });
    });
    return chain;
  }

  function onDelete(id) {
    var p = products.filter(function (x) { return x.id === id; })[0];
    if (!p || busy) return;
    if (!confirm("Сигурни ли сте, че искате да изтриете „" + (p.name && p.name.bg) + "“?\nТова не може да се върне назад.")) return;
    setBusy(true, "Изтривам продукта…");
    updateProducts(function (list) {
      return list.filter(function (x) { return x.id !== id; });
    }, "Изтрит продукт: " + (p.name && p.name.bg)).then(function (list) {
      products = list;
      return cleanupImages(p.images || [], list);
    }).then(function () {
      setBusy(false);
      if (editingId === id) resetForm();
      renderList();
      say("Продуктът е изтрит. Ще изчезне от сайта до 1-2 минути.", "ok");
    }).catch(function (err) {
      setBusy(false);
      say(err.message, "error");
    });
  }

  // ---------- Вход / изход ----------
  function showApp() {
    $("login").hidden = true;
    $("app").hidden = false;
    $("repo-name").textContent = cfg.owner + "/" + cfg.repo;
    reload();
  }

  function showLogin() {
    var guess = readCfg();
    $("owner").value = guess.owner;
    $("repo").value = guess.repo;
    $("branch").value = guess.branch || "";
    $("login").hidden = false;
    $("app").hidden = true;
  }

  function onLogin(e) {
    e.preventDefault();
    var token = $("token").value.trim();
    if (!token) return say("Поставете токена в полето.", "error");
    cfg = {
      token: token,
      owner: $("owner").value.trim() || "bbrashnarov",
      repo: $("repo").value.trim() || "HartieniSamoleti",
      branch: $("branch").value.trim()
    };
    say("Проверявам токена…");
    api("GET", "").then(function (info) {
      if (info.permissions && !info.permissions.push) {
        throw new Error("Токенът може само да чете. Създайте нов с право Contents: Read and write.");
      }
      // Сайтът се публикува от main, затова записваме там (освен ако не е зададен друг клон)
      cfg.branch = cfg.branch || "main";
      save(TOKEN_KEY, token);
      save(REPO_KEY, JSON.stringify({ owner: cfg.owner, repo: cfg.repo, branch: cfg.branch }));
      $("token").value = "";
      say("Влязохте успешно!", "ok");
      showApp();
    }).catch(function (err) {
      cfg = null;
      say(err.message, "error");
    });
  }

  function onLogout() {
    if (!confirm("Да забравя ли токена на този браузър? После ще трябва да го въведете отново.")) return;
    remove(TOKEN_KEY);
    cfg = null;
    products = [];
    resetForm();
    hideMsg();
    showLogin();
  }

  // ---------- Старт ----------
  document.addEventListener("DOMContentLoaded", function () {
    $("login-form").addEventListener("submit", onLogin);
    $("logout").addEventListener("click", onLogout);
    $("product-form").addEventListener("submit", onSave);
    $("cancel-btn").addEventListener("click", resetForm);
    $("reload").addEventListener("click", reload);

    $("files").addEventListener("change", function (e) { addFiles(e.target.files); e.target.value = ""; });
    var dz = $("dropzone");
    dz.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("files").click(); }
    });
    ["dragenter", "dragover"].forEach(function (t) {
      dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(function (t) {
      dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.remove("drag"); });
    });
    dz.addEventListener("drop", function (e) { addFiles(e.dataTransfer && e.dataTransfer.files); });

    $("previews").addEventListener("click", function (e) {
      var rm = e.target.closest("[data-remove]");
      var mv = e.target.closest("[data-main]");
      if (rm) {
        var i = Number(rm.getAttribute("data-remove"));
        var im = images.splice(i, 1)[0];
        if (im && im.url) URL.revokeObjectURL(im.url);
      } else if (mv) {
        var j = Number(mv.getAttribute("data-main"));
        images.unshift(images.splice(j, 1)[0]);
      }
      renderPreviews();
    });

    $("list").addEventListener("click", function (e) {
      var ed = e.target.closest("[data-edit]");
      var del = e.target.closest("[data-del]");
      if (ed) startEdit(ed.getAttribute("data-edit"));
      if (del) onDelete(del.getAttribute("data-del"));
    });

    window.addEventListener("beforeunload", function (e) {
      if (busy) { e.preventDefault(); e.returnValue = ""; }
    });

    cfg = readCfg();
    if (cfg.token && cfg.branch) showApp();
    else showLogin();
  });
})();
