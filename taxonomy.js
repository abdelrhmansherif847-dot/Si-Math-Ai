/**
 * Taxonomy — single normalization authority for topic and subtopic strings.
 *
 * Environment-agnostic: attaches to window in browsers, exports via
 * module.exports in Node/edge-function environments.
 *
 * API:
 *   Taxonomy.normalizeTopic(s)    → canonical topic string
 *   Taxonomy.normalizeSubtopic(s) → canonical subtopic string
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Taxonomy = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /* ── Topic alias map ──
   * Keys are lowercase. Values are the canonical display form.
   * Add new aliases here; do not add them to individual callers.
   */
  var TOPIC_ALIASES = {
    'geometry':          'Geometry',
    'geometery':         'Geometry',
    'geomtry':           'Geometry',
    'الهندسة':           'Geometry',
    'algebra':           'Algebra',
    'algebera':          'Algebra',
    'algepra':           'Algebra',
    'الجبر':             'Algebra',
    'trigonometry':      'Trigonometry',
    'trig':              'Trigonometry',
    'حساب المثلثات':     'Trigonometry',
    'statistics':        'Statistics',
    'الإحصاء':           'Statistics',
    'probability':       'Probability',
    'الاحتمالات':        'Probability',
    'calculus':          'Calculus',
    'number theory':     'Number Theory',
    'نظرية الأعداد':     'Number Theory',
    'word problems':     'Word Problems',
    'مسائل كلامية':      'Word Problems',
    'sat math':          'SAT Math',
    'sat mathematics':   'SAT Math',
    'est math':          'SAT Math',
    'linear equations':  'Linear Equations',
    'quadratic equations':'Quadratic Equations',
    'order of operations':'Order of Operations',
    'complex numbers':   'Complex Numbers',
    'functions':         'Functions',
    'inequalities':      'Inequalities',
  };

  /* ── Subtopic alias map ──
   * Keys are lowercase (after parenthetical strip). Values are canonical.
   * Parenthetical qualifiers are stripped before alias lookup, so both
   * "Order of operations" and "Order of operations (PEMDAS)" resolve to
   * "Order of operations" via the alias map entry for 'order of operations'.
   */
  var SUBTOPIC_ALIASES = {
    'circle':                    'Circles',
    'circles':                   'Circles',
    'linear equation':           'Linear Equations',
    'linear equations':          'Linear Equations',
    'linear':                    'Linear',
    'order of operations':       'Order of operations',
    'pemdas':                    'Order of operations',
  };

  /* ── System / non-academic topic filter ──
   * Any topic whose lowercased trim matches this set is treated as a
   * meta/coaching/system topic rather than a mathematics subject.
   * isAcademicTopic() returns false for these, and for strings that are
   * null, empty, or shorter than 2 characters.
   */
  var SYSTEM_TOPICS = new Set([
    // Meta / coaching
    'confidence', 'session start', 'study coaching', 'problem clarification',
    'off-topic', 'off topic', 'specialization', 'zero', 'general', 'greeting',
    'feedback', 'motivation', 'encouragement', 'clarification', 'meta', 'system',
    'chat', 'intro', 'introduction', 'explanation', 'review',
    'other', 'none', 'unknown', 'miscellaneous', 'hint', 'hints',
    // Generic math labels (too broad to be useful as topics)
    'math', 'mathematics', 'maths', 'general math', 'basic math',
    // Arabic generic labels
    'الرياضيات', 'رياضيات', 'العلوم',
    // Test-taking / strategy
    'test taking', 'test-taking', 'test strategy', 'test strategies',
    'test-taking strategies', 'test taking strategies',
    'exam strategy', 'exam strategies', 'exam preparation', 'exam prep',
    'exam structure', 'exam tips', 'exam technique', 'exam techniques',
    'sat', 'gpa', 'est', 'sat prep', 'est prep',
    // Study skills
    'study methods', 'study method', 'study techniques', 'study technique',
    'study skills', 'study skill', 'study tips', 'study tip', 'study habits',
    'study planning', 'study plan',
    'bubblesheet technique', 'bubble sheet', 'bubblesheets', 'answer sheet',
    // Time / planning
    'time management', 'planning', 'scheduling', 'organization',
    // Arabic equivalents
    'التخطيط', 'تخطيط', 'إدارة الوقت', 'استراتيجية', 'استراتيجي',
    'التخطيط للامتحان', 'اختبار', 'الامتحان',
  ]);

  function isAcademicTopic(topic) {
    if (!topic || topic.trim().length < 2) return false;
    return !SYSTEM_TOPICS.has(topic.toLowerCase().trim());
  }

  /* ── Concept alias map ──
   * Normalises raw concept strings extracted from question records into
   * consistent canonical labels. Keys are lowercase. Values are canonical.
   * Unknown concepts fall through to title-case of the original string.
   */
  var CONCEPT_CANON = {
    'isolation of variable':   'Isolating Variables',
    'isolating variable':      'Isolating Variables',
    'isolation of variables':  'Isolating Variables',
    'isolating a variable':    'Isolating Variables',
    'isolate variable':        'Isolating Variables',
    'isolate variables':       'Isolating Variables',
    'linear equation':         'Linear Equations',
    'linear equations':        'Linear Equations',
    'inverse operation':       'Inverse Operations',
    'inverse operations':      'Inverse Operations',
    'solving for variable':    'Solving for Variables',
    'solving for variables':   'Solving for Variables',
    'solving for x':           'Solving for Variables',
    'solve for x':             'Solving for Variables',
    'quadratic equation':      'Quadratic Equations',
    'quadratic equations':     'Quadratic Equations',
    'systems of equation':     'Systems of Equations',
    'system of equations':     'Systems of Equations',
    'slope intercept form':    'Slope-Intercept Form',
    'slope-intercept':         'Slope-Intercept Form',
    'slope intercept':         'Slope-Intercept Form',
    'order of operation':      'Order of Operations',
    'order of operations':     'Order of Operations',
    'substitution method':     'Substitution Method',
    'elimination method':      'Elimination Method',
    'distributive property':   'Distributive Property',
    'combining like terms':    'Combining Like Terms',
    'combining like term':     'Combining Like Terms',
  };

  function normalizeConcept(c) {
    if (!c) return null;
    var t = c.trim();
    var key = t.toLowerCase();
    if (CONCEPT_CANON[key]) return CONCEPT_CANON[key];
    return t.replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
  }

  function dedupeConceptList(arr) {
    var seen = new Set();
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var n = normalizeConcept(arr[i]);
      if (!n) continue;
      var k = n.toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(n); }
    }
    return out;
  }

  /* ── Subtopic coverage map ──
   * Canonical topic → ordered list of subtopics for the coverage rail.
   * Keys are canonical display form (post-normalizeTopic).
   * subtopicsFor() normalises raw input before lookup; returns [] for unknowns.
   * Callers must tolerate an empty array — do not infer subtopics from other sources.
   */
  var SUBTOPIC_MAP = {
    'Algebra':             ['Linear Equations','Systems of Equations','Quadratic Equations','Polynomials','Inequalities','Absolute Value','Exponents & Radicals','Functions','Sequences & Patterns'],
    'Geometry':            ['Triangles','Circles','Angles & Lines','Coordinate Geometry','Area & Volume','Similar Figures','Transformations','3D Shapes'],
    'Word Problems':       ['Linear Word Problems','Percent Problems','Ratio Problems','Rate & Work Problems','Mixture Problems','Distance & Speed Problems','Statistics Word Problems'],
    'Statistics':          ['Mean, Median, Mode','Standard Deviation','Data Tables','Scatter Plots','Probability','Sampling Methods','Survey Design'],
    'Trigonometry':        ['Sin, Cos, Tan','Unit Circle','Trig Identities','Radian Measure','Inverse Trig','Law of Sines & Cosines'],
    'Number Theory':       ['Integers','Fractions & Decimals','Percentages','Ratios & Proportions','Prime Numbers','Factors & Multiples'],
    'Calculus':            ['Limits','Derivatives','Chain Rule','Product Rule','Integration','Optimization Problems'],
    'Probability':         ['Basic Probability','Compound Events','Conditional Probability','Combinations','Permutations'],
    'Linear Equations':    ['One-Variable Equations','Two-Variable Equations','Slope & Rate of Change','Intercepts','Parallel & Perpendicular Lines'],
    'Order of operations': ['PEMDAS Rules','Nested Parentheses','Integer Operations','Fraction Operations'],
    'Quadratic Equations': ['Factoring','Quadratic Formula','Completing the Square','Vertex Form','Discriminant'],
    'Complex Numbers':     ['Imaginary Numbers','Operations with Complex Numbers','Complex Conjugates','Modulus & Argument'],
  };

  /* subtopicsFor normalises before lookup so callers can pass raw strings. */
  function subtopicsFor(topic) {
    if (!topic) return [];
    var canonical = normalizeTopic(topic);
    return SUBTOPIC_MAP[canonical] || SUBTOPIC_MAP[topic] || [];
  }

  /* Strip trailing parenthetical qualifier, e.g. "Foo (Bar)" → "Foo" */
  function stripParens(s) {
    return s.replace(/\s*\([^)]+\)\s*$/, '').trim();
  }

  function normalizeTopic(s) {
    if (!s) return s;
    var t = s.trim();
    var lower = t.toLowerCase();
    return TOPIC_ALIASES[lower] || (t.charAt(0).toUpperCase() + t.slice(1));
  }

  function normalizeSubtopic(s) {
    if (!s) return s;
    var t = stripParens(s.trim());
    var lower = t.toLowerCase();
    return SUBTOPIC_ALIASES[lower] || t;
  }

  return {
    normalizeTopic:      normalizeTopic,
    normalizeSubtopic:   normalizeSubtopic,
    isAcademicTopic:     isAcademicTopic,
    normalizeConcept:    normalizeConcept,
    dedupeConceptList:   dedupeConceptList,
    subtopicsFor:        subtopicsFor,
    /* Exposed for tests and introspection — do not mutate at runtime */
    _topicAliases:      TOPIC_ALIASES,
    _subtopicAliases:   SUBTOPIC_ALIASES,
    _systemTopics:      SYSTEM_TOPICS,
    _conceptAliases:    CONCEPT_CANON,
    _subtopicMap:       SUBTOPIC_MAP,
  };
}));
