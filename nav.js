/* nav.js — shared admin sidebar section.
 *
 * Every page renders its own sidebar, but the Admin section (Owner Dashboard /
 * Super Admin Dashboard / Admin Dashboard + Support Queue + AI Monitor) is
 * centrally managed here so role-aware visibility and labeling stay consistent
 * site-wide.
 *
 * THE SLOT IS OVERWRITTEN, NOT DECORATED. render() assigns slot.innerHTML and
 * sets slot.style.display itself, so any admin link hand-written into the slot
 * on a page is destroyed on load. Add admin links HERE, never in a page — a
 * static one looks correct in the source and does not exist in the browser.
 *
 * Usage on a page:
 *   <div id="adminNavSection"></div>          <!-- slot in the sidebar -->
 *   <script src="nav.js" defer></script>     <!-- include once -->
 *
 * The script:
 *   - waits for window.sb (the Supabase client every page already creates)
 *   - asks my_experience() for the platform role and whether the caller is
 *     ACTIVE workspace staff (falls back to profiles.role +
 *     teacher_my_workspaces() until that migration is applied)
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
  var SUPPORT_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#ef4f5f;width:18px;height:18px;flex-shrink:0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  // Teaching uses the sidebar's own colours, not the admin red: it is not an
  // elevated-privilege link. See render().
  var TEACH_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>';

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

  /* A page may already carry its own Teaching link outside the slot
     (teacher.html does). Injecting a second one would show the same
     destination twice, so look for it before adding ours. */
  function hasOwnTeacherLink(slot) {
    var sidebar = document.querySelector('.sidebar');
    if (!sidebar) return false;
    var anchors = sidebar.querySelectorAll('a[href$="teacher.html"]');
    for (var i = 0; i < anchors.length; i++) {
      if (!slot || !slot.contains(anchors[i])) return true;
    }
    return false;
  }

  function render(slot, role, teaching) {
    var lvl = ROLE_LEVEL[role];
    if (typeof lvl !== 'number') lvl = 0;

    var page = currentPageFile();
    var aActive = page === 'admin.html' ? 'admin-active' : '';
    var mActive = page === 'ai-monitor.html' ? 'active' : '';
    var sActive = page === 'admin-support.html' ? 'active' : '';
    var label = ROLE_LABEL[role] || 'Admin Dashboard';
    var showMonitor = lvl >= 2;

    var html = '';

    /* Teaching is driven by a RELATIONSHIP, never by a rung on user_role: a
       teacher owns a workspace and an assistant works in one, and both may be
       plain 'user' accounts. That is the design, not an oversight — see
       supabase/migrations/20260830a_teacher_foundation_tables.sql. */
    if (teaching && !hasOwnTeacherLink(slot)) {
      html += ''
        + '<div class="side-sec">Teaching</div>'
        + '<a class="nav-item ' + (page === 'teacher.html' ? 'active' : '') + '" href="teacher.html">'
        +   TEACH_ICON
        +   '<span class="nav-label">Teacher Workspace</span>'
        + '</a>';
    }

    if (lvl < 1) {
      if (!html) { slot.innerHTML = ''; slot.style.display = 'none'; return; }
      slot.innerHTML = html;
      slot.style.display = 'block';
      return;
    }

    html += ''
      + '<div class="side-sec">Admin</div>'
      + '<a class="nav-item ' + aActive + '" href="admin.html" style="color:#ef4f5f">'
      +   ADMIN_ICON
      +   '<span class="nav-label">' + label + '</span>'
      + '</a>'
      // Support Queue sits at lvl >= 1, the same threshold as Admin Dashboard,
      // because that is exactly what the database enforces: every admin_support_*
      // RPC calls support_require_agent(), which is has_role_at_least('admin').
      // Showing it to anyone lower would be a link to a page whose every action
      // returns 42501.
      + '<a class="nav-item ' + sActive + '" href="admin-support.html" style="color:#ef4f5f">'
      +   SUPPORT_ICON
      +   '<span class="nav-label">Support Queue</span>'
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
      /* my_experience() (20260830i) is the single answer to "which product is
         this account in?" — it reports the platform role and whether the caller
         is ACTIVE staff, in one call, about the caller and nobody else.

         It is a hand-applied migration while this file deploys with the site on
         merge, so the two arrive in either order. Before it exists the call
         returns an error and this falls back to what nav.js did before: read
         profiles.role, then ask teacher_my_workspaces(). Both paths are checked
         below so neither can rot. */
      var role = null;
      var teaching = null;
      try {
        var xres = await sb.rpc('my_experience');
        var x = xres && !xres.error && xres.data;
        if (x && typeof x === 'object') {
          role = x.platform_role || 'user';
          teaching = x.can_staff === true;
        }
      } catch (_) { role = null; teaching = null; }

      if (role === null) {
        var pres = await sb.from('profiles').select('role, is_admin').eq('id', user.id).maybeSingle();
        var prof = pres && pres.data;
        role = (prof && prof.role) || (prof && prof.is_admin ? 'admin' : 'user');
      }

      if (teaching === null) {
        /* Only an ACTIVE staff row is teaching. A pending assistant has applied
           and been approved by nobody — teacher_roster() and
           teacher_student_weaknesses() both refuse them — so the link would open
           a page of permission errors. This line used to accept any row that was
           not 'removed', which showed the Teaching link to exactly that account. */
        teaching = false;
        try {
          var tres = await sb.rpc('teacher_my_workspaces');
          var trows = (tres && tres.data) || [];
          teaching = trows.some(function (r) { return r && r.staff_status === 'active'; });
        } catch (_) { teaching = false; }
      }

      render(slot, role, teaching);
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
      '@media(min-width:1024px){.nav-collapse-btn{display:flex}}',

      /* Smooth collapse animation. .sidebar already has a transform transition
         on most pages; we add a matching transition to .main padding so the
         content slides into place when the sidebar is hidden. */
      '@media(min-width:1024px){.main{transition:padding-left .32s cubic-bezier(.5,.1,.25,1),padding-right .32s cubic-bezier(.5,.1,.25,1)}}',
      '@media(min-width:1024px){.sidebar{transition:transform .32s cubic-bezier(.5,.1,.25,1)}}',

      /* Collapsed state: hide the sidebar and let .main fill the viewport,
         capped at 1320px content width and centered. The !important is
         needed to win over the per-page .main padding-left rules. */
      '@media(min-width:1024px){body.sidebar-collapsed .sidebar{transform:translateX(-100%)!important}}',
      '@media(min-width:1024px){body.sidebar-collapsed .main{padding-left:max(18px,(100vw - 1320px)/2)!important;padding-right:max(18px,(100vw - 1320px)/2)!important;max-width:none!important;margin:0!important}}',
      '@media(min-width:1024px){body.sidebar-collapsed .topbar{padding-left:18px!important}}'
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
