/* ================================================================
   Расписание занятий: отрисовка + редактор + Telegram Mini Apps
   ================================================================ */
(function () {
  "use strict";

  /* ================= Telegram ================= */

  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    try {
      tg.ready();
      tg.setBackgroundColor("#0A0E0C");
    } catch (e) { /* вне Telegram — игнорируем */ }
  }

  function haptic(kind) {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === "selection") tg.HapticFeedback.selectionChanged();
      else tg.HapticFeedback.impactOccurred("light");
    } catch (e) {}
  }

  /* ================= Справочники ================= */

  var DAYS = APP_DATA.days;
  var FULL_DAY = {
    "пн": "Понедельник", "вт": "Вторник", "ср": "Среда",
    "чт": "Четверг", "пт": "Пятница", "сб": "Суббота", "вс": "Воскресенье"
  };
  var TYPES = ["лек", "пр", "лаб", "конс"];
  var STORAGE_KEY = "scheduleApp:v1";

  function todayKey() {
    var jsDay = new Date().getDay();
    return ["вс", "пн", "вт", "ср", "чт", "пт", "сб"][jsDay];
  }

  function deep(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /* --- время: сортировка и нормализация ввода ---
     "8:00", "8.00", "08:00" → минуты от полуночи;
     некорректное значение уходит в конец списка. */
  function timeMin(s) {
    var m = /(\d{1,2})\s*[:.\-–]\s*(\d{1,2})/.exec(String(s || ""));
    if (!m) return 24 * 60;
    var h = parseInt(m[1], 10), mm = parseInt(m[2], 10);
    if (h > 23 || mm > 59) return 24 * 60;
    return h * 60 + mm;
  }

  function byTime(a, b) {
    return timeMin(a.start) - timeMin(b.start);
  }

  /* "8:00" → "08:00" (приводит ввод к виду 08:00–09:35) */
  function formatTime(v) {
    v = String(v || "").trim();
    var m = /(\d{1,2})\s*[:.\-–]\s*(\d{1,2})/.exec(v);
    if (!m) return v;
    var h = parseInt(m[1], 10), mm = parseInt(m[2], 10);
    if (h > 23 || mm > 59) return v;
    return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function svgIcon(pathD) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "meta-icon");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.7");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS(ns, "path");
    path.setAttribute("d", pathD);
    svg.appendChild(path);
    return svg;
  }

  var ICON_PERSON = "M12 12.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2ZM4.8 19.6c.9-3.4 3.8-5.3 7.2-5.3s6.3 1.9 7.2 5.3";
  var ICON_PIN = "M12 21.5s6.6-6.1 6.6-11.1a6.6 6.6 0 1 0-13.2 0C5.4 15.4 12 21.5 12 21.5Zm0-8.6a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z";

  /* ================= Хранилище =================
     Данные из js/data.js копируются в localStorage и дальше
     редактируются в приложении. js/data.js остаётся «источником»,
     который можно заменить через кнопку экспорта.               */

  var store = {
    data: null,

    load: function () {
      var raw = null;
      try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
      if (raw) {
        try { this.data = JSON.parse(raw); } catch (e) { this.data = null; }
      }
      if (!this.data || !this.data.meta || !this.data.SCHEDULE) {
        this.data = { meta: deep(APP_DATA.meta), SCHEDULE: deep(APP_DATA.SCHEDULE) };
      }
      this.sortAll();
    },

    persist: function () {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch (e) {}
    },

    reset: function () {
      this.data = { meta: deep(APP_DATA.meta), SCHEDULE: deep(APP_DATA.SCHEDULE) };
      this.sortAll();
      this.persist();
    },

    /* каждая пара суток отсортирована по времени восходяще */
    sortAll: function () {
      var sch = this.data.SCHEDULE;
      Object.keys(sch).forEach(function (w) {
        Object.keys(sch[w]).forEach(function (d) {
          if (Array.isArray(sch[w][d])) sch[w][d].sort(byTime);
        });
      });
    },

    pairs: function (week, day) {
      if (!this.data.SCHEDULE[week]) this.data.SCHEDULE[week] = {};
      if (!this.data.SCHEDULE[week][day]) this.data.SCHEDULE[week][day] = [];
      var list = this.data.SCHEDULE[week][day];
      list.sort(byTime);
      return list;
    }
  };
  store.load();

  /* ================= Состояние ================= */

  var t = todayKey();
  var state = {
    week: APP_DATA.meta.defaultWeek || 1,
    day: DAYS.indexOf(t) >= 0 ? t : DAYS[0]
  };
  if (!store.data.SCHEDULE[state.week]) state.week = 1;

  /* ================= Уведомление ================= */

  var toastNode = document.getElementById("toast");
  var toastTimer = null;

  function toast(msg) {
    return;
  }

  /* ================= Основной вид ================= */

  function renderHeader() {
    document.getElementById("bannerText").textContent = store.data.meta.banner;
    document.getElementById("groupId").textContent = store.data.meta.group;
    document.getElementById("groupCourse").textContent = store.data.meta.course;
  }

  var daysNav = document.getElementById("days");
  var dayButtons = {};

  DAYS.forEach(function (key) {
    var btn = el("button", "day", key);
    btn.type = "button";
    btn.title = FULL_DAY[key] || key;
    btn.addEventListener("click", function () {
      if (state.day === key) return;
      state.day = key;
      haptic("selection");
      syncDays();
      render();
    });
    dayButtons[key] = btn;
    daysNav.appendChild(btn);
  });

  function syncDays() {
    DAYS.forEach(function (key) {
      dayButtons[key].classList.toggle("active", key === state.day);
    });
  }

  var weekButtons = Array.prototype.slice.call(
    document.querySelectorAll("#weekToggle .week-btn")
  );

  weekButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var week = parseInt(btn.getAttribute("data-week"), 10);
      if (week === state.week) return;
      state.week = week;
      haptic("selection");
      syncWeeks();
      render();
    });
  });

  function syncWeeks() {
    weekButtons.forEach(function (btn) {
      var week = parseInt(btn.getAttribute("data-week"), 10);
      btn.classList.toggle("active", week === state.week);
    });
  }

  function badgeClass(type) {
    switch ((type || "").toLowerCase()) {
      case "лек":  return "badge badge--lek";
      case "пр":   return "badge badge--pr";
      case "лаб":  return "badge badge--lab";
      case "конс": return "badge badge--kon";
      default:     return "badge badge--def";
    }
  }

  /* подгруппа — только у лабораторных (1 или 2) */
  function subgroupOf(pair) {
    if ((pair.type || "").toLowerCase() !== "лаб") return 0;
    return pair.subgroup === 2 ? 2 : 1;
  }

  /* --- объединение одновременных лабораторных в одну карточку ---
     Лабы с одинаковым временем (start + end) показываются одним полем;
     подгруппы, названия, преподаватели и аудитории объединяются. */
  function displayGroups(pairs) {
    var groups = [];
    pairs.forEach(function (p) {
      if ((p.type || "").toLowerCase() === "лаб") {
        for (var i = 0; i < groups.length; i++) {
          var g = groups[i];
          if (g.lab && g.pairs[0].start === p.start && g.pairs[0].end === p.end) {
            g.pairs.push(p);
            return;
          }
        }
        groups.push({ lab: true, pairs: [p] });
      } else {
        groups.push({ lab: false, pairs: [p] });
      }
    });
    return groups;
  }

  function uniqueTexts(pairs, key) {
    var seen = {}, out = [];
    pairs.forEach(function (p) {
      var v = String(p[key] || "").trim();
      if (v && !seen[v]) { seen[v] = 1; out.push(v); }
    });
    return out;
  }

  var scheduleRoot = document.getElementById("schedule");

  function render() {
    var pairs = store.pairs(state.week, state.day);
    scheduleRoot.textContent = "";

    if (!pairs.length) {
      var empty = el("div", "empty");
      empty.appendChild(el("div", "empty-title", "Занятий нет"));
      empty.appendChild(el("div", null, (FULL_DAY[state.day] || "") + " — свободный день"));

      var addBtn = el("button", "btn btn--primary", "＋ Добавить пару");
      addBtn.type = "button";
      addBtn.addEventListener("click", function () {
        openEditor();
      });
      empty.appendChild(addBtn);

      scheduleRoot.appendChild(empty);
      return;
    }

    displayGroups(pairs).forEach(function (group) {
      var first = group.pairs[0];
      var row = el("article", "row");

      /* общий блок: слева время, справа содержимое */
      var card = el("div", "card");

      var times = el("div", "times");
      times.appendChild(el("span", null, first.start));
      times.appendChild(el("span", null, first.end));
      card.appendChild(times);

      var body = el("div", "card-body");

      function appendMeta(parent, subset, key, icon) {
        var vals = uniqueTexts(subset, key);
        if (!vals.length) return;
        var line = el("div", "meta");
        line.appendChild(svgIcon(icon));
        line.appendChild(el("span", null, vals.join(" / ")));
        parent.appendChild(line);
      }

      if (group.lab) {
        /* лабораторная: внутри общего блока — отдельный блок на подгруппу */
        [1, 2].forEach(function (n) {
          var subPairs = group.pairs.filter(function (p) {
            return subgroupOf(p) === n;
          });
          var sub = el("div", "subblock");

          var subHead = el("div", "subblock-head");
          subHead.appendChild(el("span", "subblock-label", n + "-я подгруппа"));
          if (subPairs.length && subPairs[0].type) {
            subHead.appendChild(el("span", badgeClass(subPairs[0].type), subPairs[0].type));
          }
          sub.appendChild(subHead);

          if (subPairs.length) {
            var subTitle = uniqueTexts(subPairs, "title").join(" / ");
            sub.appendChild(el("h3", subTitle ? "title" : "title no-pair",
              subTitle || "Нет пары"));
            appendMeta(sub, subPairs, "teacher", ICON_PERSON);
            appendMeta(sub, subPairs, "room", ICON_PIN);
          } else {
            sub.appendChild(el("div", "subblock-empty", "Нет пары"));
          }
          body.appendChild(sub);
        });
      } else {
        /* одиночная пара: заголовок, тип, преподаватель и аудитория —
           внутри обводки (как подблоки у лабораторной) */
        var box = el("div", "pair-box");
        var head = el("div", "card-head");
        var plainTitle = uniqueTexts(group.pairs, "title").join(" / ");
        head.appendChild(el("h3", plainTitle ? "title" : "title no-pair",
          plainTitle || "Нет пары"));
        if (first.type) head.appendChild(el("span", badgeClass(first.type), first.type));
        box.appendChild(head);
        appendMeta(box, group.pairs, "teacher", ICON_PERSON);
        appendMeta(box, group.pairs, "room", ICON_PIN);
        body.appendChild(box);
      }

      card.appendChild(body);
      row.appendChild(card);
      scheduleRoot.appendChild(row);
    });
  }

  /* ================= Экспорт data.js ================= */

  var exportOverlay = null;

  function exportText() {
    var payload = {
      meta: store.data.meta,
      days: APP_DATA.days,
      SCHEDULE: store.data.SCHEDULE
    };
    return "/* Расписание — сгенерировано в приложении */\n" +
           "const APP_DATA = " + JSON.stringify(payload, null, 2) + ";\n";
  }

  function openExportBox(text) {
    if (!exportOverlay) {
      exportOverlay = el("div", "export-overlay");
      exportOverlay.hidden = true;

      var box = el("div", "export-box");
      box.appendChild(el("h3", null, "Обновлённый js/data.js"));

      var p = el("p", null,
        "Ниже — весь файл целиком. Скопируй его и замени содержимое js/data.js " +
        "на GitHub (открой файл → Edit → вставь → Commit changes). " +
        "Расписание станет постоянным и откроется на любом устройстве.");
      box.appendChild(p);

      var ta = el("textarea");
      ta.spellcheck = false;
      box.appendChild(ta);

      var close = el("button", "btn btn--primary btn--block", "Готово");
      close.type = "button";
      close.addEventListener("click", function () { exportOverlay.hidden = true; });
      box.appendChild(close);

      exportOverlay.appendChild(box);
      document.body.appendChild(exportOverlay);

      exportOverlay._ta = ta;
    }
    exportOverlay._ta.value = text;
    exportOverlay.hidden = false;
    exportOverlay._ta.focus();
    exportOverlay._ta.select();
  }

  function doExport() {
    var text = exportText();
    haptic("impact");

    function fallback() {
      openExportBox(text);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast("Скопировано! Вставь вместо js/data.js на GitHub");
      }, fallback);
    } else {
      fallback();
    }
  }

  /* ================= Двухшаговое подтверждение ================= */

  function armedButton(btn, label, confirmLabel, action) {
    var timer = null;
    btn.addEventListener("click", function () {
      if (btn.dataset.armed === "1") {
        clearTimeout(timer);
        btn.dataset.armed = "";
        btn.textContent = label;
        haptic("impact");
        action();
      } else {
        btn.dataset.armed = "1";
        btn.textContent = confirmLabel;
        timer = setTimeout(function () {
          btn.dataset.armed = "";
          btn.textContent = label;
        }, 3000);
      }
    });
  }

  /* ================= Редактор ================= */

  var editorNode = document.getElementById("editor");
  var ed = { week: state.week, day: state.day, editIndex: -1, type: "лек", subgroup: 1 };
  var edRefs = null;   // ссылки на элементы панели

  function buildField(labelText, id, placeholder) {
    var wrap = el("div", "field");
    var label = el("label", null, labelText);
    label.setAttribute("for", id);
    var input = el("input", "input");
    input.id = id;
    input.type = "text";
    if (placeholder) input.placeholder = placeholder;
    wrap.appendChild(label);
    wrap.appendChild(input);
    return { wrap: wrap, input: input };
  }

  function buildEditor() {
    editorNode.textContent = "";
    var inner = el("div", "editor-inner");

    /* --- шапка панели --- */
    var head = el("div", "editor-head");
    var close = el("button", "editor-close", "✕");
    close.type = "button";
    close.title = "Закрыть";
    close.addEventListener("click", closeEditor);
    head.appendChild(close);
    head.appendChild(el("h2", null, "Редактирование расписания"));
    inner.appendChild(head);

    /* --- данные шапки приложения --- */
    var metaSec = el("div", "editor-section");
    metaSec.appendChild(el("div", "editor-section-title", "Данные шапки"));

    var fBanner = buildField("Текст-предупреждение сверху", "edBanner", "например: обновлено сегодня");
    var fGroup = buildField("Номер группы", "edGroup", "10606123");
    var fCourse = buildField("Факультет и курс", "edCourse", "Эф 4 курс");

    [fBanner, fGroup, fCourse].forEach(function (f) { metaSec.appendChild(f.wrap); });

    [[fBanner, "banner"], [fGroup, "group"], [fCourse, "course"]].forEach(function (pair) {
      pair[0].input.value = store.data.meta[pair[1]];
      pair[0].input.addEventListener("input", function () {
        store.data.meta[pair[1]] = pair[0].input.value;
        store.persist();
        renderHeader();
      });
    });

    var metaHint = el("p", "ed-hint", "Меняется сразу — можно не сохранять отдельно.");
    metaSec.appendChild(metaHint);
    inner.appendChild(metaSec);

    /* --- недели --- */
    var weekSec = el("div", "editor-section");
    weekSec.appendChild(el("div", "editor-section-title", "Неделя и день"));

    var weekWrap = el("div", "week-toggle");
    var edWeekBtns = [1, 2].map(function (w) {
      var b = el("button", "week-btn", w + " неделя");
      b.type = "button";
      b.addEventListener("click", function () {
        ed.week = w;
        haptic("selection");
        syncEdWeeks();
        renderEdList();
      });
      weekWrap.appendChild(b);
      return b;
    });
    weekSec.appendChild(weekWrap);

    function syncEdWeeks() {
      edWeekBtns.forEach(function (b, i) {
        b.classList.toggle("active", (i + 1) === ed.week);
      });
    }

    /* --- дни --- */
    var dayWrap = el("nav", "days");
    var edDayBtns = {};
    DAYS.forEach(function (key) {
      var b = el("button", "day", key);
      b.type = "button";
      b.addEventListener("click", function () {
        ed.day = key;
        haptic("selection");
        syncEdDays();
        renderEdList();
      });
      edDayBtns[key] = b;
      dayWrap.appendChild(b);
    });
    weekSec.appendChild(dayWrap);
    inner.appendChild(weekSec);

    function syncEdDays() {
      DAYS.forEach(function (key) {
        edDayBtns[key].classList.toggle("active", key === ed.day);
      });
    }

    /* --- список пар --- */
    var listSec = el("div", "editor-section");
    listSec.appendChild(el("div", "editor-section-title", "Пары"));

    var addBtn = el("button", "btn btn--primary btn--block", "＋ Добавить пару");
    addBtn.type = "button";
    addBtn.addEventListener("click", function () { showForm(-1); });
    listSec.appendChild(addBtn);

    /* --- форма --- */
    var form = el("form", "ed-form");
    form.hidden = true;
    form.addEventListener("submit", function (e) { e.preventDefault(); saveForm(); });

    var timeRow = el("div", "ed-form-row");
    var fStart = buildField("Начало", "edStart", "08:00");
    var fEnd = buildField("Конец", "edEnd", "09:35");
    fStart.input.type = "text";
    fEnd.input.type = "text";
    fStart.input.setAttribute("inputmode", "numeric");
    fEnd.input.setAttribute("inputmode", "numeric");
    fStart.input.setAttribute("maxlength", "5");
    fEnd.input.setAttribute("maxlength", "5");
    fStart.input.placeholder = "ЧЧ:ММ";
    fEnd.input.placeholder = "ЧЧ:ММ";
    timeRow.appendChild(fStart.wrap);
    timeRow.appendChild(fEnd.wrap);
    form.appendChild(timeRow);
    fStart.input.addEventListener("input", timeMaskInput);
    fEnd.input.addEventListener("input", timeMaskInput);
    fStart.input.addEventListener("blur", function () {
      this.value = formatTime(this.value);
    });
    fEnd.input.addEventListener("blur", function () {
      this.value = formatTime(this.value);
    });
    fStart.input.addEventListener("keydown", function (e) {
      if (e.key === "Backspace") {
        var el = this;
        var pos = el.selectionStart || 0;
        var v = el.value;
        if (pos > 0 && v.charAt(pos - 1) === ":") {
          e.preventDefault();
          var digits = v.replace(/\D/g, "");
          digits = digits.slice(0, -1);
          var nv = digits;
          if (digits.length > 2) nv = digits.slice(0, 2) + ":" + digits.slice(2);
          else if (digits.length === 2) nv = digits + ":";
          else if (digits.length === 1) nv = digits;
          el.value = nv;
          try { el.setSelectionRange(pos - 2 >= 0 ? pos - 2 : 0, pos - 2 >= 0 ? pos - 2 : 0); } catch (ex) {}
        }
      }
    });
    fEnd.input.addEventListener("keydown", function (e) {
      if (e.key === "Backspace") {
        var el = this;
        var pos = el.selectionStart || 0;
        var v = el.value;
        if (pos > 0 && v.charAt(pos - 1) === ":") {
          e.preventDefault();
          var digits = v.replace(/\D/g, "");
          digits = digits.slice(0, -1);
          var nv = digits;
          if (digits.length > 2) nv = digits.slice(0, 2) + ":" + digits.slice(2);
          else if (digits.length === 2) nv = digits + ":";
          else if (digits.length === 1) nv = digits;
          el.value = nv;
          try { el.setSelectionRange(pos - 2 >= 0 ? pos - 2 : 0, pos - 2 >= 0 ? pos - 2 : 0); } catch (ex) {}
        }
      }
    });

    var fTitle = buildField("Название предмета", "edTitle", "Например: Физика");
    form.appendChild(fTitle.wrap);

    var tRow = el("div", "ed-form-row");
    var fTeacher = buildField("Преподаватель", "edTeacher", "ст.пр. Иванов И.И.");
    var fRoom = buildField("Аудитория", "edRoom", "а.713, к.21");
    tRow.appendChild(fTeacher.wrap);
    tRow.appendChild(fRoom.wrap);
    form.appendChild(tRow);

    var typeField = el("div", "field");
    typeField.appendChild(el("label", null, "Тип занятия"));
    var chips = el("div", "ed-chips");
    var typeChips = TYPES.map(function (type) {
      var c = el("button", "chip", type);
      c.type = "button";
      c.addEventListener("click", function () {
        ed.type = type;
        haptic("selection");
        syncChips();
      });
      chips.appendChild(c);
      return c;
    });
    typeField.appendChild(chips);
    form.appendChild(typeField);

    /* --- подгруппа (только для «лаб») --- */
    var subField = el("div", "field");
    subField.appendChild(el("label", null, "Подгруппа"));
    var subChips = el("div", "ed-chips");
    var subBtns = [1, 2].map(function (n) {
      var c = el("button", "chip", String(n));
      c.type = "button";
      c.addEventListener("click", function () {
        ed.subgroup = n;
        haptic("selection");
        syncChips();
      });
      subChips.appendChild(c);
      return c;
    });
    subField.appendChild(subChips);
    form.appendChild(subField);

    function syncChips() {
      typeChips.forEach(function (c) {
        c.classList.toggle("active", c.textContent === ed.type);
      });
      subBtns.forEach(function (c, i) {
        c.classList.toggle("active", (i + 1) === ed.subgroup);
      });
      subField.hidden = ed.type !== "лаб";
    }

    var actions = el("div", "ed-form-actions");
    var cancelBtn = el("button", "btn btn--ghost", "Отмена");
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", function () { hideForm(); });
    var saveBtn = el("button", "btn btn--primary", "Сохранить");
    saveBtn.type = "button";
    saveBtn.addEventListener("click", saveForm);
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    form.appendChild(actions);

    listSec.appendChild(form);

    /* --- список --- */
    var listNode = el("div");
    listSec.appendChild(listNode);
    inner.appendChild(listSec);

    /* --- инструменты --- */
    var tools = el("div", "editor-section");
    tools.appendChild(el("div", "editor-section-title", "Данные"));

    var toolsGrid = el("div", "ed-tools");

    var exportBtn = el("button", "btn btn--block", "⎘ Скопировать обновлённый data.js");
    exportBtn.type = "button";
    exportBtn.addEventListener("click", doExport);
    toolsGrid.appendChild(exportBtn);

    var clearBtn = el("button", "btn btn--danger btn--block", "Очистить всё расписание");
    clearBtn.type = "button";
    armedButton(clearBtn, "Очистить всё расписание", "Точно очистить? Нажми ещё раз", function () {
      [1, 2].forEach(function (w) {
        DAYS.forEach(function (d) { store.pairs(w, d).length = 0; });
      });
      store.persist();
      renderEdList();
      render();
      toast("Расписание очищено");
    });
    toolsGrid.appendChild(clearBtn);

    var demoBtn = el("button", "btn btn--ghost btn--block", "Вернуть демо-данные");
    demoBtn.type = "button";
    armedButton(demoBtn, "Вернуть демо-данные", "Заменить текущее? Нажми ещё раз", function () {
      store.reset();
      renderHeader();
      syncWeeks();
      syncDays();
      render();
      closeEditor();
      toast("Демо-данные восстановлены");
    });
    toolsGrid.appendChild(demoBtn);

    tools.appendChild(toolsGrid);
    tools.appendChild(el("p", "ed-hint",
      "Сначала расписание хранится в этом браузере. Чтобы оно всегда открывалось " +
      "в Telegram и на других устройствах — нажми «Скопировать data.js» и замени " +
      "файл на GitHub (инструкция в README.md)."));
    inner.appendChild(tools);

    editorNode.appendChild(inner);

    /* --- сохраняем ссылки --- */
    edRefs = {
      syncEdWeeks: syncEdWeeks,
      syncEdDays: syncEdDays,
      syncChips: syncChips,
      renderEdList: renderEdList,
      form: form,
      inputs: {
        start: fStart.input, end: fEnd.input, title: fTitle.input,
        teacher: fTeacher.input, room: fRoom.input
      }
    };

    function renderEdList() {
      var pairs = store.pairs(ed.week, ed.day);
      listNode.textContent = "";

      if (!pairs.length) {
        listNode.appendChild(el("div", "ed-empty",
          (FULL_DAY[ed.day] || "") + ", " + ed.week + " неделя — пар пока нет"));
        return;
      }

      pairs.forEach(function (pair, index) {
        var item = el("div", "ed-item");

        var info = pair.start + " – " + pair.end;
        if (pair.type) info += "  ·  " + pair.type;
        var sg = subgroupOf(pair);
        if (sg) info += "  ·  подгр. " + sg;

        var main = el("div", "ed-item-main");
        main.appendChild(el("div", "ed-item-time", info));
        var itemTitle = String(pair.title || "").trim();
        main.appendChild(el("div", itemTitle ? "ed-item-title" : "ed-item-title ed-item-title--empty",
          itemTitle || "Нет пары"));
        item.appendChild(main);

        var actionsBox = el("div", "ed-item-actions");

        var editBtn = el("button", "ed-edit", "Изменить");
        editBtn.type = "button";
        editBtn.addEventListener("click", function () { showForm(index); });
        actionsBox.appendChild(editBtn);

        var delBtn = el("button", "ed-del", "Удалить");
        delBtn.type = "button";
        armedButton(delBtn, "Удалить", "Точно?", function () {
          store.pairs(ed.week, ed.day).splice(index, 1);
          store.persist();
          hideForm();
          renderEdList();
          render();
        });
        actionsBox.appendChild(delBtn);

        item.appendChild(actionsBox);
        listNode.appendChild(item);
      });
    }



    function timeMaskInput(e) {
      var el = e.target;
      var pos = el.selectionStart || 0;
      var digits = el.value.replace(/\D/g, "").slice(0, 4);
      var before = el.value;
      var v = "";
      if (digits.length <= 2) {
        v = digits;
      } else {
        v = digits.slice(0, 2) + ":" + digits.slice(2, 4);
      }
      el.value = v;
      if (v !== before) {
        var newPos = pos;
        if (digits.length === 2 && before.indexOf(":") < 0) newPos = pos + 1;
        if (digits.length === 3 && before.indexOf(":") < 0) newPos = pos + 1;
        try { el.setSelectionRange(newPos, newPos); } catch (ex) {}
      }
    }

    function showForm(index) {
      ed.editIndex = index;
      var i = edRefs.inputs;

      if (index >= 0) {
        var pair = store.pairs(ed.week, ed.day)[index];
        i.start.value = formatTime(pair.start || "");
        i.end.value = formatTime(pair.end || "");
        i.title.value = pair.title || "";
        i.teacher.value = pair.teacher || "";
        i.room.value = pair.room || "";
        ed.type = TYPES.indexOf(pair.type) >= 0 ? pair.type : TYPES[0];
        ed.subgroup = pair.subgroup === 2 ? 2 : 1;
      } else {
        i.start.value = "";
        i.end.value = "";
        i.title.value = "";
        i.teacher.value = "";
        i.room.value = "";
        ed.type = TYPES[0];
        ed.subgroup = 1;
      }

      syncChips();
      form.hidden = false;
      i.start.focus();
      form.scrollIntoView({ block: "nearest" });
    }

    function hideForm() {
      form.hidden = true;
      ed.editIndex = -1;
    }

    function saveForm() {
      var i = edRefs.inputs;
      var start = i.start.value.trim();
      var end = i.end.value.trim();
      var title = i.title.value.trim();

      if (!start || !end) { toast("Укажи время начала и конца"); i.start.focus(); return; }

      start = formatTime(start);
      end = formatTime(end);

      var data = {
        start: start,
        end: end,
        title: title,
        teacher: i.teacher.value.trim(),
        room: i.room.value.trim(),
        type: ed.type
      };
      if (ed.type === "лаб") data.subgroup = ed.subgroup;

      var wasEdit = ed.editIndex >= 0;
      var pairs = store.pairs(ed.week, ed.day);
      if (wasEdit) pairs[ed.editIndex] = data;
      else pairs.push(data);

      pairs.sort(byTime);

      store.persist();
      hideForm();
      renderEdList();
      render();
      haptic("impact");

    }

    syncEdWeeks();
    syncEdDays();
    renderEdList();
  }

  function openEditor() {
    ed.week = state.week;
    ed.day = state.day;
    ed.editIndex = -1;
    buildEditor();
    editorNode.hidden = false;
    document.documentElement.style.overflow = "hidden";
    editorNode.scrollTop = 0;
  }

  function closeEditor() {
    editorNode.hidden = true;
    document.documentElement.style.overflow = "";
    renderHeader();
    render();
  }

  Array.prototype.forEach.call(document.querySelectorAll(".js-edit"), function (btn) {
    btn.addEventListener("click", openEditor);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !editorNode.hidden) closeEditor();
  });

  /* ================= Старт ================= */

  renderHeader();
  syncWeeks();
  syncDays();
  render();

  if (tg) {
    try { tg.ready(); } catch (e) {}
  }
})();
