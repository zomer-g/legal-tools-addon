/**
 * Config.gs -- Constants and configuration for the Legal Tools add-on
 */

// ============ Named Range Prefixes ============
var PREFIX_APPENDIX_REF = '_NSPCH_REF_';
var PREFIX_APPENDIX_LIST = '_NSPCH_LIST';
var PREFIX_ENTITY = '_YSHVT_';
var PREFIX_FOOTNOTE = '_HSHLY_';

// ============ Document Properties Keys ============
var PROP_APPENDIX_META = '_NSPCH_META';
var PROP_ENTITY_META = '_YSHVT_META';
var PROP_FOOTNOTE_META = '_HSHLY_META';
var PROP_FOOTNOTE_LIST = '_HSHLY_FOOTNOTES';

// ============ Hebrew Numbering ============
var HEBREW_LETTERS = [
  'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י',
  'יא', 'יב', 'יג', 'יד', 'טו', 'טז', 'יז', 'יח', 'יט', 'כ',
  'כא', 'כב', 'כג', 'כד', 'כה', 'כו', 'כז', 'כח', 'כט', 'ל',
  'לא', 'לב', 'לג', 'לד', 'לה', 'לו', 'לז', 'לח', 'לט', 'מ'
];

// ============ Entity Types ============
var ENTITY_TYPES = {
  PERSON: 'person',
  CORPORATION: 'corporation',
  PLACE: 'place',
  LEGAL_PROVISION: 'legal_provision',
  OTHER: 'other'
};

// ============ Footnote Citation Types ============
var CITATION_TYPES = {
  LEGISLATION: 'legislation',
  CASE_LAW: 'caselaw',
  LITERATURE: 'literature'
};

// ============ Proceeding Types for Case Law ============
var PROCEEDING_TYPES = [
  'בג"ץ', 'ע"א', 'ע"פ', 'ע"ע', 'עע"מ', 'רע"א', 'רע"פ',
  'דנ"א', 'דנ"פ', 'ת"א', 'ת"פ', 'ה"פ', 'בש"א', 'בש"פ',
  'עת"מ', 'ע"ב', 'תב"ע'
];

// ============ Publication Types for Legislation ============
var PUBLICATION_TYPES = {
  SEFER_HUKIM: 'ס"ח',
  KOVETZ_TAKANOT: 'ק"ת',
  ITON_RISHMI: 'י"פ',
  DINEI_MEDINAT_ISRAEL: 'דמ"י'
};

// ============ Reporter Types for Case Law ============
var REPORTER_TYPES = [
  'פ"ד', 'פד"ע', 'פד"מ', 'דינים', 'נבו', 'תקדין'
];

// ============ Hebrew Year Conversion ============
var HEBREW_YEAR_PREFIX = {
  5700: 'ת"ש',   5710: 'תש"י',  5720: 'תש"כ',  5730: 'תש"ל',
  5740: 'תש"מ',  5750: 'תש"נ',  5760: 'תש"ס',  5770: 'תש"ע',
  5780: 'תש"פ',  5790: 'תש"צ'
};

var HEBREW_YEAR_UNITS = [
  '', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'
];

// ============ Formatting Defaults ============
var FORMAT_DEFAULTS = {
  APPENDIX_LABEL_BOLD: true,
  APPENDIX_LIST_TITLE: 'רשימת נספחים',
  ENTITY_DEFINITION_FORMAT: '(להלן: "{alias}")',
  FOOTNOTE_IBID: 'שם',
  FOOTNOTE_SUPRA: 'לעיל הערה'
};
