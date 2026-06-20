/* nav.js — shared admin sidebar section.
 *
 * Every page renders its own sidebar, but the Admin section (Owner Dashboard /
 * Super Admin Dashboard / Admin Dashboard + AI Monitor) is centrally managed
 * here so role-aware visibility and labeling stay consistent site-wide.
 *
 * Usage on a page:
 *   <div id="adminNavSection"></div>          <!-- slot in the sidebar -->
 *   <script src="nav.js" defer></script>     <!-- include once -->
 *
 * The script:
 *   - waits for window.sb (the Supabase client every page already creates)
 *   - reads profiles.role (falls back to is_admin -> 'admin')
 *   - injects "Admin Dashboard" / "Super Admin Dashboard" / "Owner Dashboard"
 *     plus "AI Monitor" (super_admin+ only)
 *   - removes any duplicate admin-link anchors that older inline JS may append
 *     to the sidebar (so frozen pages with their own injection still render
 *     cleanly without a second admin link).
 */
(function () {
  'use strict';

  var SLOT_ID = 'adminNavSection';
  var ROLE_LEVEL = { user: 0, admin: 1, super_admin: 2, owner: 3 };
  var ROLE_LABEL = {
    owner: 'Owner Dashboard',
    super_admin: 'Super Admin Dashboard',
    admin: 'Admin Dashboard',
  };

  var ADMIN_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#ef4f5f;width:18px;height:18px;flex-shrink:0"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>';
  var MONITOR_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#ef4f5f;width:18px;height:18px;flex-shrink:0"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 8l3 3 2-2 3 3"/></svg>';

  // Every page already loads the @supabase/supabase-js CDN bundle which
  // exposes `window.supabase`. nav.js creates its own dedicated client
  // (the publishable key is the same anon key embedded in every page) so
  // we don't depend on each page assigning its `sb` to window.
  var SUPA_URL = 'https://igvkyxkmjnkzscqgommj.supabase.co';
  var SUPA_KEY = 'sb_publishable_MTRD_njnCX-1CobeqTIMiw_QhNYarXp';

  function waitForSupabaseLib(timeoutMs) {
    return new Promise(function (resolve) {
      if (window.supabase && window.supabase.createClient) return resolve(window.supabase);
      var elapsed = 0;
      var step = 50;
      var t = setInterval(function () {
        elapsed += step;
        if (window.supabase && window.supabase.createClient) { clearInterval(t); resolve(window.supabase); }
        else if (elapsed >= timeoutMs) { clearInterval(t); resolve(null); }
      }, step);
    });
  }

  var _client = null;
  async function getClient() {
    if (_client) return _client;
    var lib = await waitForSupabaseLib(7000);
    if (!lib) return null;
    _client = lib.createClient(SUPA_URL, SUPA_KEY);
    return _client;
  }

  function currentPageFile() {
    var p = (location.pathname || '').split('/').pop() || '';
    return p.toLowerCase();
  }

  function removeDuplicateAdminLinks(slot) {
    // Older inline JS on a few pages (focus.html, weakness.html) appends
    // <a href="admin.html"> directly to .sidebar. Remove anything outside
    // the slot that points at admin.html or ai-monitor.html.
    var sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    var anchors = sidebar.querySelectorAll('a[href$="admin.html"], a[href$="ai-monitor.html"]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      if (slot && slot.contains(a)) continue;
      a.parentNode && a.parentNode.removeChild(a);
    }
  }

  function render(slot, role) {
    var lvl = ROLE_LEVEL[role];
    if (typeof lvl !== 'number') lvl = 0;
    if (lvl < 1) {
      slot.innerHTML = '';
      slot.style.display = 'none';
      return;
    }

    var page = currentPageFile();
    var aActive = page === 'admin.html' ? 'admin-active' : '';
    var mActive = page === 'ai-monitor.html' ? 'active' : '';
    var label = ROLE_LABEL[role] || 'Admin Dashboard';
    var showMonitor = lvl >= 2;

    var html = ''
      + '<div class="side-sec">Admin</div>'
      + '<a class="nav-item ' + aActive + '" href="admin.html" style="color:#ef4f5f">'
      +   ADMIN_ICON
      +   '<span class="nav-label">' + label + '</span>'
      + '</a>';
    if (showMonitor) {
      html += ''
        + '<a class="nav-item ' + mActive + '" href="ai-monitor.html" style="color:#ef4f5f">'
        +   MONITOR_ICON
        +   '<span class="nav-label">AI Monitor</span>'
        + '</a>';
    }
    slot.innerHTML = html;
    slot.style.display = 'block';
  }

  async function init() {
    var slot = document.getElementById(SLOT_ID);
    if (!slot) return;
    var sb = await getClient();
    if (!sb) return;
    try {
      var ures = await sb.auth.getUser();
      var user = ures && ures.data && ures.data.user;
      if (!user) { slot.style.display = 'none'; return; }
      var pres = await sb.from('profiles').select('role, is_admin').eq('id', user.id).maybeSingle();
      var prof = pres && pres.data;
      var role = (prof && prof.role) || (prof && prof.is_admin ? 'admin' : 'user');
      render(slot, role);
      removeDuplicateAdminLinks(slot);

      // Some legacy pages append admin links AFTER auth completes. Sweep
      // duplicates once more on the next animation frame and again 500ms
      // later — cheap, covers the common race without a permanent observer.
      requestAnimationFrame(function () { removeDuplicateAdminLinks(slot); });
      setTimeout(function () { removeDuplicateAdminLinks(slot); }, 500);
      setTimeout(function () { removeDuplicateAdminLinks(slot); }, 1500);
    } catch (e) {
      console.error('[nav.js]', e);
    }
  }

  // ── Global theme + collapsible sidebar ────────────────────────────────────
  // Runs on every page that includes nav.js (all 13). Handles:
  //   1. Dark site background as a safety net. Most pages already set bg on
  //      <body>, but a stray white html element shows through on tall layouts.
  //      Setting it via JS also covers the three frozen pages where we can't
  //      edit CSS directly.
  //   2. Collapse toggle. The button lives top-left, in a single fixed
  //      position so it stays visible whether the sidebar is open or hidden.
  //      State persists in localStorage and applies before paint to avoid
  //      a flash of the wrong layout.
  var STORAGE_KEY = 'siteSidebarCollapsed';

  function injectGlobalStyles() {
    if (document.getElementById('nav-js-globals')) return;
    var css = [
      'html{background:#050a14}',

      /* Toggle button — desktop only. Mobile keeps the existing hamburger. */
      '.nav-collapse-btn{position:fixed;top:calc(var(--nav-h, 56px) + env(safe-area-inset-top, 0) + 10px);left:10px;z-index:80;width:34px;height:34px;display:none;align-items:center;justify-content:center;border-radius:9px;background:rgba(10,18,36,.85);border:1px solid rgba(56,189,248,.32);color:#cbd5e1;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:background .15s,border-color .15s,color .15s}',
      '.nav-collapse-btn:hover{background:rgba(56,189,248,.16);border-color:rgba(56,189,248,.6);color:#fff}',
      '.nav-collapse-btn svg{width:16px;height:16px;transition:transform .28s ease}',
      'body.sidebar-collapsed .nav-collapse-btn svg{transform:rotate(180deg)}',
      '@media(min-width:768px){.nav-collapse-btn{display:flex}}',

      /* Smooth collapse animation. .sidebar already has a transform transition
         on most pages; we add a matching transition to .main padding so the
         content slides into place when the sidebar is hidden. */
      '@media(min-width:768px){.main{transition:padding-left .32s cubic-bezier(.5,.1,.25,1),padding-right .32s cubic-bezier(.5,.1,.25,1)}}',
      '@media(min-width:768px){.sidebar{transition:transform .32s cubic-bezier(.5,.1,.25,1)}}',

      /* Collapsed state: hide the sidebar and let .main fill the viewport,
         capped at 1320px content width and centered. The !important is
         needed to win over the per-page .main padding-left rules. */
      '@media(min-width:768px){body.sidebar-collapsed .sidebar{transform:translateX(-100%)!important}}',
      '@media(min-width:768px){body.sidebar-collapsed .main{padding-left:max(18px,(100vw - 1320px)/2)!important;padding-right:max(18px,(100vw - 1320px)/2)!important;max-width:none!important;margin:0!important}}',
      '@media(min-width:768px){body.sidebar-collapsed .topbar{padding-left:18px!important}}'
    ].join('');

    var st = document.createElement('style');
    st.id = 'nav-js-globals';
    st.textContent = css;
    // Insert as the LAST stylesheet in <head> so it overrides per-page rules
    // for the collapsed state. Per-page rules still win for the expanded
    // state (no body class) because they're more specific.
    document.head.appendChild(st);
  }

  function ensureCollapseButton() {
    if (document.querySelector('.nav-collapse-btn')) return;
    if (!document.querySelector('.sidebar')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-collapse-btn';
    btn.setAttribute('aria-label', 'Toggle sidebar');
    btn.title = 'Toggle sidebar';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    btn.addEventListener('click', function () {
      var collapsed = document.body.classList.toggle('sidebar-collapsed');
      try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch (e) {}
    });
    document.body.appendChild(btn);
  }

  // Apply the stored collapse class as early as possible — before
  // DOMContentLoaded fires — so the layout doesn't flash from expanded to
  // collapsed on page load. Called immediately at script-parse time.
  (function applyCollapseEarly() {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') {
        var apply = function () { document.body && document.body.classList.add('sidebar-collapsed'); };
        if (document.body) apply();
        else document.addEventListener('DOMContentLoaded', apply, { once: true });
      }
    } catch (e) {}
  })();

  function initGlobals() {
    injectGlobalStyles();
    ensureCollapseButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initGlobals(); init(); });
  } else {
    initGlobals();
    init();
  }
})();
