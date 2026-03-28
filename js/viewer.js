/**
 * viewer.js — Book/presentation navigation engine
 */

const ViewerApp = {
    docData: null,
    flatChapters: [],
    currentIndex: 0,
    caseId: null,
    docId: null,
    isAdmin: false,

    async init() {
        const params = new URLSearchParams(window.location.search);
        this.caseId = params.get('case');
        this.docId = params.get('doc');
        this.isAdmin = params.get('admin') === '1' || localStorage.getItem('adminMode') === '1';

        if (!this.caseId || !this.docId) {
            window.location.href = 'index.html';
            return;
        }

        try {
            const res = await fetch(`data/${this.caseId}/${this.docId}/document.json`);
            if (!res.ok) throw new Error('Document not found');
            this.docData = await res.json();
        } catch (err) {
            console.error('Error loading document:', err);
            document.getElementById('chapterContent').innerHTML = `
                <div style="text-align: center; padding: 80px 20px; color: var(--text-muted);">
                    <i class="fas fa-exclamation-triangle fa-3x" style="margin-bottom: 16px;"></i>
                    <p>לא ניתן לטעון את המסמך</p>
                    <a href="index.html" style="color: var(--accent);">חזרה לרשימת התיקים</a>
                </div>
            `;
            return;
        }

        document.title = this.docData.meta.title + ' — מצגת טיעונים';
        document.getElementById('docTitle').textContent = this.docData.meta.title;

        EntityProcessor.init(this.docData.entities);
        this.buildFlatChapters();
        EntityProcessor.buildMentionIndex(this.flatChapters);
        this.buildTOC();
        this.buildEntitiesPanel();

        const hash = window.location.hash.slice(1);
        const startIndex = hash ? this.flatChapters.findIndex(c => c.id === hash) : 0;
        this.showChapter(startIndex >= 0 ? startIndex : 0);

        this.bindEvents();
        this.resolveSheetEmbeds();

        // Admin mode UI
        if (this.isAdmin) {
            document.getElementById('adminToggle').classList.add('active');
            document.body.classList.add('admin-mode');
        }
    },

    buildFlatChapters() {
        this.flatChapters = [];
        if (!this.docData.chapters) return;

        this.docData.chapters.forEach((ch, i) => {
            this.flatChapters.push({ ...ch, level: 0, parentIndex: null, chapterNum: i + 1 });
            if (ch.subsections) {
                ch.subsections.forEach((sub, j) => {
                    this.flatChapters.push({ ...sub, level: 1, parentIndex: i, chapterNum: `${i + 1}.${j + 1}` });
                });
            }
        });
    },

    buildTOC() {
        const tocList = document.getElementById('tocList');
        tocList.innerHTML = '';
        let currentParent = null;
        let subList = null;

        this.flatChapters.forEach((ch, index) => {
            const li = document.createElement('li');
            li.className = 'toc-item';

            const btn = document.createElement('button');
            btn.className = 'toc-link';
            btn.dataset.index = index;
            btn.innerHTML = `
                <span class="chapter-num">${ch.chapterNum}</span>
                <i class="fas ${ch.icon || 'fa-circle'}" style="font-size: 0.5rem;"></i>
                <span>${ch.title}</span>
            `;
            btn.addEventListener('click', () => this.showChapter(index));
            li.appendChild(btn);

            if (ch.level === 0) {
                tocList.appendChild(li);
                currentParent = li;
                subList = null;
            } else {
                if (!subList) {
                    subList = document.createElement('ul');
                    subList.className = 'toc-sub-list';
                    currentParent.appendChild(subList);
                }
                subList.appendChild(li);
            }
        });
    },

    /**
     * Build the entities panel in sidebar
     */
    buildEntitiesPanel() {
        const panel = document.getElementById('entitiesPanel');
        if (!panel) return;

        const grouped = EntityProcessor.getEntitiesByType();
        let html = '';

        for (const [type, group] of Object.entries(grouped)) {
            html += `<div class="entity-group">
                <div class="entity-group-title">
                    <i class="fas ${group.icon}"></i> ${group.label}
                    <span class="entity-group-count">${group.entities.length}</span>
                </div>`;
            group.entities.forEach(ent => {
                const mentions = EntityProcessor.mentionIndex[ent.id] || [];
                html += `<div class="entity-sidebar-item" data-entity-id="${ent.id}">
                    <div class="entity-sidebar-header" onclick="ViewerApp.toggleEntityExpand(this)">
                        <span class="entity-badge ${ent.cssClass}" style="font-size: 0.82rem; cursor: pointer;">
                            <i class="fas ${ent.icon}"></i> ${ent.name || ent.label || ent.ref}
                        </span>
                        <span class="entity-mention-count">${mentions.length} אזכורים</span>
                        <i class="fas fa-chevron-down entity-expand-icon"></i>
                    </div>
                    <div class="entity-sidebar-body" style="display:none;">
                        ${ent.role ? `<div class="entity-sidebar-role">${ent.role}</div>` : ''}
                        ${ent.description ? `<div class="entity-sidebar-desc">${ent.description}</div>` : ''}
                        ${mentions.length > 0 ? `<div class="entity-sidebar-mentions">
                            ${mentions.map(m => `<a class="entity-mention-link" onclick="ViewerApp.goToChapter('${m.chapterId}')">
                                <span class="mention-num">${m.chapterNum}</span> ${m.chapterTitle}
                            </a>`).join('')}
                        </div>` : '<div class="entity-sidebar-desc">אין אזכורים במסמך</div>'}
                    </div>
                </div>`;
            });
            html += `</div>`;
        }

        panel.innerHTML = html;
    },

    toggleEntityExpand(headerEl) {
        const item = headerEl.closest('.entity-sidebar-item');
        const body = item.querySelector('.entity-sidebar-body');
        const icon = item.querySelector('.entity-expand-icon');
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        icon.style.transform = isOpen ? '' : 'rotate(180deg)';
    },

    /**
     * Navigate to a chapter by ID
     */
    goToChapter(chapterId) {
        const idx = this.flatChapters.findIndex(c => c.id === chapterId);
        if (idx >= 0) this.showChapter(idx);
    },

    showChapter(index) {
        if (index < 0 || index >= this.flatChapters.length) return;

        this.currentIndex = index;
        const chapter = this.flatChapters[index];
        history.replaceState(null, '', `#${chapter.id}`);

        const contentArea = document.getElementById('chapterContent');
        let processedContent = EntityProcessor.processContent(chapter.content || '');

        const editableAttr = this.isAdmin ? 'contenteditable="true"' : '';
        const editHint = this.isAdmin ? `<div class="admin-edit-hint"><i class="fas fa-pen"></i> מצב עריכה — לחץ על הטקסט כדי לערוך</div>` : '';

        contentArea.innerHTML = `
            <div class="chapter-enter">
                ${editHint}
                <div class="chapter-header">
                    <div class="chapter-icon">
                        <i class="fas ${chapter.icon || 'fa-bookmark'}"></i>
                    </div>
                    <div class="chapter-number">פרק ${chapter.chapterNum}</div>
                    <h1 ${editableAttr} data-field="title">${chapter.title}</h1>
                </div>
                <div class="chapter-body" ${editableAttr} data-field="content">
                    ${processedContent}
                </div>
            </div>
        `;

        // Update TOC
        document.querySelectorAll('.toc-link').forEach(link => {
            link.classList.toggle('active', parseInt(link.dataset.index) === index);
        });
        const activeLink = document.querySelector('.toc-link.active');
        if (activeLink) activeLink.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

        this.updateNavButtons();
        this.updateProgress();
        window.scrollTo({ top: 0, behavior: 'smooth' });

        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarOverlay').classList.remove('show');
    },

    updateNavButtons() {
        const prevBtn = document.getElementById('prevChapterBtn');
        const nextBtn = document.getElementById('nextChapterBtn');
        const prevTitle = document.getElementById('prevChapterTitle');
        const nextTitle = document.getElementById('nextChapterTitle');

        if (this.currentIndex < this.flatChapters.length - 1) {
            const next = this.flatChapters[this.currentIndex + 1];
            nextBtn.classList.remove('disabled');
            nextTitle.textContent = next.title;
        } else {
            nextBtn.classList.add('disabled');
            nextTitle.textContent = '';
        }

        if (this.currentIndex > 0) {
            const prev = this.flatChapters[this.currentIndex - 1];
            prevBtn.classList.remove('disabled');
            prevTitle.textContent = prev.title;
        } else {
            prevBtn.classList.add('disabled');
            prevTitle.textContent = '';
        }
    },

    updateProgress() {
        const progress = ((this.currentIndex + 1) / this.flatChapters.length) * 100;
        document.getElementById('readingProgress').style.width = progress + '%';
    },

    bindEvents() {
        document.getElementById('nextChapterBtn').addEventListener('click', () => this.showChapter(this.currentIndex + 1));
        document.getElementById('prevChapterBtn').addEventListener('click', () => this.showChapter(this.currentIndex - 1));

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
            if (e.key === 'ArrowLeft') { e.preventDefault(); this.showChapter(this.currentIndex + 1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); this.showChapter(this.currentIndex - 1); }
            else if (e.key === 'Escape') { this.closePdf(); this.closePrintDialog(); EntityProcessor.closePopover(); }
        });

        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next);
            document.querySelector('#themeToggle i').className = next === 'light' ? 'fas fa-moon' : 'fas fa-sun';
            localStorage.setItem('theme', next);
        });
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            document.querySelector('#themeToggle i').className = savedTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        }

        // Print — open dialog
        document.getElementById('printBtn').addEventListener('click', () => this.openPrintDialog());

        // Sidebar toggle (mobile)
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
            document.getElementById('sidebarOverlay').classList.toggle('show');
        });
        document.getElementById('sidebarOverlay').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebarOverlay').classList.remove('show');
        });

        // Sidebar tabs
        document.querySelectorAll('.sidebar-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.tab;
                document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
                document.getElementById(target).classList.add('active');
            });
        });

        // PDF modal
        document.getElementById('pdfModalClose').addEventListener('click', () => this.closePdf());
        document.getElementById('pdfModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('pdfModal')) this.closePdf();
        });

        // Admin toggle
        document.getElementById('adminToggle').addEventListener('click', () => {
            this.isAdmin = !this.isAdmin;
            document.getElementById('adminToggle').classList.toggle('active', this.isAdmin);
            document.body.classList.toggle('admin-mode', this.isAdmin);
            localStorage.setItem('adminMode', this.isAdmin ? '1' : '0');
            this.showChapter(this.currentIndex); // re-render
        });

        // Hash change
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.slice(1);
            const idx = this.flatChapters.findIndex(c => c.id === hash);
            if (idx >= 0 && idx !== this.currentIndex) this.showChapter(idx);
        });
    },

    // ==================== PDF Modal ====================
    openPdf(pdfPath, title, page) {
        const modal = document.getElementById('pdfModal');
        const modalBody = document.getElementById('pdfModalBody');
        document.getElementById('pdfModalTitle').textContent = title || 'מסמך';
        const basePath = `data/${this.caseId}/${this.docId}/`;
        let fullPath = pdfPath.startsWith('http') ? pdfPath : basePath + pdfPath;
        if (page) fullPath += `#page=${page}`;
        modalBody.innerHTML = `<iframe src="${fullPath}" title="${title || 'PDF'}"></iframe>`;
        modal.classList.add('show');
    },

    closePdf() {
        document.getElementById('pdfModal').classList.remove('show');
        document.getElementById('pdfModalBody').innerHTML = `
            <div class="pdf-placeholder"><i class="fas fa-file-pdf"></i><p>המסמך אינו זמין כעת</p></div>
        `;
    },

    // ==================== Print Dialog ====================
    openPrintDialog() {
        const dialog = document.getElementById('printDialog');
        const list = document.getElementById('printChapterList');
        list.innerHTML = '';

        this.flatChapters.forEach((ch, i) => {
            const indent = ch.level === 1 ? 'padding-right: 28px;' : '';
            list.innerHTML += `
                <label class="print-chapter-item" style="${indent}">
                    <input type="checkbox" checked data-index="${i}">
                    <span class="print-chapter-num">${ch.chapterNum}</span>
                    <span>${ch.title}</span>
                </label>
            `;
        });

        dialog.classList.add('show');
    },

    closePrintDialog() {
        document.getElementById('printDialog').classList.remove('show');
    },

    printSelected() {
        const checkboxes = document.querySelectorAll('#printChapterList input[type="checkbox"]');
        const selectedIndices = [];
        checkboxes.forEach(cb => {
            if (cb.checked) selectedIndices.push(parseInt(cb.dataset.index));
        });

        if (selectedIndices.length === 0) return;

        // Build print content
        let printHtml = `<div class="print-document">
            <div class="print-header">
                <h1>${this.docData.meta.title}</h1>
                <p>${this.docData.meta.subject || ''}</p>
                <p>${this.docData.meta.to || ''}</p>
            </div>`;

        selectedIndices.forEach(idx => {
            const ch = this.flatChapters[idx];
            const content = EntityProcessor.processContent(ch.content || '');
            printHtml += `
                <div class="print-chapter">
                    <h2 class="print-chapter-title">פרק ${ch.chapterNum}: ${ch.title}</h2>
                    <div class="print-chapter-body">${content}</div>
                </div>
            `;
        });

        printHtml += `</div>`;

        // Open print window
        const win = window.open('', '_blank');
        win.document.write(`<!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>${this.docData.meta.title} — הדפסה</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.8; color: #1a1a1a; padding: 40px; max-width: 800px; margin: 0 auto; }
                .print-header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #333; }
                .print-header h1 { font-size: 1.6rem; margin-bottom: 8px; }
                .print-header p { color: #555; font-size: 0.9rem; margin: 4px 0; }
                .print-chapter { margin-bottom: 32px; page-break-inside: avoid; }
                .print-chapter-title { font-size: 1.2rem; color: #2c5364; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 16px; }
                .print-chapter-body p { margin-bottom: 12px; text-align: justify; }
                .print-chapter-body ul, .print-chapter-body ol { padding-right: 24px; }
                .print-chapter-body li { margin-bottom: 6px; }
                .print-chapter-body h2 { font-size: 1.1rem; margin: 20px 0 10px; }
                .print-chapter-body blockquote { border-right: 3px solid #2c5364; padding: 8px 16px; margin: 16px 0; background: #f5f5f5; }
                .entity-badge { padding: 1px 6px; border-radius: 10px; font-size: 0.85rem; border: 1px solid #ccc; background: #f0f0f0; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>${printHtml}</body>
        </html>`);
        win.document.close();
        setTimeout(() => win.print(), 500);

        this.closePrintDialog();
    },

    printSelectAll(checked) {
        document.querySelectorAll('#printChapterList input[type="checkbox"]').forEach(cb => {
            cb.checked = checked;
        });
    },

    // ==================== Sheet Embeds ====================
    resolveSheetEmbeds() {
        if (!this.docData.embeds || !this.docData.embeds.sheets) return;
        this.sheetLookup = {};
        this.docData.embeds.sheets.forEach(sheet => { this.sheetLookup[sheet.id] = sheet; });

        const observer = new MutationObserver(() => {
            document.querySelectorAll('.sheet-embed[data-sheet-id]').forEach(el => {
                const id = el.dataset.sheetId;
                const sheet = this.sheetLookup[id];
                if (sheet && !el.dataset.resolved) {
                    el.dataset.resolved = 'true';
                    const header = el.querySelector('.sheet-embed-header span');
                    if (header) header.textContent = sheet.title || id;
                    const body = el.querySelector('.sheet-embed-body');
                    if (body) body.innerHTML = `<iframe src="${sheet.url}" style="width:100%;min-height:400px;border:none;background:#fff;"></iframe>`;
                }
            });
        });
        observer.observe(document.getElementById('contentArea'), { childList: true, subtree: true });
    }
};

document.addEventListener('DOMContentLoaded', () => ViewerApp.init());
