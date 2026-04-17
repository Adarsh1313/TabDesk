import { utils } from '../lib/utils.js';

export class TabCard {
    constructor(tab, options = {}) {
        this.tab = tab;
        this.options = options;
        this.element = this.create();
    }

    create() {
        const card = utils.createElement('div', 'tab-card');
        card.setAttribute('draggable', 'true');
        card.dataset.tabId = this.tab.id;
        card.dataset.windowId = this.tab.windowId;
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Open tab: ${this.tab.title}`);

        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                type: 'tab',
                tabId: this.tab.id,
                windowId: this.tab.windowId
            }));
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        const icon = utils.createElement('img', 'tab-icon');

        const isExtensionPage = this.tab.url?.startsWith('chrome://') ||
            this.tab.url?.startsWith('chrome-extension://') ||
            this.tab.url?.startsWith('edge://');

        if (isExtensionPage || !this.tab.favIconUrl || this.tab.favIconUrl === '') {
            icon.src = 'assets/icon-16.png';
        } else {
            icon.src = this.tab.favIconUrl;
            icon.onerror = () => {
                icon.src = 'assets/icon-16.png';
            };
        }

        const speakerIcon = utils.createElement('span', 'speaker-icon');
        speakerIcon.title = 'Mute/Unmute';
        speakerIcon.style.cursor = 'pointer';
        speakerIcon.style.fontSize = '14px';
        speakerIcon.style.marginLeft = '4px';
        speakerIcon.style.marginRight = '4px';
        speakerIcon.style.opacity = '0.6';
        speakerIcon.style.transition = 'opacity 0.2s';

        const updateSpeakerIcon = (isMuted) => {
            speakerIcon.innerHTML = isMuted
                ? '<span class="icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg></span>'
                : '<span class="icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg></span>';
            speakerIcon.style.opacity = isMuted ? '1' : '0.6';
        };

        updateSpeakerIcon(this.tab.mutedInfo?.muted || false);

        speakerIcon.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const tab = await chrome.tabs.get(this.tab.id);
                const newMutedState = !tab.mutedInfo.muted;
                await chrome.tabs.update(this.tab.id, { muted: newMutedState });
                updateSpeakerIcon(newMutedState);
            } catch (err) {
                console.error('Mute toggle failed:', err);
            }
        });

        speakerIcon.addEventListener('mouseenter', () => {
            speakerIcon.style.opacity = '1';
        });
        speakerIcon.addEventListener('mouseleave', () => {
            if (!this.tab.mutedInfo?.muted) {
                speakerIcon.style.opacity = '0.6';
            }
        });

        const title = utils.createElement('span', 'tab-title', this.tab.title);
        const dot = utils.createElement('span', 'status-dot hidden');

        const actions = utils.createElement('div', 'tab-actions');

        const closeBtn = utils.createElement('div', 'close-btn', '✕');
        closeBtn.title = 'Close Tab';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.tabs.remove(this.tab.id);
        });
        actions.appendChild(closeBtn);

        // Inline note affordance
        const noteAffordance = utils.createElement('div', 'note-affordance');
        noteAffordance.dataset.url = this.tab.url || '';
        const noteLabel = utils.createElement('span', 'note-label', 'Add note');
        const noteDot = utils.createElement('span', 'note-dot');
        noteDot.hidden = true;
        noteAffordance.appendChild(noteLabel);
        noteAffordance.appendChild(noteDot);

        const noteBody = utils.createElement('div', 'note-body');
        noteBody.hidden = true;
        const noteTextarea = utils.createElement('textarea', 'note-textarea');
        noteTextarea.placeholder = 'Write a note...';
        noteTextarea.rows = 3;
        noteTextarea.spellcheck = true;
        noteBody.appendChild(noteTextarea);

        card.appendChild(icon);
        card.appendChild(speakerIcon);
        card.appendChild(title);
        card.appendChild(dot);
        card.appendChild(actions);
        card.appendChild(noteAffordance);
        card.appendChild(noteBody);

        card.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey) {
                card.classList.toggle('selected');
                e.stopPropagation();
            } else {
                document.querySelectorAll('.tab-card.selected').forEach(el => el.classList.remove('selected'));
                chrome.tabs.update(this.tab.id, { active: true });
                chrome.windows.update(this.tab.windowId, { focused: true });
            }
        });

        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.click();
            }

            if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
                e.preventDefault();
                const rect = card.getBoundingClientRect();
                card.dispatchEvent(new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    pageX: rect.left + window.scrollX + 24,
                    pageY: rect.bottom + window.scrollY - 4
                }));
            }
        });

        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();

            if (!card.classList.contains('selected')) {
                document.querySelectorAll('.tab-card.selected').forEach(el => el.classList.remove('selected'));
                card.classList.add('selected');
            }

            const ctxMenu = document.getElementById('context-menu');
            ctxMenu.classList.remove('hidden');

            let x = e.pageX;
            let y = e.pageY;

            if (x + 160 > window.scrollX + window.innerWidth) x = window.scrollX + window.innerWidth - 165;
            if (y + 200 > window.scrollY + window.innerHeight) y = window.scrollY + window.innerHeight - 205;

            ctxMenu.style.top = `${y}px`;
            ctxMenu.style.left = `${x}px`;

            const selectedCount = document.querySelectorAll('.tab-card.selected').length;
            const contextType = selectedCount > 1 ? 'multi-tab' : 'tab';

            ctxMenu.dataset.targetId = this.tab.id;
            ctxMenu.dataset.targetType = contextType;
            ctxMenu.dataset.context = contextType;

            if (window.updateContextLabels) {
                window.updateContextLabels(contextType);
            }
        });

        return card;
    }

    updateStatus(isSaved) {
        const dot = this.element.querySelector('.status-dot');
        if (isSaved) {
            dot.classList.remove('hidden');
        } else {
            dot.classList.add('hidden');
        }
    }

}
