/**
 * NamedRangeManager.gs -- Abstraction layer for Named Range operations
 */

var NRManager = {

  /**
   * Create a Named Range from the current selection.
   * @param {string} name - The name for the Named Range
   * @returns {NamedRange|null} The created Named Range, or null if no selection
   */
  createFromSelection: function(name) {
    var doc = DocumentApp.getActiveDocument();
    var selection = doc.getSelection();

    if (!selection) {
      return null;
    }

    var rangeBuilder = doc.newRange();
    var elements = selection.getRangeElements();

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (el.isPartial()) {
        rangeBuilder.addElement(el.getElement(), el.getStartOffset(), el.getEndOffsetInclusive());
      } else {
        rangeBuilder.addElement(el.getElement());
      }
    }

    return doc.addNamedRange(name, rangeBuilder.build());
  },

  /**
   * Create a Named Range wrapping specific text in a Text element.
   * @param {string} name - The name for the Named Range
   * @param {Text} textElement - The Text element
   * @param {number} start - Start offset
   * @param {number} end - End offset (inclusive)
   * @returns {NamedRange}
   */
  createFromTextRange: function(name, textElement, start, end) {
    var doc = DocumentApp.getActiveDocument();
    var rangeBuilder = doc.newRange();
    rangeBuilder.addElement(textElement, start, end);
    return doc.addNamedRange(name, rangeBuilder.build());
  },

  /**
   * Create a Named Range wrapping an entire element.
   * @param {string} name - The name for the Named Range
   * @param {Element} element - The element to wrap
   * @returns {NamedRange}
   */
  createFromElement: function(name, element) {
    var doc = DocumentApp.getActiveDocument();
    var rangeBuilder = doc.newRange();
    rangeBuilder.addElement(element);
    return doc.addNamedRange(name, rangeBuilder.build());
  },

  /**
   * Find all Named Ranges with a given prefix.
   * @param {string} prefix - The prefix to match
   * @returns {NamedRange[]}
   */
  findByPrefix: function(prefix) {
    var doc = DocumentApp.getActiveDocument();
    var allRanges = doc.getNamedRanges();
    var matches = [];

    for (var i = 0; i < allRanges.length; i++) {
      if (allRanges[i].getName().indexOf(prefix) === 0) {
        matches.push(allRanges[i]);
      }
    }

    return matches;
  },

  /**
   * Find a Named Range by exact name.
   * @param {string} name - The exact name
   * @returns {NamedRange|null}
   */
  findByName: function(name) {
    var doc = DocumentApp.getActiveDocument();
    var ranges = doc.getNamedRanges(name);
    return ranges.length > 0 ? ranges[0] : null;
  },

  /**
   * Remove a Named Range by its object reference.
   * @param {NamedRange} namedRange
   */
  remove: function(namedRange) {
    if (namedRange) {
      namedRange.remove();
    }
  },

  /**
   * Remove all Named Ranges with a given prefix.
   * @param {string} prefix
   */
  removeByPrefix: function(prefix) {
    var ranges = this.findByPrefix(prefix);
    for (var i = 0; i < ranges.length; i++) {
      ranges[i].remove();
    }
  },

  /**
   * Get the text content covered by a Named Range.
   * @param {NamedRange} namedRange
   * @returns {string}
   */
  getText: function(namedRange) {
    return getNamedRangeText(namedRange);
  },

  /**
   * Replace text in a Named Range and recreate it.
   * @param {NamedRange} namedRange
   * @param {string} newText
   * @returns {NamedRange} new Named Range
   */
  replaceText: function(namedRange, newText) {
    return replaceNamedRangeText(namedRange, newText);
  },

  /**
   * Replace the current selection with text and wrap in a Named Range.
   * @param {string} name - Named Range name
   * @param {string} text - Text to replace selection with
   * @returns {NamedRange|null}
   */
  replaceSelectionWithText: function(name, text) {
    var doc = DocumentApp.getActiveDocument();
    var selection = doc.getSelection();
    if (!selection) return null;

    var elements = selection.getRangeElements();
    if (elements.length === 0) return null;

    // Get the first range element to find insertion point
    var firstEl = elements[0];
    var element = firstEl.getElement();
    var textElement;
    var insertOffset;

    if (element.getType() === DocumentApp.ElementType.TEXT) {
      textElement = element;
      insertOffset = firstEl.isPartial() ? firstEl.getStartOffset() : 0;
    } else if (element.getType() === DocumentApp.ElementType.PARAGRAPH) {
      textElement = element.asParagraph().editAsText();
      insertOffset = firstEl.isPartial() ? firstEl.getStartOffset() : 0;
    } else {
      return null;
    }

    // Delete selected text in reverse order to preserve offsets
    for (var i = elements.length - 1; i >= 0; i--) {
      var rangeEl = elements[i];
      var el = rangeEl.getElement();
      var txt;
      if (el.getType() === DocumentApp.ElementType.TEXT) {
        txt = el;
      } else if (el.getType() === DocumentApp.ElementType.PARAGRAPH) {
        txt = el.asParagraph().editAsText();
      } else {
        continue;
      }

      if (rangeEl.isPartial()) {
        txt.deleteText(rangeEl.getStartOffset(), rangeEl.getEndOffsetInclusive());
      } else {
        txt.deleteText(0, txt.getText().length - 1);
      }
    }

    // Insert new text at the original start position
    textElement.insertText(insertOffset, text);

    // Create Named Range
    var rangeBuilder = doc.newRange();
    rangeBuilder.addElement(textElement, insertOffset, insertOffset + text.length - 1);
    return doc.addNamedRange(name, rangeBuilder.build());
  },

  /**
   * Insert text at cursor position and wrap in a Named Range.
   * @param {string} name - Named Range name
   * @param {string} text - Text to insert
   * @param {Object} [attributes] - Optional text attributes (bold, italic, etc.)
   * @returns {NamedRange|null}
   */
  insertAtCursor: function(name, text, attributes) {
    var doc = DocumentApp.getActiveDocument();
    var cursor = doc.getCursor();

    if (!cursor) return null;

    var element = cursor.getElement();
    var offset = cursor.getOffset();

    // Navigate to Text element
    var textElement;
    if (element.getType() === DocumentApp.ElementType.TEXT) {
      textElement = element;
    } else if (element.getType() === DocumentApp.ElementType.PARAGRAPH) {
      // If paragraph is empty, get or create its text child
      if (element.asParagraph().getText() === '') {
        textElement = element.asParagraph().editAsText();
        offset = 0;
      } else {
        textElement = element.asParagraph().editAsText();
      }
    } else {
      return null;
    }

    // Insert the text
    textElement.insertText(offset, text);

    // Apply attributes if provided
    if (attributes) {
      textElement.setAttributes(offset, offset + text.length - 1, attributes);
    }

    // Create Named Range
    var rangeBuilder = doc.newRange();
    rangeBuilder.addElement(textElement, offset, offset + text.length - 1);
    return doc.addNamedRange(name, rangeBuilder.build());
  },

  /**
   * Check if a Named Range still exists and has valid content.
   * @param {string} name
   * @returns {boolean}
   */
  exists: function(name) {
    var doc = DocumentApp.getActiveDocument();
    var ranges = doc.getNamedRanges(name);
    return ranges.length > 0;
  }
};
