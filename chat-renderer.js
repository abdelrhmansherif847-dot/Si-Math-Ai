/* chat-renderer.js — shared Markdown + KaTeX renderer used by the AI Tutor
 * chat and by the Admin / AI Monitor feedback review panel.
 *
 * Single source of truth so admin-side review sees exactly what the student
 * saw. Exposes two functions both globally and on window.ChatRenderer:
 *
 *   renderMarkdown(raw)  -> HTML string ready to set as innerHTML
 *   renderMathInEl(el)   -> walks the element and renders KaTeX math
 *
 * KaTeX must be loaded on the page for math rendering:
 *   <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
 *   <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
 *   <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
 *
 * Behavior matches chat.html exactly — do not divergence-edit either side.
 */
(function () {
  'use strict';

  function renderMarkdown(raw) {
    if (!raw) return '';
    // Step 1: Protect LaTeX blocks BEFORE any escaping — store them as placeholders.
    // This prevents esc() from corrupting LaTeX that uses < > & characters,
    // and prevents inlineFmt from converting * inside math to <em>.
    var mathBlocks = [];
    function saveMath(m) { return '\x01M' + (mathBlocks.push(m) - 1) + '\x01'; }
    var s = raw;
    s = s.replace(/\$\$[\s\S]*?\$\$/g, saveMath);          // $$...$$  display
    s = s.replace(/\\\[[\s\S]*?\\\]/g, saveMath);           // \[...\]  display
    s = s.replace(/\$[^\$\n]+?\$/g, saveMath);              // $...$    inline
    s = s.replace(/\\\([\s\S]*?\\\)/g, saveMath);           // \(...\)  inline
    function restoreMath(t) {
      return t.replace(/\x01M(\d+)\x01/g, function (_, n) { return mathBlocks[+n]; });
    }
    function esc(str) {
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    // Step 2: Protect code blocks
    var codeBlocks = [];
    s = s.replace(/```[\w]*\n?([\s\S]*?)```/g, function (_, code) {
      var idx = codeBlocks.push('<pre class="ai-md" style="display:block"><code>' + esc(code.trim()) + '</code></pre>') - 1;
      return '\x00CODE' + idx + '\x00';
    });
    var lines = s.split('\n');
    var out = [];
    var i = 0;
    function inlineFmt(t) {
      t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
      t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
      return t;
    }
    while (i < lines.length) {
      var line = lines[i];
      if (line.indexOf('\x00CODE') !== -1) {
        out.push(line.replace(/\x00CODE(\d+)\x00/g, function (_, n) { return codeBlocks[+n]; }));
        i++; continue;
      }
      if (/^\d+\. /.test(line)) {
        var items = [];
        while (i < lines.length && /^\d+\. /.test(lines[i])) {
          items.push('<li>' + inlineFmt(esc(lines[i].replace(/^\d+\. /, ''))) + '</li>');
          i++;
        }
        out.push('<ol>' + items.join('') + '</ol>');
        continue;
      }
      if (/^[-*] /.test(line)) {
        var bitems = [];
        while (i < lines.length && /^[-*] /.test(lines[i])) {
          bitems.push('<li>' + inlineFmt(esc(lines[i].replace(/^[-*] /, ''))) + '</li>');
          i++;
        }
        out.push('<ul>' + bitems.join('') + '</ul>');
        continue;
      }
      if (/^### /.test(line)) { out.push('<h5>' + inlineFmt(esc(line.slice(4))) + '</h5>'); i++; continue; }
      if (/^## /.test(line))  { out.push('<h4>' + inlineFmt(esc(line.slice(3))) + '</h4>'); i++; continue; }
      if (/^# /.test(line))   { out.push('<h3>' + inlineFmt(esc(line.slice(2))) + '</h3>'); i++; continue; }
      if (line.trim() === '') { out.push('<div class="md-sp"></div>'); i++; continue; }
      out.push('<p>' + inlineFmt(esc(line)) + '</p>');
      i++;
    }
    // Step 3: Restore LaTeX blocks AFTER all HTML processing (they land as raw text in the DOM,
    // which KaTeX's renderMathInElement will then find and render as math).
    return '<div class="ai-md">' + restoreMath(out.join('')) + '</div>';
  }

  function renderMathInEl(el) {
    function doRender() {
      if (window.renderMathInElement) {
        try {
          window.renderMathInElement(el, {
            delimiters: [
              { left: '$$',  right: '$$',  display: true  },
              { left: '$',   right: '$',   display: false },
              { left: '\\(', right: '\\)', display: false },
              { left: '\\[', right: '\\]', display: true  }
            ],
            throwOnError: false
          });
        } catch (e) { /* KaTeX render error — show raw math as fallback */ }
      }
    }
    if (window.renderMathInElement) {
      doRender();
    } else {
      // Poll until KaTeX auto-render script loads (handles slow CDN / deferred loading)
      var _poll = setInterval(function () {
        if (window.renderMathInElement) { clearInterval(_poll); doRender(); }
      }, 80);
      setTimeout(function () { clearInterval(_poll); }, 8000);
    }
  }

  window.renderMarkdown  = renderMarkdown;
  window.renderMathInEl  = renderMathInEl;
  window.ChatRenderer    = { renderMarkdown: renderMarkdown, renderMathInEl: renderMathInEl };
})();
