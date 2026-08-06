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
 * This is the ONLY implementation — chat.html and ai-monitor.html both call
 * these globals and neither carries a copy. Keep it that way: an earlier note
 * here warned against divergence from a duplicate in chat.html that no longer
 * exists, and a second implementation is exactly how the two surfaces would
 * start showing a student and an admin different things.
 *
 * Math protection is covered by tests/chat-renderer.test.mjs; the root cause it
 * guards is in docs/engineering/chat-renderer-math-protection.md.
 */
(function () {
  'use strict';

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function inlineFmt(t) {
    t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    return t;
  }

  // ── The single math authority ───────────────────────────────────────────
  // Every consumer that renders model-generated maths goes through protect().
  // It is deliberately the ONLY place in the codebase that decides where a
  // formula starts and ends. A second opinion is not a style problem: chat.html
  // once carried one (normalizeRuleFormula wrapped anything without a `$` in
  // `$…$`, turning a model's `\( p/q \)` into `$\( p/q \)$`, which KaTeX cannot
  // parse), and it produced the same class of bug in a different component
  // months after the first was fixed.
  function protect(raw) {
    // Step 1: Protect LaTeX BEFORE any escaping — store it as placeholders.
    // This prevents esc() from corrupting LaTeX that uses < > & characters,
    // and prevents inlineFmt from converting * inside math to <em>.
    //
    // ONE left-to-right pass, not a regex per delimiter style. The previous
    // version ran four sequential .replace() passes ($$, \[, $, \(), and both
    // of its failure modes came from that shape:
    //
    //   * A later pass could match ACROSS an earlier pass's placeholder and
    //     store it inside its own block. restoreMath is a single String.replace
    //     and replacement text is never rescanned, so the inner placeholder
    //     reached the DOM verbatim — the "▯M0▯" students reported.
    //   * The patterns were unanchored, so one unbalanced \( matched forward to
    //     the next \) anywhere later, swallowing headings and **bold** into a
    //     "math" block that never reached inlineFmt.
    //
    // Scanning once removes both by construction: a placeholder is only ever
    // emitted at the top level of the scan, because saving a block copies its
    // source verbatim and jumps past it. No placeholder can end up inside a
    // stored block, so one restore pass is provably sufficient.
    var mathBlocks = [];
    var strays = [];
    function saveMath(m) { return '\x01M' + (mathBlocks.push(m) - 1) + '\x01'; }
    function saveStray(d) { return '\x01D' + (strays.push(d) - 1) + '\x01'; }

    // Longest opener first, so $$ is tried before $.
    // multiline: display math legitimately spans lines; inline math does not.
    // That one rule is what stops a single unbalanced \( from eating a paragraph.
    var DELIMS = [
      { open: '$$',  close: '$$',  multiline: true  },
      { open: '\\[', close: '\\]', multiline: true  },
      { open: '\\(', close: '\\)', multiline: false },
      { open: '$',   close: '$',   multiline: false, dollar: true }
    ];

    // Is there a well-formed math span starting at i? Anything rejected here is
    // treated as ordinary text, which is the safe direction: a missed formula
    // renders as the source the student can still read, whereas a wrongly
    // accepted one swallows the prose around it.
    function mathAt(src, i) {
      for (var d = 0; d < DELIMS.length; d++) {
        var D = DELIMS[d];
        if (src.substr(i, D.open.length) !== D.open) continue;
        var from = i + D.open.length;
        var end  = src.indexOf(D.close, from);
        if (end < 0) continue;                              // unbalanced
        var body = src.slice(from, end);
        if (!body) continue;                                // empty
        if (!D.multiline && body.indexOf('\n') >= 0) continue;
        if (body.indexOf(D.open) >= 0) continue;            // nested opener = mis-pairing
        // Currency: "costs $5 and the pen costs $2" pairs two prose dollars and
        // eats the sentence between them. A closing inline $ is never glued to
        // an alphanumeric in real notation, but it always is in a price.
        if (D.dollar && /[0-9A-Za-z]/.test(src.charAt(end + D.close.length))) continue;
        return { raw: src.slice(i, end + D.close.length), end: end + D.close.length };
      }
      return null;
    }

    var s = '';
    for (var p = 0; p < raw.length;) {
      var hit = mathAt(raw, p);
      if (hit) { s += saveMath(hit.raw); p = hit.end; continue; }
      // A delimiter that is NOT math must not be left where KaTeX could pair it
      // with a real one further down — that would simply move the swallowing
      // out of here and into auto-render. Wrapping it in an ignored element
      // takes it out of KaTeX's scan while leaving it visible to the reader.
      var two = raw.substr(p, 2);
      if (two === '\\(' || two === '\\)' || two === '\\[' || two === '\\]') {
        s += saveStray(two); p += 2; continue;
      }
      if (raw.charAt(p) === '$') { s += saveStray('$'); p += 1; continue; }
      s += raw.charAt(p); p += 1;
    }
    // Math is restored ESCAPED. The saved block never went through esc() (that
    // is the point of saving it — esc() would corrupt LaTeX's < > &), but the
    // result of this function is assigned with innerHTML, so restoring the raw
    // source made anything between $...$ live markup: `$<img src=x
    // onerror=...>$` fired in the reader's session, and in the admin/AI-monitor
    // review panel it fired in an admin's. Escaping here is safe for KaTeX,
    // which reads textContent — the entity decodes back to the character in the
    // text node before renderMathInElement ever sees it.
    function restoreMath(t) {
      return t.replace(/\x01([MD])(\d+)\x01/g, function (_, kind, n) {
        return kind === 'M'
          ? esc(mathBlocks[+n])
          : '<span class="no-katex">' + esc(strays[+n]) + '</span>';
      });
    }
    // mathCount / strayCount let a caller ask what the tokenizer FOUND without
    // re-deciding it themselves — which is what the Rules Used path needs in
    // order to tell "a bare formula" from "a formula that already has
    // delimiters", instead of guessing from the presence of a `$`.
    return {
      text: s,
      mathCount: mathBlocks.length,
      strayCount: strays.length,
      restore: restoreMath
    };
  }

  function renderMarkdown(raw) {
    if (!raw) return '';
    var P = protect(raw);
    var s = P.text;
    // Step 2: Protect code blocks
    var codeBlocks = [];
    s = s.replace(/```[\w]*\n?([\s\S]*?)```/g, function (_, code) {
      var idx = codeBlocks.push('<pre class="ai-md" style="display:block"><code>' + esc(code.trim()) + '</code></pre>') - 1;
      return '\x00CODE' + idx + '\x00';
    });
    var lines = s.split('\n');
    var out = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (line.indexOf('\x00CODE') !== -1) {
        out.push(line.replace(/\x00CODE(\d+)\x00/g, function (_, n) { return codeBlocks[+n]; }));
        i++; continue;
      }
      // dir="auto" on every text block: the browser picks each block's base
      // direction from its first strong character, so Arabic blocks render RTL
      // and English blocks LTR, with mixed runs (variables, equations, names)
      // ordered naturally by the Unicode bidi algorithm. Matches ChatGPT behavior.
      if (/^\d+\. /.test(line)) {
        var items = [];
        while (i < lines.length && /^\d+\. /.test(lines[i])) {
          items.push('<li dir="auto">' + inlineFmt(esc(lines[i].replace(/^\d+\. /, ''))) + '</li>');
          i++;
        }
        out.push('<ol dir="auto">' + items.join('') + '</ol>');
        continue;
      }
      if (/^[-*] /.test(line)) {
        var bitems = [];
        while (i < lines.length && /^[-*] /.test(lines[i])) {
          bitems.push('<li dir="auto">' + inlineFmt(esc(lines[i].replace(/^[-*] /, ''))) + '</li>');
          i++;
        }
        out.push('<ul dir="auto">' + bitems.join('') + '</ul>');
        continue;
      }
      if (/^### /.test(line)) { out.push('<h5 dir="auto">' + inlineFmt(esc(line.slice(4))) + '</h5>'); i++; continue; }
      if (/^## /.test(line))  { out.push('<h4 dir="auto">' + inlineFmt(esc(line.slice(3))) + '</h4>'); i++; continue; }
      if (/^# /.test(line))   { out.push('<h3 dir="auto">' + inlineFmt(esc(line.slice(2))) + '</h3>'); i++; continue; }
      if (line.trim() === '') { out.push('<div class="md-sp"></div>'); i++; continue; }
      out.push('<p dir="auto">' + inlineFmt(esc(line)) + '</p>');
      i++;
    }
    // Step 3: Restore LaTeX blocks AFTER all HTML processing (they land as raw text in the DOM,
    // which KaTeX's renderMathInElement will then find and render as math).
    return '<div class="ai-md">' + P.restore(out.join('')) + '</div>';
  }

  /**
   * Inline sibling of renderMarkdown: identical maths handling, no block
   * wrappers. Exists so components that render into an inline <span> — the
   * Rules Used list is the one that needed it — can reuse this tokenizer
   * instead of growing their own. renderMarkdown's <div class="ai-md"><p>
   * output would break those layouts, and that mismatch is the whole reason a
   * second, weaker maths handler was written in chat.html in the first place.
   *
   * opts.mathIfBare: treat the entire string as one expression when the
   * tokenizer found NO maths and NO stray delimiter — the "the model returned
   * `ax^2 + bx + c = 0` with no delimiters at all" case. The condition is the
   * tokenizer's own finding rather than a guess about `$`, which is precisely
   * where the old normalizeRuleFormula went wrong: `\( p/q \)` has no `$`, so
   * it wrapped it into `$\( p/q \)$` and handed KaTeX something unparseable.
   * Requiring strayCount === 0 too keeps it from wrapping "costs $5 and $2".
   */
  function renderInline(raw, opts) {
    if (raw == null) return '';
    var src = String(raw);
    if (!src) return '';
    var P = protect(src);
    if (opts && opts.mathIfBare && P.mathCount === 0 && P.strayCount === 0) {
      P = protect('$' + src + '$');
    }
    return P.restore(inlineFmt(esc(P.text)));
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
            // renderMarkdown has already decided what is math and what is not.
            // Delimiters it rejected — an unbalanced \(, a price in dollars —
            // are wrapped in .no-katex so auto-render does not descend into
            // them and re-pair what the renderer deliberately left as prose.
            ignoredClasses: ['no-katex'],
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
  window.renderInline    = renderInline;
  window.renderMathInEl  = renderMathInEl;
  window.ChatRenderer    = { renderMarkdown: renderMarkdown, renderInline: renderInline,
                             renderMathInEl: renderMathInEl };
})();
