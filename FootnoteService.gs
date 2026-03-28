/**
 * FootnoteService.gs -- Feature 3: Legal Footnotes (הערות שוליים משפטיות)
 * Based on Israeli Uniform Citation Rules (כללי האזכור האחידים)
 */

var FootnoteService = {

  /**
   * Insert a legal footnote at the current cursor position.
   * @param {Object} sourceData - Citation source data with type and fields
   * @param {string} pinpoint - Specific page/section reference (optional)
   * @returns {Object} Result
   */
  insertFootnote: function(sourceData, pinpoint) {
    var doc = DocumentApp.getActiveDocument();
    var cursor = doc.getCursor();

    if (!cursor) {
      return { success: false, error: 'יש למקם את הסמן במקום הרצוי להערת השוליים.' };
    }

    // Check if this source already exists
    var existingSource = this._findExistingSource(sourceData);
    var sourceId;
    var isNewSource;

    if (existingSource) {
      sourceId = existingSource.sourceId;
      isNewSource = false;
    } else {
      sourceId = generateUuid();
      isNewSource = true;

      // Generate full citation text
      var fullCitation = this._formatFullCitation(sourceData);

      var sourceRecord = {
        sourceId: sourceId,
        type: sourceData.type,
        fields: sourceData.fields,
        fullCitation: fullCitation,
        shortName: this._getShortName(sourceData)
      };

      addToPropArray(PROP_FOOTNOTE_META, sourceRecord);
    }

    // Create footnote record
    var footnoteUuid = generateUuid();
    var footnoteRecord = {
      footnoteUuid: footnoteUuid,
      sourceId: sourceId,
      pinpoint: pinpoint || ''
    };

    addToPropArray(PROP_FOOTNOTE_LIST, footnoteRecord);

    // Determine citation text (will be recalculated on refresh, but set initial)
    var citationText;
    if (isNewSource) {
      var source = findInPropArray(PROP_FOOTNOTE_META, 'sourceId', sourceId);
      citationText = source.fullCitation;
      if (pinpoint) {
        citationText += ', ' + pinpoint;
      }
    } else {
      // For now, insert a placeholder -- refresh will fix it
      citationText = this._formatRepeatedCitation(sourceId, pinpoint, null);
    }

    // Insert the actual Google Docs footnote
    var element = cursor.getElement();
    var offset = cursor.getOffset();

    try {
      // Navigate to the paragraph
      var paragraph;
      if (element.getType() === DocumentApp.ElementType.PARAGRAPH) {
        paragraph = element.asParagraph();
      } else if (element.getType() === DocumentApp.ElementType.TEXT) {
        paragraph = element.getParent().asParagraph();
      } else {
        paragraph = element.getParent().asParagraph();
      }

      // Insert footnote
      var footnote = paragraph.insertFootnote(offset);
      var footnoteContents = footnote.getFootnoteContents();
      var footnotePara = footnoteContents.getParagraphs()[0];
      footnotePara.setText(citationText);

      // Create Named Range inside the footnote for tracking
      var rangeName = PREFIX_FOOTNOTE + sourceId + '_' + footnoteUuid;
      var rangeBuilder = doc.newRange();
      rangeBuilder.addElement(footnotePara);
      doc.addNamedRange(rangeName, rangeBuilder.build());

      // Refresh to ensure correct citation format
      this.refresh();

      return { success: true, footnoteUuid: footnoteUuid };
    } catch (e) {
      // Clean up on failure
      removeFromPropArray(PROP_FOOTNOTE_LIST, 'footnoteUuid', footnoteUuid);
      if (isNewSource) {
        removeFromPropArray(PROP_FOOTNOTE_META, 'sourceId', sourceId);
      }
      Logger.log('insertFootnote error: ' + e.message);
      return { success: false, error: 'שגיאה בהוספת הערת שוליים. נסה שוב.' };
    }
  },

  /**
   * Refresh all footnotes: recalculate first/repeated citations.
   */
  refresh: function() {
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();
    var allFootnotes = body.getFootnotes();

    if (!allFootnotes || allFootnotes.length === 0) return;

    var sources = getPropArray(PROP_FOOTNOTE_META);
    var footnoteRecords = getPropArray(PROP_FOOTNOTE_LIST);

    // Build maps
    var sourceMap = {};
    for (var i = 0; i < sources.length; i++) {
      sourceMap[sources[i].sourceId] = sources[i];
    }

    var fnRecordMap = {};
    for (var i = 0; i < footnoteRecords.length; i++) {
      fnRecordMap[footnoteRecords[i].footnoteUuid] = footnoteRecords[i];
    }

    // Scan all Named Ranges with footnote prefix, in document order
    var allRanges = doc.getNamedRanges();
    var fnRanges = [];

    for (var i = 0; i < allRanges.length; i++) {
      var name = allRanges[i].getName();
      if (name.indexOf(PREFIX_FOOTNOTE) !== 0) continue;

      // Parse sourceId and footnoteUuid from name
      var suffix = name.substring(PREFIX_FOOTNOTE.length);
      var parts = suffix.split('_');
      if (parts.length < 2) continue;

      var sourceId = parts[0];
      var footnoteUuid = parts.slice(1).join('_');

      fnRanges.push({
        namedRange: allRanges[i],
        sourceId: sourceId,
        footnoteUuid: footnoteUuid
      });
    }

    // We need to order these by their position in the document's footnote sequence.
    // Match each Named Range to a native Footnote by checking which footnote contains it.
    var orderedFootnotes = [];
    for (var fi = 0; fi < allFootnotes.length; fi++) {
      var fn = allFootnotes[fi];
      var fnContents = fn.getFootnoteContents();

      // Check if any of our tracked ranges are inside this footnote
      for (var ri = 0; ri < fnRanges.length; ri++) {
        var range = fnRanges[ri].namedRange.getRange();
        var rangeElements = range.getRangeElements();

        if (rangeElements.length > 0) {
          var rangeEl = rangeElements[0].getElement();
          // Check if this element is inside the footnote
          if (this._isElementInFootnote(rangeEl, fn)) {
            orderedFootnotes.push({
              footnoteIndex: fi + 1, // 1-based footnote number
              sourceId: fnRanges[ri].sourceId,
              footnoteUuid: fnRanges[ri].footnoteUuid,
              namedRange: fnRanges[ri].namedRange,
              footnote: fn
            });
            break;
          }
        }
      }
    }

    // Now process in order: determine first vs. repeated citations
    var firstOccurrence = {}; // sourceId -> footnoteIndex (1-based)
    var previousSourceId = null;

    for (var i = 0; i < orderedFootnotes.length; i++) {
      var entry = orderedFootnotes[i];
      var source = sourceMap[entry.sourceId];
      if (!source) continue;

      var fnRecord = fnRecordMap[entry.footnoteUuid];
      var pinpoint = fnRecord ? fnRecord.pinpoint : '';
      var citationText;

      if (!firstOccurrence[entry.sourceId]) {
        // First occurrence of this source
        firstOccurrence[entry.sourceId] = entry.footnoteIndex;
        citationText = source.fullCitation;
        if (pinpoint) {
          citationText += ', ' + pinpoint;
        }
      } else {
        // Repeated citation
        if (previousSourceId === entry.sourceId) {
          // Immediately follows same source -> "שם"
          citationText = FORMAT_DEFAULTS.FOOTNOTE_IBID;
          if (pinpoint) {
            citationText += ', ' + pinpoint;
          }
        } else {
          // Non-consecutive -> "לעיל הערה N"
          var firstFnNum = firstOccurrence[entry.sourceId];
          citationText = source.shortName + ', ' +
            FORMAT_DEFAULTS.FOOTNOTE_SUPRA + ' ' + firstFnNum;
          if (pinpoint) {
            citationText += ', ' + pinpoint;
          }
        }
      }

      citationText += '.';

      // Update footnote text if changed
      this._updateFootnoteText(entry.footnote, citationText);

      previousSourceId = entry.sourceId;
    }
  },

  /**
   * Check if an element is inside a specific Footnote.
   */
  _isElementInFootnote: function(element, footnote) {
    var current = element;
    while (current) {
      if (current.getType() === DocumentApp.ElementType.FOOTNOTE_SECTION) {
        // Compare by checking the parent footnote
        var parent = current.getParent();
        if (parent && parent.getType() === DocumentApp.ElementType.FOOTNOTE) {
          return parent.equals(footnote);
        }
        return false;
      }
      current = current.getParent();
    }
    return false;
  },

  /**
   * Update the text content of a footnote.
   */
  _updateFootnoteText: function(footnote, newText) {
    var contents = footnote.getFootnoteContents();
    var paras = contents.getParagraphs();
    if (paras.length > 0) {
      var currentText = paras[0].getText();
      if (currentText !== newText) {
        paras[0].setText(newText);
      }
    }
  },

  /**
   * Find an existing source by matching key fields.
   */
  _findExistingSource: function(sourceData) {
    var sources = getPropArray(PROP_FOOTNOTE_META);
    var type = sourceData.type;
    var fields = sourceData.fields;

    for (var i = 0; i < sources.length; i++) {
      if (sources[i].type !== type) continue;

      var sf = sources[i].fields;
      var match = false;

      switch (type) {
        case CITATION_TYPES.LEGISLATION:
          match = sf.name === fields.name && sf.lawType === fields.lawType;
          break;
        case CITATION_TYPES.CASE_LAW:
          match = sf.caseNumber === fields.caseNumber &&
                  sf.proceedingType === fields.proceedingType;
          break;
        case CITATION_TYPES.LITERATURE:
          match = sf.authorLast === fields.authorLast &&
                  sf.title === fields.title;
          break;
      }

      if (match) return sources[i];
    }

    return null;
  },

  /**
   * Format a full citation based on source type.
   */
  _formatFullCitation: function(sourceData) {
    var f = sourceData.fields;

    switch (sourceData.type) {
      case CITATION_TYPES.LEGISLATION:
        return this._formatLegislation(f);
      case CITATION_TYPES.CASE_LAW:
        return this._formatCaseLaw(f);
      case CITATION_TYPES.LITERATURE:
        return this._formatLiterature(f);
      default:
        return '';
    }
  },

  /**
   * Format legislation citation.
   * Format: חוק [שם], [שנה עברית]–[שנה לועזית], [פרסום] [עמוד]
   */
  _formatLegislation: function(f) {
    var parts = [];

    // Law type + name
    parts.push(f.lawType + ' ' + f.name);

    // Year(s)
    if (f.hebrewYear && f.gregorianYear) {
      parts.push(f.hebrewYear + '\u2013' + f.gregorianYear);
    } else if (f.hebrewYear) {
      parts.push(f.hebrewYear);
    } else if (f.gregorianYear) {
      parts.push(f.gregorianYear);
    }

    // Publication
    if (f.publication && f.page) {
      parts.push(f.publication + ' ' + f.page);
    }

    return parts.join(', ');
  },

  /**
   * Format case law citation.
   * Format: [סוג] [מספר] [צד א'] נ' [צד ב'], [כרך] [פרסום] [עמוד] ([שנה])
   */
  _formatCaseLaw: function(f) {
    var result = '';

    // Proceeding type + case number
    result += f.proceedingType + ' ' + f.caseNumber + ' ';

    // Party names (bold in real formatting)
    result += f.party1 + " נ' " + f.party2;

    // Reporter
    if (f.reporterVolume && f.reporter && f.page) {
      result += ', ' + f.reporterVolume + ' ' + f.reporter + ' ' + f.page;
    } else if (f.reporter && f.page) {
      result += ', ' + f.reporter + ' ' + f.page;
    }

    // Year
    if (f.year) {
      result += ' (' + f.year + ')';
    }

    // Specific paragraph
    if (f.paragraph) {
      result += ', פס\' ' + f.paragraph;
    }

    return result;
  },

  /**
   * Format literature citation.
   * Book: [שם מחבר] [כותרת] [עמוד] ([מהדורה], [שנה])
   * Article: [שם מחבר] "[כותרת]" [כתב עת] [כרך] [עמוד] ([שנה])
   */
  _formatLiterature: function(f) {
    var result = '';

    // Author
    if (f.authorFirst && f.authorLast) {
      result += f.authorFirst + ' ' + f.authorLast + ' ';
    } else if (f.authorLast) {
      result += f.authorLast + ' ';
    }

    if (f.isArticle) {
      // Article format
      result += '"' + f.title + '" ';
      if (f.journal) {
        result += f.journal + ' ';
      }
      if (f.volume) {
        result += f.volume + ' ';
      }
      if (f.page) {
        result += f.page;
      }
      if (f.year) {
        result += ' (' + f.year + ')';
      }
    } else {
      // Book format
      result += f.title + ' ';
      if (f.page) {
        result += f.page + ' ';
      }
      var parenthetical = [];
      if (f.edition) {
        parenthetical.push('מהדורה ' + f.edition);
      }
      if (f.year) {
        parenthetical.push(f.year);
      }
      if (parenthetical.length > 0) {
        result += '(' + parenthetical.join(', ') + ')';
      }
    }

    return result.trim();
  },

  /**
   * Get a short name for supra references.
   * Typically the author's last name for literature, or abbreviated source for legislation/caselaw.
   */
  _getShortName: function(sourceData) {
    var f = sourceData.fields;

    switch (sourceData.type) {
      case CITATION_TYPES.LEGISLATION:
        return f.lawType + ' ' + f.name;
      case CITATION_TYPES.CASE_LAW:
        // Use first party name
        return 'עניין ' + (f.party1 || '');
      case CITATION_TYPES.LITERATURE:
        return f.authorLast || '';
      default:
        return '';
    }
  },

  /**
   * Format a repeated citation (used for initial insert before refresh).
   */
  _formatRepeatedCitation: function(sourceId, pinpoint, previousSourceId) {
    var source = findInPropArray(PROP_FOOTNOTE_META, 'sourceId', sourceId);
    if (!source) return '';

    // Default to supra format (refresh will fix if it should be ibid)
    var text = source.shortName + ', ' + FORMAT_DEFAULTS.FOOTNOTE_SUPRA + ' [N]';
    if (pinpoint) {
      text += ', ' + pinpoint;
    }
    return text;
  },

  /**
   * Get all sources for the footnote dialog autocomplete.
   */
  getAllSources: function() {
    return getPropArray(PROP_FOOTNOTE_META);
  }
};
