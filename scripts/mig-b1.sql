-- MIG-B1: idempotent canonical backfill of weakness_signals.topic_id / subtopic_id.
-- Generated from the approved MIG-A CONFIDENT_FULL set: 69 pairs, 364 rows.
-- Idempotent & rerunnable: updates only rows whose target IS DISTINCT FROM current;
-- operates only on the approved mappings; never rewrites already-canonical rows.
CREATE TABLE IF NOT EXISTS public.mig_b1_map (topic_key text, subtopic_key text, topic_id text, subtopic_id text);
TRUNCATE public.mig_b1_map;
INSERT INTO public.mig_b1_map (topic_key, subtopic_key, topic_id, subtopic_id) VALUES
  ('Percentage Calculation','Weight and Percentages','PROBABILITY_RATIOS','PR_003'),
  ('Probability','General Probability Planning','PROBABILITY_RATIOS','PR_001'),
  ('Algebra','Linear Equations','ALGEBRA','ALG_006'),
  ('Geometry','Circles','GEOMETRY','GEO_006'),
  ('Statistics','Interquartile Range','STATISTICS','STA_003'),
  ('Algebra','Polynomials','ALGEBRA','ALG_004'),
  ('Algebra','Order of operations','ALGEBRA','ALG_001'),
  ('Algebra','Systems of Equations','ALGEBRA','ALG_007'),
  ('Algebra','Linear Equations & Functions','ALGEBRA','ALG_006'),
  ('Percentages','Weight and Percentages','PROBABILITY_RATIOS','PR_003'),
  ('Statistics','Mean, Median, Mode','STATISTICS','STA_002'),
  ('Probability','Independent Events','PROBABILITY_RATIOS','PR_001'),
  ('Geometry','Triangles','GEOMETRY','GEO_002'),
  ('Probability & Ratios','Ratio & Proportion','PROBABILITY_RATIOS','PR_004'),
  ('Probability & Ratios','Probability','PROBABILITY_RATIOS','PR_001'),
  ('Exponential Functions','Exponential Growth','ALGEBRA','ALG_011'),
  ('Probability','Basic Probability','PROBABILITY_RATIOS','PR_001'),
  ('Algebra','Radicals','ALGEBRA','ALG_003'),
  ('Geometry','Coordinate Geometry','GEOMETRY','GEO_008'),
  ('Statistics','Data Tables','STATISTICS','STA_005'),
  ('Statistics','Mean, Median & Mode','STATISTICS','STA_002'),
  ('Statistics','Data Analysis','STATISTICS','STA_005'),
  ('Statistics','Range & Interval','STATISTICS','STA_003'),
  ('Algebra','Age Problems','ALGEBRA','ALG_006'),
  ('Probability & Ratios','Percentages','PROBABILITY_RATIOS','PR_003'),
  ('Combinatorics','Permutations','PROBABILITY_RATIOS','PR_002'),
  ('Probability','Conditional Probability','PROBABILITY_RATIOS','PR_001'),
  ('Geometry','Polygons','GEOMETRY','GEO_003'),
  ('Geometry','Solid Geometry','GEOMETRY','GEO_007'),
  ('Linear Functions','Rate of Change','ALGEBRA','ALG_006'),
  ('Algebra','Quadratic Equations','ALGEBRA','ALG_010'),
  ('نسب','حساب النسبة المئوية','PROBABILITY_RATIOS','PR_003'),
  ('Algebra','Linear','ALGEBRA','ALG_006'),
  ('Quadratic Functions','Axis of Symmetry','ALGEBRA','ALG_010'),
  ('Algebra','Quadratic Functions','ALGEBRA','ALG_010'),
  ('Inequalities','Linear Inequalities','ALGEBRA','ALG_008'),
  ('Percentage','Discounts','PROBABILITY_RATIOS','PR_003'),
  ('Percentages','Discount Calculation','PROBABILITY_RATIOS','PR_003'),
  ('Algebra','Absolute Value','ALGEBRA','ALG_009'),
  ('Statistics','Median','STATISTICS','STA_002'),
  ('Trigonometry','Sin, Cos, Tan','GEOMETRY','GEO_005'),
  ('المثلثات','نظرية فيثاغورس','GEOMETRY','GEO_002'),
  ('Algebra','Exponents','ALGEBRA','ALG_002'),
  ('Permutations and Combinations','Permutations with Repetition','PROBABILITY_RATIOS','PR_002'),
  ('Systems of Equations','Systems of Equations','ALGEBRA','ALG_007'),
  ('Geometry','Similar Figures','GEOMETRY','GEO_004'),
  ('Geometry','Triangle Area','GEOMETRY','GEO_002'),
  ('Geometry','المساحة السطحية','GEOMETRY','GEO_007'),
  ('Geometry','Distance Between Points','GEOMETRY','GEO_008'),
  ('Exponential Functions','Equivalent Forms','ALGEBRA','ALG_011'),
  ('Algebra','Inequalities','ALGEBRA','ALG_008'),
  ('Geometry','Volume','GEOMETRY','GEO_007'),
  ('Geometry','3D Shapes','GEOMETRY','GEO_007'),
  ('Functions','Modeling with Functions','FUNCTIONS','FUN_001'),
  ('Algebra','Radicals and Simplification','ALGEBRA','ALG_003'),
  ('systems of equations','solving linear equations','ALGEBRA','ALG_006'),
  ('Linear Equations','Slope & Rate of Change','ALGEBRA','ALG_006'),
  ('Algebra','Solving Linear Equations','ALGEBRA','ALG_006'),
  ('احتمالات','احتمالات شرطية','PROBABILITY_RATIOS','PR_001'),
  ('Geometry','Distance between points','GEOMETRY','GEO_008'),
  ('Geometry','Area of a Rectangle','GEOMETRY','GEO_003'),
  ('Algebra','Order of operations (PEMDAS)','ALGEBRA','ALG_001'),
  ('Geometry','Area of Circles and Sectors','GEOMETRY','GEO_006'),
  ('Algebra','(blank)','ALGEBRA',NULL),
  ('Percentages','Percentage of Total','PROBABILITY_RATIOS','PR_003'),
  ('Geometry','Circles and Arcs','GEOMETRY','GEO_006'),
  ('Algebra','Cubic Functions','ALGEBRA','ALG_004'),
  ('Quadratic Functions','Vertex Form','ALGEBRA','ALG_010'),
  ('Triangles','Triangles','GEOMETRY','GEO_002');

WITH upd AS (
  UPDATE public.weakness_signals w
  SET topic_id = m.topic_id, subtopic_id = m.subtopic_id
  FROM public.mig_b1_map m
  WHERE COALESCE(NULLIF(TRIM(w.topic),''),'(blank)') = m.topic_key
    AND COALESCE(NULLIF(TRIM(w.subtopic),''),'(blank)') = m.subtopic_key
    AND (w.topic_id IS DISTINCT FROM m.topic_id OR w.subtopic_id IS DISTINCT FROM m.subtopic_id)
  RETURNING w.id
)
SELECT count(*) AS rows_updated FROM upd;
