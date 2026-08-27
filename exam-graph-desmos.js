// The official Desmos provider — architecture complete, activation gated.
//
// THE LICENSING POSITION, FROM THE PRIMARY SOURCE
// -----------------------------------------------
// Quoted from the Desmos API Terms of Service, which Desmos publishes at
// github.com/desmosinc/policies (api-terms.md). These are NOT the general
// website Terms of Service, and the difference matters — an earlier note in
// this repository concluded from the website terms that "there is no free or
// self-serve route for a commercial exam-prep product." That is wrong. The API
// terms provide one:
//
//   §2.a "Your use must be solely for (a) personal, non-commercial use or
//        (b) a 90 day trial for internal testing to evaluate in preparation
//        for commercial use."
//
//   §3.a "Prior to any use of the Software Services outside of the Trial Tier
//        Usage Limits, including as part of any commercial Application, you
//        agree to: (a) upgrade to an appropriate paid plan via our self-service
//        pathway or (b) contact us via email to partnerships@desmos.com and
//        enter into a written Commercial Addendum to these Terms."
//
//   §5.c "Your API Key is intended to be used by you and to identify your
//        Application. You will keep your API Key confidential and make
//        reasonable efforts to prevent and discourage others from using your
//        API Key."
//
//   §6.b grants "a non-exclusive, revocable, non-transferable,
//        non-sublicenseable, limited license to use, display and reproduce
//        Desmos Studio's trademarks ... solely for the purposes of identifying
//        the use of the Software Service within the Applications. You may not
//        use the Marks in marketing or promotional materials without our
//        express prior written consent."
//
// So: naming Desmos INSIDE the product to identify the tool is licensed once we
// are a licensee. Naming it in marketing is not, without separate consent.
//
// WHAT THIS FILE DOES AND DOES NOT DO
// -----------------------------------
// It loads the OFFICIAL API script from Desmos's own origin with our key. It
// does not iframe desmos.com, does not mirror anything, bundles no Desmos code,
// and reproduces no part of their interface. With no key configured it does
// nothing at all and reports why — activation is gated on credentials, and the
// gate is the absence of a key rather than a flag someone can flip by accident.
//
// The calculator's own UI is left ALONE once mounted. Zero belongs to our
// chrome — the launcher, and the workspace header above the calculator — and
// never on top of Desmos's surface.
(function (root) {
  'use strict';

  var API_VERSION = 'v1.11';
  var SCRIPT_ID = 'si-desmos-api';

  // Configuration is READ, never hard-coded. A key committed to a public
  // repository is a key published, whatever §5.c says about confidentiality.
  function config() {
    try { return (root.SI_DESMOS_CONFIG || {}); } catch (e) { return {}; }
  }
  function apiKey() { return String(config().apiKey || '').trim(); }

  /**
   * Why this provider is or is not available, in a form the UI can show a
   * student and an owner can act on. Four states, and "unlicensed" is a
   * deliberate one rather than an error.
   */
  function status() {
    var c = config(), k = apiKey();
    if (!k) {
      return { ready: false, state: 'no-key',
        detail: 'No Desmos API key is configured. The integration is built and inert.' };
    }
    if (!c.tier) {
      return { ready: false, state: 'no-tier',
        detail: 'A key is present but no tier is declared. Set tier to "trial" ' +
                '(API terms §2.a, 90-day internal evaluation) or "commercial" ' +
                '(§3.a, self-serve paid plan or a written Commercial Addendum).' };
    }
    if (c.tier === 'trial' && c.studentFacing) {
      // The trial is for INTERNAL evaluation. Serving it to paying students is
      // outside §2.a, and the check is here rather than in a policy document
      // because a policy document cannot refuse to mount.
      return { ready: false, state: 'trial-misuse',
        detail: 'The 90-day trial tier is for internal testing only (§2.a). ' +
                'Serving it to students requires a paid plan or Commercial Addendum (§3.a).' };
    }
    return { ready: true, state: c.tier, detail: 'Desmos Graphing Calculator, ' + c.tier + ' tier.' };
  }

  function loadScript() {
    return new Promise(function (resolve, reject) {
      if (root.Desmos) return resolve(root.Desmos);
      var existing = document.getElementById(SCRIPT_ID);
      if (existing) {
        existing.addEventListener('load', function () { resolve(root.Desmos); });
        existing.addEventListener('error', function () { reject(new Error('load failed')); });
        return;
      }
      var s = document.createElement('script');
      s.id = SCRIPT_ID;
      // Desmos's own origin, their own script, our key. Nothing is copied here.
      s.src = 'https://www.desmos.com/api/' + API_VERSION +
              '/calculator.js?apiKey=' + encodeURIComponent(apiKey());
      s.async = true;
      s.onload = function () { resolve(root.Desmos); };
      s.onerror = function () { reject(new Error('The Desmos API could not be reached.')); };
      document.head.appendChild(s);
    });
  }

  var instance = null;

  /**
   * mount / unmount — the contract exam-calculator.js already defines. Nothing
   * about the exam UI changes when this provider is the active one; that is the
   * entire point of the abstraction.
   */
  function mount(elm, opts) {
    var st = status();
    if (!st.ready) return Promise.reject(new Error(st.detail));
    return loadScript().then(function (Desmos) {
      if (!Desmos || !Desmos.GraphingCalculator)
        throw new Error('The Desmos API loaded without a graphing calculator.');
      // Exam-appropriate options. Nothing here restyles the calculator; these
      // are its own documented settings.
      instance = Desmos.GraphingCalculator(elm, {
        expressions: true, settingsMenu: false, zoomButtons: true,
        border: false, lockViewport: false, images: false, folders: false,
        notes: false, links: false,
        graphpaper: true, keypad: true,
        invertedColors: !!(opts && opts.dark),
      });
      return instance;
    });
  }

  function unmount() {
    try { if (instance && instance.destroy) instance.destroy(); } catch (e) {}
    instance = null;
  }

  root.SiExamGraphDesmos = {
    id: 'desmos',
    // The name is used to IDENTIFY the tool inside the product, which §6.b
    // licenses. It is not used in marketing, which §6.b does not.
    displayName: 'Desmos Graphing Calculator',
    API_VERSION: API_VERSION,
    status: status,
    mount: mount,
    unmount: unmount,
    _config: config,
  };

  // Registration is unconditional; ACTIVATION is what the key gates. Registering
  // an unready provider is how the UI can offer an honest "configured but not
  // licensed" state instead of pretending the option does not exist.
  try {
    if (root.SiExamCalculator && root.SiExamCalculator.registerProvider) {
      root.SiExamCalculator.registerProvider('desmos', root.SiExamGraphDesmos);
    }
  } catch (e) {}
}(typeof globalThis !== 'undefined' ? globalThis : this));
