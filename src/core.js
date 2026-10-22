// Clozed MCQ core: shared by the front and back templates.
// Reads the cloze HTML Anki renders, pulls each blank's ";;" choice list,
// and strips those lists from everything the user can see.
window.ClozedMCQ = (function () {
  // ===================================================================
  // --- CONFIGURATION ---
  // ===================================================================

  // Separates the answer from its distractors inside a cloze, as in
  // c1::Metformin;;Phenformin;;Buformin
  // (No double curly braces anywhere in this script: Anki reads them as field tags.)
  var LIST = ';;';

  // Options longer than this many characters stack as full-width rows.
  var LONG_OPTION = 24;

  // Key used to carry the picks from the front to the back.
  var STORE_KEY = 'clozed-mcq';

  // ===================================================================

  function isCloze(n) {
    return n.nodeType === 1 && n.matches('.cloze, .cloze-inactive');
  }

  function textOf(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return d.textContent;
  }

  function norm(html) {
    return textOf(html).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  // First text node holding the list marker in this cloze's own content,
  // skipping nested clozes (they own their own lists)
  function firstListText(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { return isCloze(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
    });
    for (var n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === 3 && n.data.indexOf(LIST) >= 0) return n;
    }
    return null;
  }

  // Removes the cloze's own list from the DOM and returns its items as HTML
  function cutList(root) {
    var t = firstListText(root);
    if (!t) return [];
    var range = document.createRange();
    range.setStart(t, t.data.indexOf(LIST));
    range.setEnd(root, root.childNodes.length);
    var box = document.createElement('div');
    box.appendChild(range.extractContents());
    return box.innerHTML.split(LIST)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return norm(s) !== ''; });
  }

  // Every blank shown as text (other clozes, or the answer side) loses its list
  function cleanVisible(root) {
    root.querySelectorAll('.cloze-inactive, .cloze:not([data-cloze])').forEach(cutList);
  }

  // Front side: the active blank's answer and distractors
  function readActive(span) {
    var box = document.createElement('div');
    box.innerHTML = span.getAttribute('data-cloze');
    var distractors = cutList(box);
    box.querySelectorAll('.cloze, .cloze-inactive').forEach(function (s) {
      cutList(s);
      while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s);
      s.remove();
    });

    // Hint written before the list: Anki put "hint;;a;;b" in the brackets
    var m = span.innerHTML.match(/^\[([\s\S]*)\]$/);
    if (m && m[1].indexOf(LIST) >= 0) {
      var parts = m[1].split(LIST).map(function (s) { return s.trim(); });
      span.innerHTML = '[' + (parts[0] || '...') + ']';
      parts.slice(1).forEach(function (p) { if (p) distractors.push(p); });
    }
    return { span: span, answer: box.innerHTML.trim(), distractors: distractors };
  }

  // A blank with no list of its own borrows the other answers on this card
  function borrowSiblings(blanks) {
    blanks.forEach(function (b) {
      if (b.distractors.length) return;
      b.distractors = blanks
        .filter(function (o) { return o !== b && norm(o.answer) !== norm(b.answer); })
        .map(function (o) { return o.answer; });
    });
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // One option per distinct text; the answer wins over the same text listed as a distractor
  function buildOptions(blank) {
    var seen = {}, out = [];
    function add(html, correct) {
      var k = norm(html);
      if (seen[k]) { if (correct) seen[k].correct = true; return; }
      seen[k] = { html: html, correct: correct };
      out.push(seen[k]);
    }
    add(blank.answer, true);
    blank.distractors.forEach(function (d) { add(d, false); });
    return shuffle(out);
  }

  // Ties saved picks to this exact card so a stale save is never applied
  function signature(answers) {
    return answers.map(norm).join('␞');
  }

  function isLong(options) {
    return options.some(function (o) { return textOf(o.html).length > LONG_OPTION; });
  }

  // Front: every active blank with its options; blanks with nothing to offer get none
  function readFront(question) {
    var blanks = Array.prototype.map.call(question.querySelectorAll('.cloze[data-cloze]'), readActive);
    cleanVisible(question);
    borrowSiblings(blanks);
    blanks.forEach(function (b) { if (b.distractors.length) b.options = buildOptions(b); });
    return blanks;
  }

  function save(data) {
    if (window.Persistence && Persistence.isAvailable()) Persistence.setItem(STORE_KEY, data);
  }

  function load() {
    if (!window.Persistence || !Persistence.isAvailable()) return null;
    var data = Persistence.getItem(STORE_KEY);
    Persistence.removeItem(STORE_KEY);
    return data;
  }

  return {
    readFront: readFront, cleanVisible: cleanVisible, signature: signature,
    isLong: isLong, norm: norm, save: save, load: load
  };
})();
