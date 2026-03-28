/**
 * EntityService.gs -- Feature 2: Entity management (ישויות)
 */

var EntityService = {

  /**
   * Define a new entity from selected text.
   * @param {string} alias - The short alias (e.g., "הבנק")
   * @param {string} type - Entity type (person/corporation/place/other)
   * @returns {Object} Result with success status
   */
  defineEntity: function(alias, type) {
    var doc = DocumentApp.getActiveDocument();
    var selection = doc.getSelection();

    if (!selection) {
      return { success: false, error: 'יש לבחור טקסט עם השם המלא של הישות.' };
    }

    // Extract the full name from the selection
    var fullName = this._getSelectedText(selection);
    if (!fullName) {
      return { success: false, error: 'לא ניתן לקרוא את הטקסט הנבחר.' };
    }

    var entityId = generateUuid();
    var mentionUuid = generateUuid();

    // Store entity metadata
    var entityData = {
      entityId: entityId,
      fullName: fullName,
      alias: alias,
      type: type || ENTITY_TYPES.OTHER
    };

    addToPropArray(PROP_ENTITY_META, entityData);

    // Create Named Range for this first mention
    var rangeName = PREFIX_ENTITY + entityId + '_' + mentionUuid;
    var namedRange = NRManager.createFromSelection(rangeName);

    if (!namedRange) {
      removeFromPropArray(PROP_ENTITY_META, 'entityId', entityId);
      return { success: false, error: 'לא ניתן ליצור סימון. נסה לבחור טקסט שוב.' };
    }

    // Format the first mention with the definition text
    this._formatFirstMention(namedRange, fullName, alias, doc);

    return { success: true, data: entityData };
  },

  /**
   * Mark selected text as a mention of an existing entity.
   * @param {string} entityId
   * @returns {Object} Result
   */
  markMention: function(entityId) {
    var doc = DocumentApp.getActiveDocument();
    var selection = doc.getSelection();

    if (!selection) {
      return { success: false, error: 'יש לבחור טקסט לסימון כאזכור.' };
    }

    var entity = findInPropArray(PROP_ENTITY_META, 'entityId', entityId);
    if (!entity) {
      return { success: false, error: 'ישות לא נמצאה.' };
    }

    var mentionUuid = generateUuid();
    var rangeName = PREFIX_ENTITY + entityId + '_' + mentionUuid;
    var namedRange = NRManager.createFromSelection(rangeName);

    if (!namedRange) {
      return { success: false, error: 'לא ניתן ליצור סימון.' };
    }

    // After marking, refresh to determine if this is now the first mention
    this.refresh();

    return { success: true };
  },

  /**
   * Insert an entity mention at the current cursor position.
   * The text inserted will be determined by refresh (alias or full definition).
   * @param {string} entityId
   * @returns {Object} Result
   */
  insertAtCursor: function(entityId) {
    var doc = DocumentApp.getActiveDocument();
    var cursor = doc.getCursor();
    var selection = doc.getSelection();

    if (!cursor && !selection) {
      return { success: false, error: 'יש למקם את הסמן במקום הרצוי להכנסת הישות.' };
    }

    var entity = findInPropArray(PROP_ENTITY_META, 'entityId', entityId);
    if (!entity) {
      return { success: false, error: 'ישות לא נמצאה.' };
    }

    var mentionUuid = generateUuid();
    var rangeName = PREFIX_ENTITY + entityId + '_' + mentionUuid;
    var namedRange;

    if (selection) {
      // Replace selected text with entity alias
      namedRange = NRManager.replaceSelectionWithText(rangeName, entity.alias);
    } else {
      // Insert at cursor position
      namedRange = NRManager.insertAtCursor(rangeName, entity.alias);
    }

    if (!namedRange) {
      return { success: false, error: 'לא ניתן להכניס טקסט במיקום הסמן. נסה למקם את הסמן בתוך פסקה.' };
    }

    // Refresh to determine correct text (alias or full definition)
    this.refresh();

    return { success: true };
  },

  /**
   * Remove an entity and all its Named Ranges.
   * Leaves the text content as-is (just the alias text).
   * @param {string} entityId
   */
  removeEntity: function(entityId) {
    // Remove all Named Ranges for this entity
    var prefix = PREFIX_ENTITY + entityId + '_';
    NRManager.removeByPrefix(prefix);

    // Remove from metadata
    removeFromPropArray(PROP_ENTITY_META, 'entityId', entityId);
  },

  /**
   * Update entity properties (alias, fullName, type).
   * @param {string} entityId
   * @param {Object} updates
   */
  updateEntity: function(entityId, updates) {
    var allowedKeys = ['alias', 'fullName', 'type'];
    updateInPropArray(PROP_ENTITY_META, 'entityId', entityId, updates, allowedKeys);
    this.refresh();
  },

  /**
   * Refresh: recompute first mentions and update text formatting for all entities.
   */
  refresh: function() {
    var meta = getPropArray(PROP_ENTITY_META);
    var doc = DocumentApp.getActiveDocument();

    for (var i = 0; i < meta.length; i++) {
      var entity = meta[i];
      var ordered = getOrderedRangesForEntity(entity.entityId);

      if (ordered.length === 0) continue;

      for (var j = 0; j < ordered.length; j++) {
        var rangeInfo = ordered[j];
        var currentText = getNamedRangeText(rangeInfo.namedRange);

        if (j === 0) {
          // First mention: should have full format
          var expectedText = entity.fullName + ' (להלן: "' + entity.alias + '")';
          if (currentText !== expectedText) {
            replaceNamedRangeText(rangeInfo.namedRange, expectedText, doc);
          }
        } else {
          // Subsequent mentions: should be just the alias
          if (currentText !== entity.alias) {
            replaceNamedRangeText(rangeInfo.namedRange, entity.alias, doc);
          }
        }
      }
    }
  },

  /**
   * Format a mention as the first mention (with definition).
   */
  _formatFirstMention: function(namedRange, fullName, alias, doc) {
    var expectedText = fullName + ' (להלן: "' + alias + '")';
    var currentText = getNamedRangeText(namedRange);

    if (currentText !== expectedText) {
      replaceNamedRangeText(namedRange, expectedText, doc);
    }
  },

  /**
   * Get selected text from a Selection object.
   */
  _getSelectedText: function(selection) {
    var elements = selection.getRangeElements();
    var text = '';

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var textEl = el.getElement();

      if (textEl.getType() === DocumentApp.ElementType.TEXT ||
          textEl.editAsText) {
        var t = textEl.editAsText ? textEl.editAsText() : textEl.asText();
        if (el.isPartial()) {
          text += t.getText().substring(el.getStartOffset(), el.getEndOffsetInclusive() + 1);
        } else {
          text += t.getText();
        }
      }
    }

    return text.trim();
  },

  /**
   * Get all entities for sidebar display.
   * @returns {Array} Entity metadata with mention counts
   */
  getAll: function() {
    var meta = getPropArray(PROP_ENTITY_META);
    var doc = DocumentApp.getActiveDocument();

    // Add mention count for each entity
    for (var i = 0; i < meta.length; i++) {
      var prefix = PREFIX_ENTITY + meta[i].entityId + '_';
      var ranges = NRManager.findByPrefix(prefix);
      meta[i].mentionCount = ranges.length;
    }

    return meta;
  }
};
