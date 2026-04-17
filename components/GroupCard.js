import { utils } from '../lib/utils.js';
import { TabCard } from './TabCard.js';

export class GroupCard {
    constructor(group, tabs) {
        this.group = group;
        this.tabs = tabs;
        this.element = this.create();
    }

    create() {
        const card = utils.createElement('div', 'group-card');
        card.dataset.groupId = this.group.id;

        // Header
        const header = utils.createElement('div', 'group-header');
        header.style.borderLeft = `3px solid ${this.getGroupColor(this.group.color)}`;
        header.tabIndex = 0;
        header.setAttribute('role', 'button');
        header.setAttribute('aria-label', `Toggle group: ${this.group.title || 'Untitled Group'}`);

        // Title & Collapse Toggle
        const titleText = this.group.title || 'Untitled Group';
        const title = utils.createElement('span', 'group-title', titleText);
        const noteBadge = utils.createElement('span', 'note-badge hidden', '📝');
        noteBadge.title = 'This group has linked notes';

        const count = utils.createElement('span', 'group-count', this.tabs.length.toString());

        const closeBtn = utils.createElement('div', 'close-btn', '✕');
        closeBtn.title = 'Close Group';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close all tabs in group
            const tabIds = this.tabs.map(t => t.id);
            chrome.tabs.remove(tabIds);
        });

        // Group Status Dot (Initially Hidden)
        const dot = utils.createElement('div', 'status-dot hidden');

        header.appendChild(title);
        header.appendChild(noteBadge);
        header.appendChild(dot); // Add dot before count
        header.appendChild(count);
        header.appendChild(closeBtn);

        // Body (Tabs list)
        const body = utils.createElement('div', 'group-body');
        if (this.group.collapsed) {
            body.classList.add('hidden');
        }
        header.setAttribute('aria-expanded', String(!body.classList.contains('hidden')));

        this.tabs.forEach(tab => {
            const tabCard = new TabCard(tab);
            body.appendChild(tabCard.element);
        });

        card.appendChild(header);
        card.appendChild(body);

        // Toggle Expand/Collapse mechanism (Decoupled from Chrome Group State)
        header.addEventListener('click', async () => {
            // Just toggle local visibility
            if (body.classList.contains('hidden')) {
                body.classList.remove('hidden');
                // Optional: Save state to localStorage to persist across re-opens? 
                // For now, simpler is better as per instructions "just opens up all the tabs in the extension"
            } else {
                body.classList.add('hidden');
            }
            header.setAttribute('aria-expanded', String(!body.classList.contains('hidden')));
        });

        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                header.click();
            }

            if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
                e.preventDefault();
                const rect = header.getBoundingClientRect();
                header.dispatchEvent(new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    pageX: rect.left + window.scrollX + 24,
                    pageY: rect.bottom + window.scrollY - 4
                }));
            }
        });

        // Context Menu for Group
        header.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const ctxMenu = document.getElementById('context-menu');
            ctxMenu.classList.remove('hidden');

            let x = e.pageX;
            let y = e.pageY;

            if (x + 160 > window.scrollX + window.innerWidth) x = window.scrollX + window.innerWidth - 165;
            if (y + 200 > window.scrollY + window.innerHeight) y = window.scrollY + window.innerHeight - 205;

            ctxMenu.style.top = `${y}px`;
            ctxMenu.style.left = `${x}px`;

            ctxMenu.dataset.targetId = this.group.id;
            ctxMenu.dataset.targetType = 'group';
            ctxMenu.dataset.context = 'group'; // For CSS visibility

            if (window.updateContextLabels) window.updateContextLabels('group');
        });

        // Drag Drop (Receive Tabs)
        header.addEventListener('dragover', (e) => {
            e.preventDefault();
            header.classList.add('drag-over');
        });

        header.addEventListener('dragleave', () => {
            header.classList.remove('drag-over');
        });

        header.addEventListener('drop', async (e) => {
            e.preventDefault();
            header.classList.remove('drag-over');
            const data = e.dataTransfer.getData('text/plain');
            if (!data) return;

            try {
                const { type, tabId } = JSON.parse(data);
                if (type === 'tab' && tabId) {
                    await chrome.tabs.group({
                        groupId: this.group.id,
                        tabIds: [parseInt(tabId)]
                    });
                }
            } catch (err) {
                console.error('Drop error', err);
            }
        });

        return card;
    }

    getGroupColor(colorName) {
        const colors = {
            grey: '#5f6368',
            blue: '#1a73e8',
            red: '#d93025',
            yellow: '#e37400',
            green: '#188038',
            pink: '#d01884',
            purple: '#9334e6',
            cyan: '#007b83',
            orange: '#fa903e'
        };
        return colors[colorName] || colors.grey;
    }

    updateNoteBadge(hasNote) {
        const badge = this.element.querySelector('.group-header .note-badge');
        if (!badge) return;

        if (hasNote) {
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}
