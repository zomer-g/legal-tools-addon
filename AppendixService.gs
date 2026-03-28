/**
 * AppendixService.gs -- Feature 1: Appendix management (נספחים)
 */

var AppendixService = {

  /**
   * Add an appendix reference at the current selection.
   * Called from the sidebar.
   * @param {string} description - User-provided description of the appendix
   * @returns {Object} Result with success status and appendix data
   */
  addAppendix: function(description) {
    var doc = DocumentApp.getActiveDocument();
    var selection = doc.getSelection();

    if (!selection) {
      return { success: false, error: 'יש לבחור טקסט במסמך לפני הוספת נספח.' };
    }

    var uuid = generateUuid();
    var rangeName = PREFIX_APPENDIX_REF + uuid;

    // Get the current count to assign a temporary label
    var meta = getPropArray(PROP_APPENDIX_META);
    var index = meta.length;
    var label = index < HEBREW_LETTERS.length ? HEBREW_LETTERS[index] : String(index + 1);

    // Create Named Range from selection
    var namedRange = NRManager.createFromSelection(rangeName);
    if (!namedRange) {
      return { success: false, error: 'לא ניתן ליצור נספח. נסה לבחור טקסט שוב.' };
    }

    // Insert the appendix label text after the selection
    var elements = selection.getRangeElements();
    var lastEl = elements[elements.length - 1];
    var textEl = lastEl.getElement();

    // Find the parent paragraph to append the label
    var paragraph;
    if (textEl.getType() === DocumentApp.ElementType.TEXT) {
      paragraph = textEl.getParent();
    } else if (textEl.getType() === DocumentApp.ElementType.PARAGRAPH) {
      paragraph = textEl;
    } else {
      paragraph = textEl.getParent();
    }

    // Store metadata
    var appendixData = {
      uuid: uuid,
      description: description,
      currentLabel: label
    };

    addToPropArray(PROP_APPENDIX_META, appendixData);

    // Refresh to assign correct ordering
    this.refresh();

    return { success: true, data: appendixData };
  },

  /**
   * Remove an appendix by UUID.
   * @param {string} uuid
   */
  removeAppendix: function(uuid) {
    var rangeName = PREFIX_APPENDIX_REF + uuid;
    var doc = DocumentApp.getActiveDocument();
    var ranges = doc.getNamedRanges(rangeName);

    for (var i = 0; i < ranges.length; i++) {
      ranges[i].remove();
    }

    removeFromPropArray(PROP_APPENDIX_META, 'uuid', uuid);
    this.refresh();
  },

  /**
   * Update appendix description.
   * @param {string} uuid
   * @param {string} newDescription
   */
  updateDescription: function(uuid, newDescription) {
    updateInPropArray(PROP_APPENDIX_META, 'uuid', uuid, { description: newDescription });
  },

  /**
   * Refresh: reorder all appendices by document position and update labels.
   */
  refresh: function() {
    var ordered = getOrderedRanges(PREFIX_APPENDIX_REF);
    var meta = getPropArray(PROP_APPENDIX_META);

    // Build a map of uuid -> meta item
    var metaMap = {};
    for (var i = 0; i < meta.length; i++) {
      metaMap[meta[i].uuid] = meta[i];
    }

    // Check for orphaned metadata (Named Range was deleted by user)
    var activeUuids = {};
    for (var i = 0; i < ordered.length; i++) {
      activeUuids[ordered[i].uuid] = true;
    }

    // Update labels based on document order
    var updatedMeta = [];
    for (var i = 0; i < ordered.length; i++) {
      var uuid = ordered[i].uuid;
      var label = i < HEBREW_LETTERS.length ? HEBREW_LETTERS[i] : String(i + 1);

      if (metaMap[uuid]) {
        metaMap[uuid].currentLabel = label;
        updatedMeta.push(metaMap[uuid]);
      }

      // Update the text in the document to reflect new label
      this._updateLabelInDocument(ordered[i], label);
    }

    // Keep orphaned items marked
    for (var j = 0; j < meta.length; j++) {
      if (!activeUuids[meta[j].uuid]) {
        meta[j].orphaned = true;
        updatedMeta.push(meta[j]);
      }
    }

    setPropArray(PROP_APPENDIX_META, updatedMeta);

    // Regenerate the appendix list if it exists
    this._regenerateList(updatedMeta);
  },

  /**
   * Update the inline label text for an appendix reference.
   * The format is: "הטקסט שנבחר" becomes "הטקסט שנבחר (נספח X)"
   * or just updates the X part if already formatted.
   */
  _updateLabelInDocument: function(rangeInfo, newLabel) {
    var doc = DocumentApp.getActiveDocument();
    var nr = rangeInfo.namedRange;
    var currentText = getNamedRangeText(nr);

    // Check if text already has an appendix label pattern
    var labelPattern = /\s*\(נספח\s+[^\)]+\)\s*$/;
    var match = currentText.match(labelPattern);

    var newFullText;
    if (match) {
      // Replace existing label
      newFullText = currentText.replace(labelPattern, ' (נספח ' + newLabel + ')');
    } else {
      // Append label
      newFullText = currentText + ' (נספח ' + newLabel + ')';
    }

    if (newFullText !== currentText) {
      replaceNamedRangeText(nr, newFullText, doc);
    }
  },

  /**
   * Generate the appendix list block at cursor position.
   */
  generateListAtCursor: function() {
    var doc = DocumentApp.getActiveDocument();
    var cursor = doc.getCursor();

    if (!cursor) {
      DocumentApp.getUi().alert('יש למקם את הסמן במקום הרצוי לרשימת הנספחים.');
      return;
    }

    // Remove existing list if any
    this._removeExistingList();

    var meta = getPropArray(PROP_APPENDIX_META);
    var activeMeta = meta.filter(function(m) { return !m.orphaned; });

    // Find insertion point
    var element = cursor.getElement();
    var body = doc.getBody();
    var insertIndex;

    // Find the paragraph containing the cursor
    var para = element;
    while (para && para.getType() !== DocumentApp.ElementType.PARAGRAPH) {
      para = para.getParent();
    }

    if (para) {
      insertIndex = body.getChildIndex(para) + 1;
    } else {
      insertIndex = body.getNumChildren();
    }

    // Insert title
    var titlePara = body.insertParagraph(insertIndex, FORMAT_DEFAULTS.APPENDIX_LIST_TITLE);
    titlePara.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    titlePara.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
    insertIndex++;

    // Insert each appendix entry
    for (var i = 0; i < activeMeta.length; i++) {
      var entry = 'נספח ' + activeMeta[i].currentLabel + ' – ' + activeMeta[i].description;
      var entryPara = body.insertParagraph(insertIndex + i, entry);
      entryPara.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
    }

    // Wrap the entire list in a Named Range for tracking
    if (activeMeta.length > 0) {
      var rangeBuilder = doc.newRange();
      rangeBuilder.addElement(titlePara);
      for (var i = 0; i < activeMeta.length; i++) {
        rangeBuilder.addElement(body.getChild(insertIndex + i));
      }
      doc.addNamedRange(PREFIX_APPENDIX_LIST, rangeBuilder.build());
    }
  },

  /**
   * Regenerate the appendix list content if it exists.
   */
  _regenerateList: function(meta) {
    var doc = DocumentApp.getActiveDocument();
    var listRanges = doc.getNamedRanges(PREFIX_APPENDIX_LIST);

    if (listRanges.length === 0) return;

    var activeMeta = meta.filter(function(m) { return !m.orphaned; });

    // Get the position of the existing list
    var listRange = listRanges[0];
    var range = listRange.getRange();
    var elements = range.getRangeElements();

    if (elements.length === 0) return;

    // Find the body and the starting paragraph index
    var body = doc.getBody();
    var firstElement = elements[0].getElement();

    // Navigate up to find the paragraph
    var firstPara = firstElement;
    while (firstPara && firstPara.getType() !== DocumentApp.ElementType.PARAGRAPH) {
      firstPara = firstPara.getParent();
    }
    if (!firstPara) return;

    var startIndex = body.getChildIndex(firstPara);

    // Remove old list Named Range
    listRange.remove();

    // Remove old paragraphs (from last to first to preserve indices)
    var parasToRemove = [];
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i].getElement();
      var p = el;
      while (p && p.getType() !== DocumentApp.ElementType.PARAGRAPH) {
        p = p.getParent();
      }
      if (p && parasToRemove.indexOf(body.getChildIndex(p)) === -1) {
        parasToRemove.push(body.getChildIndex(p));
      }
    }

    parasToRemove.sort(function(a, b) { return b - a; });
    for (var i = 0; i < parasToRemove.length; i++) {
      body.removeChild(body.getChild(parasToRemove[i]));
    }

    // Insert new list at the same position
    var titlePara = body.insertParagraph(startIndex, FORMAT_DEFAULTS.APPENDIX_LIST_TITLE);
    titlePara.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    titlePara.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);

    var rangeBuilder = doc.newRange();
    rangeBuilder.addElement(titlePara);

    for (var i = 0; i < activeMeta.length; i++) {
      var entry = 'נספח ' + activeMeta[i].currentLabel + ' – ' + activeMeta[i].description;
      var entryPara = body.insertParagraph(startIndex + 1 + i, entry);
      entryPara.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
      rangeBuilder.addElement(entryPara);
    }

    doc.addNamedRange(PREFIX_APPENDIX_LIST, rangeBuilder.build());
  },

  /**
   * Remove the existing appendix list block.
   */
  _removeExistingList: function() {
    var doc = DocumentApp.getActiveDocument();
    var listRanges = doc.getNamedRanges(PREFIX_APPENDIX_LIST);

    for (var r = 0; r < listRanges.length; r++) {
      var range = listRanges[r].getRange();
      var elements = range.getRangeElements();
      var body = doc.getBody();

      // Collect unique paragraphs to remove
      var parasToRemove = [];
      for (var i = 0; i < elements.length; i++) {
        var el = elements[i].getElement();
        var p = el;
        while (p && p.getType() !== DocumentApp.ElementType.PARAGRAPH) {
          p = p.getParent();
        }
        if (p) {
          var idx = body.getChildIndex(p);
          if (parasToRemove.indexOf(idx) === -1) {
            parasToRemove.push(idx);
          }
        }
      }

      parasToRemove.sort(function(a, b) { return b - a; });
      for (var i = 0; i < parasToRemove.length; i++) {
        body.removeChild(body.getChild(parasToRemove[i]));
      }

      listRanges[r].remove();
    }
  },

  /**
   * Get all appendices for sidebar display.
   * @returns {Array} Appendix metadata sorted by current document order
   */
  getAll: function() {
    var meta = getPropArray(PROP_APPENDIX_META);
    // Re-sort by current label to ensure correct display order
    meta.sort(function(a, b) {
      var ai = HEBREW_LETTERS.indexOf(a.currentLabel);
      var bi = HEBREW_LETTERS.indexOf(b.currentLabel);
      if (ai === -1) ai = 999;
      if (bi === -1) bi = 999;
      return ai - bi;
    });
    return meta;
  }
};
