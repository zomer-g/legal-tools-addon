/**
 * app.js — Index page: load cases and render case cards
 */

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('cases-container');
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');

    try {
        const res = await fetch('data/cases.json');
        if (!res.ok) throw new Error('Failed to load cases');
        const data = await res.json();

        loading.style.display = 'none';

        if (!data.cases || data.cases.length === 0) {
            error.style.display = 'block';
            return;
        }

        data.cases.forEach(caseData => {
            const col = document.createElement('div');
            col.className = 'col-lg-6 col-xl-4';

            const docsHtml = caseData.documents.map(doc => `
                <li data-case="${caseData.id}" data-doc="${doc.id}">
                    <i class="fas fa-file-alt"></i>
                    <span>${doc.title}</span>
                    ${doc.date ? `<span class="doc-date">${doc.date}</span>` : ''}
                </li>
            `).join('');

            col.innerHTML = `
                <div class="case-card">
                    <div class="case-icon">
                        <i class="fas ${caseData.icon || 'fa-gavel'}"></i>
                    </div>
                    <div class="case-title">${caseData.title}</div>
                    <div class="case-subtitle">${caseData.subtitle || ''}</div>
                    <ul class="doc-list">
                        ${docsHtml}
                    </ul>
                </div>
            `;

            // Click handler on each document item
            col.querySelectorAll('.doc-list li').forEach(li => {
                li.addEventListener('click', () => {
                    const caseId = li.dataset.case;
                    const docId = li.dataset.doc;
                    window.location.href = `viewer.html?case=${caseId}&doc=${docId}`;
                });
            });

            // If only one document, click on card opens it directly
            if (caseData.documents.length === 1) {
                col.querySelector('.case-card').addEventListener('click', (e) => {
                    if (e.target.closest('.doc-list li')) return; // let doc click handle it
                    const doc = caseData.documents[0];
                    window.location.href = `viewer.html?case=${caseData.id}&doc=${doc.id}`;
                });
            }

            container.appendChild(col);
        });

    } catch (err) {
        console.error('Error loading cases:', err);
        loading.style.display = 'none';
        error.style.display = 'block';
    }
});
