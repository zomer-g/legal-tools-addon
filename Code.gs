/**
 * Code.gs -- Entry point: menu creation, dispatch functions, refreshAll
 * Legal Tools Add-on for Google Docs (כלים משפטיים)
 */

/**
 * Runs when the document is opened. Creates the add-on menu.
 */
function onOpen(e) {
  var ui = DocumentApp.getUi();
  ui.createMenu('כלים משפטיים')
    .addItem('פתח סרגל כלים', 'showUnifiedSidebar')
    .addSeparator()
    .addItem('רענון מסמך', 'refreshAll')
    .addToUi();
}

/**
 * Runs when the add-on is installed from the Marketplace.
 */
function onInstall(e) {
  onOpen(e);
}

/**
 * Refresh all features: reorder appendices, recalculate entity first-mentions,
 * and update footnote citations.
 */
function refreshAll() {
  var lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    DocumentApp.getUi().alert('המסמך נעול כרגע. נסה שוב בעוד רגע.');
    return;
  }

  try {
    AppendixService.refresh();
    EntityService.refresh();
    FootnoteService.refresh();
    DocumentApp.getUi().alert('המסמך עודכן בהצלחה!');
  } catch (e) {
    Logger.log('refreshAll error: ' + e.message);
    DocumentApp.getUi().alert('אירעה שגיאה בעדכון המסמך. נסה שוב.');
  } finally {
    lock.releaseLock();
  }
}

// ============ Sidebar / Dialog Launchers ============

function showUnifiedSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('UnifiedSidebar')
    .setTitle('כלים משפטיים');
  DocumentApp.getUi().showSidebar(html);
}

function showAppendixSidebar() {
  showUnifiedSidebar();
}

function showEntitySidebar() {
  showUnifiedSidebar();
}

function showFootnoteDialog() {
  showUnifiedSidebar();
}

// ============ Appendix List Generation (from menu) ============

function generateAppendixListAtCursor() {
  AppendixService.generateListAtCursor();
}

// ============ Sidebar Dispatch Functions ============
// These are called from HTML sidebars via google.script.run

// -- Appendix --
function getAppendixList() {
  return AppendixService.getAll();
}

function addAppendixFromSidebar(description) {
  return withDocumentLock(function() {
    return AppendixService.addAppendix(sanitizeText(description, 500));
  });
}

function removeAppendixFromSidebar(uuid) {
  if (!isValidId(uuid)) return;
  withDocumentLock(function() {
    AppendixService.removeAppendix(uuid);
  });
}

function updateAppendixDescription(uuid, newDescription) {
  if (!isValidId(uuid)) return;
  withDocumentLock(function() {
    AppendixService.updateDescription(uuid, sanitizeText(newDescription, 500));
  });
}

function refreshAppendicesFromSidebar() {
  withDocumentLock(function() {
    AppendixService.refresh();
  });
}

// -- Entity --
function getEntityList() {
  return EntityService.getAll();
}

function defineEntityFromSidebar(alias, type) {
  return withDocumentLock(function() {
    return EntityService.defineEntity(sanitizeText(alias, 200), sanitizeText(type, 50));
  });
}

function markEntityMentionFromSidebar(entityId) {
  if (!isValidId(entityId)) return { success: false, error: 'מזהה לא תקין.' };
  return withDocumentLock(function() {
    return EntityService.markMention(entityId);
  });
}

function removeEntityFromSidebar(entityId) {
  if (!isValidId(entityId)) return;
  withDocumentLock(function() {
    EntityService.removeEntity(entityId);
  });
}

function updateEntityFromSidebar(entityId, updates) {
  if (!isValidId(entityId)) return;
  withDocumentLock(function() {
    EntityService.updateEntity(entityId, updates);
  });
}

function refreshEntitiesFromSidebar() {
  withDocumentLock(function() {
    EntityService.refresh();
  });
}

function insertEntityAtCursor(entityId) {
  if (!isValidId(entityId)) return { success: false, error: 'מזהה לא תקין.' };
  return withDocumentLock(function() {
    return EntityService.insertAtCursor(entityId);
  });
}

// -- Footnote --
function getFootnoteSources() {
  return FootnoteService.getAllSources();
}

function insertFootnoteFromDialog(sourceData, pinpoint) {
  return withDocumentLock(function() {
    return FootnoteService.insertFootnote(sourceData, sanitizeText(pinpoint, 500));
  });
}

function refreshFootnotesFromSidebar() {
  withDocumentLock(function() {
    FootnoteService.refresh();
  });
}

// -- Refresh all (from sidebar, no alert) --
function refreshAllFromSidebar() {
  withDocumentLock(function() {
    AppendixService.refresh();
    EntityService.refresh();
    FootnoteService.refresh();
  });
}

// -- Utility dispatch --
function convertToHebrewYear(gYear) {
  return gregorianToHebrewYear(gYear);
}
