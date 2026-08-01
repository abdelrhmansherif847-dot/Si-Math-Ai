/* _page-shell.mjs — the ONE definition of the Knowledge Center nav and footer.
 *
 * Nine public pages share a nav and a footer. Nine hand-maintained copies drift
 * within a release or two: a page gets added, five footers learn about it and
 * four do not, and the orphaned page never gets crawled. Since the generators
 * already exist (build-faq.mjs, build-learn.mjs), the shell lives here and both
 * of them — plus the scripted update for the hand-written pages — read it.
 *
 * Consumed by: scripts/build-faq.mjs, scripts/build-learn.mjs.
 * Verified by:  scripts/validate-knowledge-layer.mjs (internal-linking section).
 */

export const SITE = 'https://www.si-math-ai.com';

export const CANONICAL_DEFINITION =
  'Si Math AI is a comprehensive learning platform for SAT, ACT, and EST Mathematics ' +
  'that combines educational expertise, AI technology, personalized learning, analytics, ' +
  'and human support to help students improve their understanding and performance.';

/** Top-level nav. `current` is a filename, e.g. 'learn.html'. */
export function nav(current = '') {
  const items = [
    ['learn.html', 'Learn'],
    ['how-it-works.html', 'How It Works'],
    ['why-not-chatgpt.html', 'vs ChatGPT'],
    ['about.html', 'About'],
    ['faq.html', 'FAQ'],
    ['pricing.html', 'Pricing'],
  ];
  const links = items.map(([href, label]) => {
    const cur = href === current ? ' aria-current="page"' : '';
    return `    <li><a href="${href}"${cur}>${label}</a></li>`;
  }).join('\n');

  return `<nav class="k-nav">
  <a class="k-nav-logo" href="index.html">
    <img src="assets/si-math-ai-logo.jpg" alt="Si Math AI logo" width="32" height="32"/>
    <span class="k-nav-logo-text">Si<span>Math</span> AI</span>
  </a>
  <ul class="k-nav-links">
${links}
  </ul>
  <a class="k-nav-cta" href="signup.html">Start Free</a>
</nav>`;
}

/** Site footer. Four columns; every knowledge and learn page is reachable. */
export function footer() {
  return `<footer class="k-footer">
  <div class="k-wrap-wide">
    <div class="k-footer-grid">
      <div>
        <a class="k-nav-logo" href="index.html" style="margin-bottom:14px">
          <img src="assets/si-math-ai-logo.jpg" alt="Si Math AI logo" width="32" height="32"/>
          <span class="k-nav-logo-text">Si<span>Math</span> AI</span>
        </a>
        <p class="k-footer-about">
          A comprehensive learning platform for SAT, ACT, and EST Mathematics —
          combining educational expertise, AI technology, personalized learning,
          analytics, and human support.
        </p>
      </div>
      <div>
        <h3>Learn</h3>
        <ul>
          <li><a href="learn.html">All guides</a></li>
          <li><a href="learn-sat-math.html">SAT Math</a></li>
          <li><a href="learn-act-math.html">ACT Math</a></li>
          <li><a href="learn-est-math.html">EST Math</a></li>
          <li><a href="learn-choosing-your-exam.html">SAT vs ACT vs EST</a></li>
          <li><a href="learn-common-mistakes.html">Common mistakes</a></li>
          <li><a href="learn-parents-guide.html">Parent's guide</a></li>
        </ul>
      </div>
      <div>
        <h3>Knowledge</h3>
        <ul>
          <li><a href="about.html">About Si Math AI</a></li>
          <li><a href="why-we-built-si-math-ai.html">Why We Built It</a></li>
          <li><a href="principles.html">Educational Principles</a></li>
          <li><a href="how-it-works.html">How It Works</a></li>
          <li><a href="why-not-chatgpt.html">Why Not Just ChatGPT?</a></li>
          <li><a href="faq.html">FAQ</a></li>
        </ul>
      </div>
      <div>
        <h3>Evidence</h3>
        <ul>
          <li><a href="trust.html">Trust Center</a></li>
          <li><a href="evidence.html">Evidence Center</a></li>
          <li><a href="architecture.html">Architecture</a></li>
          <li><a href="changelog.html">Changelog</a></li>
          <li><a href="roadmap.html">Roadmap</a></li>
          <li><a href="ai-knowledge.html">Reference for AI Systems</a></li>
        </ul>
      </div>
      <div>
        <h3>Platform</h3>
        <ul>
          <li><a href="index.html">Home</a></li>
          <li><a href="pricing.html">Pricing</a></li>
          <li><a href="founder-badge.html">Founder Badge</a></li>
          <li><a href="signup.html">Start Free</a></li>
          <li><a href="login.html">Log In</a></li>
        </ul>
      </div>
    </div>
    <div class="k-footer-bottom">
      <span>© 2026 Si Math AI. All rights reserved.</span>
      <span>SAT · ACT · EST Mathematics</span>
    </div>
  </div>
</footer>`;
}

/** Shared <head> fragment: fonts, icons, stylesheet. */
export function headAssets() {
  return `<link rel="icon" href="assets/si-math-ai-logo.jpg"/>
<link rel="apple-touch-icon" href="assets/si-math-ai-logo.jpg"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="assets/knowledge.css"/>`;
}

/** The Organization node every page carries, so the entity resolves the same. */
export function organizationNode() {
  return {
    '@type': ['Organization', 'EducationalOrganization'],
    '@id': `${SITE}/#organization`,
    name: 'Si Math AI',
    url: `${SITE}/`,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE}/assets/si-math-ai-logo.jpg`,
      width: 1024,
      height: 1024,
    },
    description: CANONICAL_DEFINITION,
  };
}
