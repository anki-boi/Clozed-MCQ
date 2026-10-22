// A small stand-in for Anki's reviewer, shared by the preview page and the demo stage.
// Expects a global TEMPLATES ({ front, back, css, fields }) written in by build.py.

// ---- Cloze renderer (mirrors the HTML from Anki's rslib/src/cloze.rs) ----
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function parseNote(src) {
  const root = { kids: [] }, stack = [root];
  let i = 0, buf = '';
  const flush = () => { if (buf) { stack[stack.length - 1].kids.push(buf); buf = ''; } };
  while (i < src.length) {
    const m = src.slice(i).match(/^\{\{c(\d+(?:,\d+)*)::/);
    if (m) {
      flush();
      const node = { ords: m[1].split(',').map(Number), kids: [] };
      stack[stack.length - 1].kids.push(node); stack.push(node);
      i += m[0].length; continue;
    }
    if (src.startsWith('}}', i) && stack.length > 1) {
      flush();
      const node = stack.pop();
      // Anki splits the hint off the first text node at the first "::"
      if (typeof node.kids[0] === 'string') {
        const k = node.kids[0].indexOf('::');
        if (k >= 0) { node.hint = node.kids[0].slice(k + 2); node.kids[0] = node.kids[0].slice(0, k); }
      }
      i += 2; continue;
    }
    buf += src[i++];
  }
  flush();
  return root.kids;
}

function ordsOf(nodes, out = new Set()) {
  nodes.forEach(n => { if (typeof n !== 'string') { n.ords.forEach(o => out.add(o)); ordsOf(n.kids, out); } });
  return [...out].sort((a, b) => a - b);
}

function renderNodes(nodes, ord, question) {
  return nodes.map(n => typeof n === 'string' ? n : renderCloze(n, ord, question)).join('');
}

function renderCloze(n, ord, question) {
  const active = n.ords.includes(ord);
  const inner = renderNodes(n.kids, ord, question);
  if (active && question) return `<span class="cloze" data-cloze="${esc(inner)}" data-ordinal="${ord}">[${n.hint ?? '...'}]</span>`;
  if (active) return `<span class="cloze" data-ordinal="${ord}">${inner}</span>`;
  return `<span class="cloze-inactive" data-ordinal="${n.ords[0]}">${inner}</span>`;
}

// ---- Anki-style field substitution ----
function renderTemplate(tpl, fields, ord, question) {
  tpl = tpl.replace(/\{\{([#^])([^}]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (_, kind, name, body) => {
    const filled = (fields[name.trim()] || '').trim() !== '';
    return (kind === '#') === filled ? body : '';
  });
  return tpl.replace(/\{\{([^}]+)\}\}/g, (_, ref) => {
    const m = ref.match(/^cloze:(.+)$/);
    if (m) return renderNodes(parseNote(fields[m[1].trim()] || ''), ord, question);
    const name = ref.trim();
    // Anki refuses a template that names a field the note type does not have
    if (!TEMPLATES.fields.includes(name) && name !== 'Tags') throw new Error(`Template names "${name}", which is not a field`);
    return fields[name] ?? '';
  });
}

// ---- The reviewer: one page, card HTML swapped in, scripts re-run, like Anki desktop ----
function mountReviewer(frame, onReady) {
  frame.srcdoc = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${TEMPLATES.css}</style></head><body class="card"><div id="qa"></div>
<script>
window.py = {};   // Anki desktop exposes this; anki-persistence stores picks on it
window.setQA = function (html) {
  var qa = document.getElementById('qa');
  qa.innerHTML = html;
  qa.querySelectorAll('script').forEach(function (old) {
    var s = document.createElement('script');
    s.textContent = old.textContent;
    old.replaceWith(s);
  });
};
<\/script></body></html>`;
  frame.onload = onReady;
  return {
    show(fields, ord, question) {
      frame.contentWindow.setQA(renderTemplate(question ? TEMPLATES.front : TEMPLATES.back, fields, ord, question));
    },
    night(on) {
      frame.contentDocument.body.className = 'card' + (on ? ' nightMode night_mode' : '');
    },
  };
}
