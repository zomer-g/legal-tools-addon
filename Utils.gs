/**
 * Utils.gs -- Shared utilities: position ordering, property storage, UUID generation
 */

/**
 * Generate a short unique ID
 */
function generateUuid() {
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var result = '';
  for (var i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============ Concurrency Helper ============

/**
 * Execute a function while holding the document lock.
 * Prevents race conditions when multiple users edit simultaneously.
 */
function withDocumentLock(fn) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ============ Input Validation ============

/**
 * Validate a UUID string (8 char alphanumeric).
 */
function isValidId(id) {
  return typeof id === 'string' && /^[a-z0-9]{1,32}$/.test(id);
}

/**
 * Sanitize a text input: trim, enforce max length.
 */
function sanitizeText(text, maxLength) {
  if (typeof text !== 'string') return '';
  text = text.trim();
  if (maxLength && text.length > maxLength) {
    text = text.substring(0, maxLength);
  }
  return text;
}

// ============ Document Properties Helpers ============

/**
 * Get a JSON array from document properties
 */
function getPropArray(key) {
  var props = PropertiesService.getDocumentProperties();
  var raw = props.getProperty(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    Logger.log('Error parsing property ' + key + ': ' + e);
    return [];
  }
}

/**
 * Save a JSON array to document properties
 */
function setPropArray(key, arr) {
  var props = PropertiesService.getDocumentProperties();
  props.setProperty(key, JSON.stringify(arr));
}

/**
 * Find item in property array by field value
 */
function findInPropArray(key, field, value) {
  var arr = getPropArray(key);
  for (var i = 0; i < arr.length; i++) {
    if (arr[i][field] === value) return arr[i];
  }
  return null;
}

/**
 * Add item to property array
 */
function addToPropArray(key, item) {
  var arr = getPropArray(key);
  arr.push(item);
  setPropArray(key, arr);
}

/**
 * Update item in property array by field match
 */
function updateInPropArray(key, matchField, matchValue, updates, allowedKeys) {
  var arr = getPropArray(key);
  for (var i = 0; i < arr.length; i++) {
    if (arr[i][matchField] === matchValue) {
      for (var k in updates) {
        if (!allowedKeys || allowedKeys.indexOf(k) !== -1) {
          arr[i][k] = updates[k];
        }
      }
      break;
    }
  }
  setPropArray(key, arr);
}

/**
 * Remove item from property array by field match
 */
function removeFromPropArray(key, matchField, matchValue) {
  var arr = getPropArray(key);
  var filtered = [];
  for (var i = 0; i < arr.length; i++) {
    if (arr[i][matchField] !== matchValue) {
      filtered.push(arr[i]);
    }
  }
  setPropArray(key, filtered);
}

// ============ Position Ordering ============

/**
 * Get the position of an element in the document body.
 * Returns [paragraphIndex, charOffset] for sorting by document order.
 * Uses text matching instead of .equals() which doesn't exist in Apps Script.
 */
function getElementPathIndex(element, offset) {
  var body = DocumentApp.getActiveDocument().getBody();

  // Walk up to the top-level body child (usually a Paragraph)
  var ancestor = element;
  while (ancestor.getParent() &&
         ancestor.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) {
    ancestor = ancestor.getParent();
  }

  // Get identifying info for matching
  var ancestorType = ancestor.getType();
  var ancestorText = '';
  try { ancestorText = ancestor.editAsText().getText(); } catch(e) {}

  // Find the matching body child by iterating all children
  var numChildren = body.getNumChildren();
  for (var i = 0; i < numChildren; i++) {
    try {
      var child = body.getChild(i);
      if (child.getType() === ancestorType) {
        var childText = child.editAsText().getText();
        if (childText === ancestorText) {
          return [i, offset || 0];
        }
      }
    } catch(e) { continue; }
  }

  return [numChildren, offset || 0];
}

/**
 * Compare two path index arrays lexicographically
 */
function comparePathIndices(a, b) {
  var len = Math.max(a.length, b.length);
  for (var i = 0; i < len; i++) {
    var va = (i < a.length) ? a[i] : -1;
    var vb = (i < b.length) ? b[i] : -1;
    if (va !== vb) return va - vb;
  }
  return 0;
}

/**
 * Get all Named Ranges with a given prefix, sorted by document position.
 * Returns: [{namedRange, name, uuid, element, startOffset, pathIndex}]
 */
function getOrderedRanges(prefix) {
  var doc = DocumentApp.getActiveDocument();
  var allRanges = doc.getNamedRanges();
  var results = [];

  for (var i = 0; i < allRanges.length; i++) {
    var nr = allRanges[i];
    var name = nr.getName();

    if (name.indexOf(prefix) !== 0) continue;

    var uuid = name.substring(prefix.length);
    var range = nr.getRange();
    var elements = range.getRangeElements();

    if (elements.length === 0) continue;

    var firstEl = elements[0];
    var element = firstEl.getElement();
    var startOffset = firstEl.isPartial() ? firstEl.getStartOffset() : 0;
    var pathIndex = getElementPathIndex(element, startOffset);

    results.push({
      namedRange: nr,
      name: name,
      uuid: uuid,
      element: element,
      startOffset: startOffset,
      pathIndex: pathIndex,
      rangeElements: elements
    });
  }

  results.sort(function(a, b) {
    return comparePathIndices(a.pathIndex, b.pathIndex);
  });

  return results;
}

/**
 * Get all Named Ranges matching a more complex prefix pattern (for entities).
 * Matches ranges whose name starts with prefix + entityId + '_'
 */
function getOrderedRangesForEntity(entityId) {
  var fullPrefix = PREFIX_ENTITY + entityId + '_';
  return getOrderedRanges(fullPrefix);
}

// ============ Text Manipulation Helpers ============

/**
 * Get the text content of a Named Range
 */
function getNamedRangeText(namedRange) {
  var range = namedRange.getRange();
  var elements = range.getRangeElements();
  var text = '';

  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    var textEl = el.getElement().asText();
    if (el.isPartial()) {
      text += textEl.getText().substring(el.getStartOffset(), el.getEndOffsetInclusive() + 1);
    } else {
      text += textEl.getText();
    }
  }

  return text;
}

/**
 * Replace text within a Named Range and recreate the range.
 * Returns the new Named Range.
 */
function replaceNamedRangeText(namedRange, newText, doc) {
  if (!doc) doc = DocumentApp.getActiveDocument();

  var range = namedRange.getRange();
  var elements = range.getRangeElements();
  var name = namedRange.getName();

  if (elements.length === 0) return null;

  var firstEl = elements[0];
  var textElement = firstEl.getElement().asText();
  var start, end;

  if (firstEl.isPartial()) {
    start = firstEl.getStartOffset();
    // Get the end from the last element
    var lastEl = elements[elements.length - 1];
    end = lastEl.isPartial() ? lastEl.getEndOffsetInclusive() : textElement.getText().length - 1;
  } else {
    start = 0;
    end = textElement.getText().length - 1;
  }

  // Remove old named range first
  namedRange.remove();

  // Replace the text
  textElement.deleteText(start, end);
  textElement.insertText(start, newText);

  // Create new named range over the new text
  var rangeBuilder = doc.newRange();
  rangeBuilder.addElement(textElement, start, start + newText.length - 1);
  var newRange = doc.addNamedRange(name, rangeBuilder.build());

  return newRange;
}

// ============ Hebrew Year Conversion ============

/**
 * Convert a Gregorian year to Hebrew year string.
 * e.g., 1968 -> 'התשכ"ח', 2024 -> 'התשפ"ד'
 * Uses gershayim (") before the last letter per Hebrew convention.
 */
function gregorianToHebrewYear(gYear) {
  var hYear = gYear + 3760; // Approximate conversion

  var hundreds = Math.floor((hYear % 1000) / 100);
  var tens = Math.floor((hYear % 100) / 10);
  var units = hYear % 10;

  var hundredsLetters = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
  var tensLetters = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  var unitsLetters = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];

  // Build the year string without the gershayim first
  var yearStr = 'ה' + hundredsLetters[hundreds];

  // Handle 15 and 16 specially (טו/טז instead of יה/יו)
  if (tens === 1 && units === 5) {
    yearStr += 'טו';
  } else if (tens === 1 && units === 6) {
    yearStr += 'טז';
  } else {
    if (tens > 0) yearStr += tensLetters[tens];
    if (units > 0) yearStr += unitsLetters[units];
  }

  // Insert gershayim (") before the last character
  if (yearStr.length >= 2) {
    yearStr = yearStr.slice(0, -1) + '"' + yearStr.slice(-1);
  }

  return yearStr;
}
