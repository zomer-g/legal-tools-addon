/**
 * entities.js — Entity highlighting, cross-references, and popover system
 */

const EntityProcessor = {
    entities: {},
    activePopover: null,
    mentionIndex: {}, // entityId -> [{chapterId, chapterTitle, snippet}]

    /**
     * Initialize with entity definitions from document.json
     */
    init(entityDefs) {
        this.entities = {};
        this.mentionIndex = {};
        if (!entityDefs) return;

        const types = {
            people: { icon: 'fa-user', cssClass: 'entity-people' },
            organizations: { icon: 'fa-building', cssClass: 'entity-org' },
            evidence: { icon: 'fa-file-pdf', cssClass: 'entity-evidence' },
            cases: { icon: 'fa-gavel', cssClass: 'entity-case' },
            laws: { icon: 'fa-paragraph', cssClass: 'entity-law' }
        };

        for (const [type, config] of Object.entries(types)) {
            if (entityDefs[type]) {
                entityDefs[type].forEach(ent => {
                    this.entities[ent.id] = {
                        ...ent,
                        type,
                        icon: config.icon,
                        cssClass: config.cssClass
                    };
                });
            }
        }

        // Close popover on outside click
        document.addEventListener('click', (e) => {
            if (this.activePopover && !e.target.closest('.entity-badge') && !e.target.closest('.entity-popover-float')) {
                this.closePopover();
            }
        });
    },

    /**
     * Build mention index from all chapters
     */
    buildMentionIndex(flatChapters) {
        this.mentionIndex = {};
        flatChapters.forEach(ch => {
            if (!ch.content) return;
            // Find all entity/evidence/cite references
            const regex = /\{\{(?:entity|evidence|cite):([^:}]+)/g;
            let match;
            while ((match = regex.exec(ch.content)) !== null) {
                const id = match[1];
                if (!this.mentionIndex[id]) this.mentionIndex[id] = [];
                // Avoid duplicate chapter entries
                if (!this.mentionIndex[id].find(m => m.chapterId === ch.id)) {
                    this.mentionIndex[id].push({
                        chapterId: ch.id,
                        chapterTitle: ch.title,
                        chapterNum: ch.chapterNum
                    });
                }
            }
        });
    },

    /**
     * Process content string, replacing {{tokens}} with HTML badges
     */
    processContent(html) {
        if (!html) return '';

        // {{evidence:id:page}} — evidence with specific page (must come before generic evidence)
        html = html.replace(/\{\{evidence:([^:}]+):(\d+)\}\}/g, (match, id, page) => {
            return this.renderBadge(id, 'evidence', page);
        });

        // {{entity:id}} — generic entity reference
        html = html.replace(/\{\{entity:([^}]+)\}\}/g, (match, id) => {
            return this.renderBadge(id);
        });

        // {{evidence:id}} — evidence with PDF link
        html = html.replace(/\{\{evidence:([^}]+)\}\}/g, (match, id) => {
            return this.renderBadge(id, 'evidence');
        });

        // {{cite:id}} — legal citation
        html = html.replace(/\{\{cite:([^}]+)\}\}/g, (match, id) => {
            return this.renderBadge(id, 'law');
        });

        // {{sheet:id}} — Google Sheets embed
        html = html.replace(/\{\{sheet:([^}]+)\}\}/g, (match, id) => {
            return this.renderSheetEmbed(id);
        });

        return html;
    },

    /**
     * Render an entity badge
     */
    renderBadge(id, forceType, page) {
        const entity = this.entities[id];
        if (!entity) {
            return `<span class="entity-badge entity-people"><i class="fas fa-question-circle"></i> ${id}</span>`;
        }

        const cssClass = entity.cssClass;
        const icon = entity.icon;
        const label = entity.label || entity.name || entity.ref || id;

        let attrs = `data-entity-id="${id}"`;
        if (entity.pdf) attrs += ` data-pdf="${entity.pdf}"`;
        if (page) attrs += ` data-page="${page}"`;

        return `<span class="entity-badge ${cssClass}" ${attrs} onclick="EntityProcessor.onBadgeClick(this, event)"><i class="fas ${icon}"></i> ${label}</span>`;
    },

    /**
     * Render a Google Sheets embed placeholder
     */
    renderSheetEmbed(id) {
        return `<div class="sheet-embed" data-sheet-id="${id}">
            <div class="sheet-embed-header">
                <i class="fas fa-table"></i>
                <span>טבלה: ${id}</span>
            </div>
            <div class="sheet-embed-body"></div>
        </div>`;
    },

    /**
     * Handle badge click
     */
    onBadgeClick(el, event) {
        event.stopPropagation();
        const entityId = el.dataset.entityId;
        const entity = this.entities[entityId];
        if (!entity) return;

        // If evidence with PDF, open PDF modal
        if (entity.pdf || el.dataset.pdf) {
            const pdf = entity.pdf || el.dataset.pdf;
            const page = el.dataset.page || null;
            if (typeof ViewerApp !== 'undefined' && ViewerApp.openPdf) {
                ViewerApp.openPdf(pdf, entity.label || entity.name, page);
            }
            return;
        }

        // Otherwise show floating popover
        this.closePopover();
        this.showPopover(el, entity);
    },

    /**
     * Show entity popover — floating, positioned below the badge
     */
    showPopover(anchorEl, entity) {
        const popover = document.createElement('div');
        popover.className = 'entity-popover-float show';

        let detailsHtml = '';
        if (entity.role) detailsHtml += `<div class="epf-role">${entity.role}</div>`;
        if (entity.description) detailsHtml += `<div class="epf-desc">${entity.description}</div>`;
        if (entity.ref) detailsHtml += `<div class="epf-ref">${entity.ref}</div>`;
        if (entity.url) detailsHtml += `<div class="epf-link"><a href="${entity.url}" target="_blank"><i class="fas fa-external-link-alt"></i> פתח קישור</a></div>`;

        // Mentions
        const mentions = this.mentionIndex[entity.id];
        if (mentions && mentions.length > 0) {
            detailsHtml += `<div class="epf-mentions-title">אזכורים (${mentions.length})</div>`;
            detailsHtml += `<div class="epf-mentions">`;
            mentions.forEach(m => {
                detailsHtml += `<a class="epf-mention-link" data-chapter="${m.chapterId}" onclick="EntityProcessor.closePopover(); ViewerApp.goToChapter('${m.chapterId}')">
                    <span class="epf-mention-num">${m.chapterNum}</span> ${m.chapterTitle}
                </a>`;
            });
            detailsHtml += `</div>`;
        }

        popover.innerHTML = `
            <div class="epf-header">
                <span class="entity-badge ${entity.cssClass}" style="cursor: default;"><i class="fas ${entity.icon}"></i> ${entity.name || entity.label || entity.ref || entity.id}</span>
                <button class="epf-close" onclick="EntityProcessor.closePopover()"><i class="fas fa-times"></i></button>
            </div>
            ${detailsHtml}
        `;

        document.body.appendChild(popover);

        // Position below the badge
        const rect = anchorEl.getBoundingClientRect();
        const popRect = popover.getBoundingClientRect();
        let top = rect.bottom + 8;
        let right = window.innerWidth - rect.right;

        // Keep within viewport
        if (top + popRect.height > window.innerHeight - 20) {
            top = rect.top - popRect.height - 8;
        }
        if (right < 10) right = 10;
        if (right + popRect.width > window.innerWidth - 10) {
            right = window.innerWidth - popRect.width - 10;
        }

        popover.style.top = top + 'px';
        popover.style.right = right + 'px';

        this.activePopover = popover;
    },

    /**
     * Close active popover
     */
    closePopover() {
        if (this.activePopover) {
            this.activePopover.remove();
            this.activePopover = null;
        }
    },

    /**
     * Get all entities grouped by type for the sidebar
     */
    getEntitiesByType() {
        const grouped = {};
        const typeLabels = {
            people: { label: 'אנשים', icon: 'fa-users' },
            organizations: { label: 'ארגונים', icon: 'fa-building' },
            evidence: { label: 'ראיות', icon: 'fa-file-pdf' },
            cases: { label: 'תיקים', icon: 'fa-gavel' },
            laws: { label: 'חקיקה ופסיקה', icon: 'fa-paragraph' }
        };
        for (const [id, ent] of Object.entries(this.entities)) {
            const type = ent.type;
            if (!grouped[type]) grouped[type] = { ...typeLabels[type], entities: [] };
            grouped[type].entities.push({ ...ent, mentionCount: (this.mentionIndex[id] || []).length });
        }
        return grouped;
    }
};
