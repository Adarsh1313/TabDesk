import { utils } from '../lib/utils.js';
import { TaskCard } from './TaskCard.js';

export class TaskGroupCard {
    constructor(groupTask, onRestore, onDelete, onToggleComplete, options = {}) {
        this.groupTask = groupTask;
        this.onRestore = onRestore;
        this.onDelete = onDelete;
        this.onToggleComplete = onToggleComplete;
        this.options = options;
        this.element = this.create();
    }

    create() {
        const card = utils.createElement('div', 'group-card task-group-card');
        card.dataset.taskId = this.groupTask.id;

        const header = utils.createElement('div', 'group-header');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.borderLeft = `3px solid ${this.getGroupColor(this.groupTask.color)}`;
        header.tabIndex = 0;
        header.setAttribute('role', 'button');
        header.setAttribute('aria-label', `Toggle saved group: ${this.groupTask.title || 'Untitled Group'}`);

        const leftContainer = utils.createElement('div', 'group-left-container');
        leftContainer.style.display = 'flex';
        leftContainer.style.alignItems = 'center';
        leftContainer.style.gap = '8px';

        const checkboxConfig = utils.createElement('div', 'task-checkbox-container');
        const checkbox = utils.createElement('input', 'task-checkbox');
        checkbox.type = 'checkbox';
        checkbox.checked = !!this.groupTask.completed;
        checkboxConfig.title = this.groupTask.completed ? 'Mark as Incomplete' : 'Mark as Completed';
        checkboxConfig.onclick = (e) => e.stopPropagation();
        checkboxConfig.appendChild(checkbox);

        const titleContainer = utils.createElement('div', 'group-title-container');
        titleContainer.style.display = 'flex';
        titleContainer.style.alignItems = 'center';
        titleContainer.style.gap = '8px';

        const titleText = this.groupTask.title || 'Untitled Group';
        const title = utils.createElement('span', 'group-title', titleText);
        const count = utils.createElement('span', 'group-count', this.groupTask.tasks.length.toString());

        titleContainer.appendChild(title);
        titleContainer.appendChild(count);
        leftContainer.appendChild(checkboxConfig);
        leftContainer.appendChild(titleContainer);

        const actions = utils.createElement('div', 'group-actions');
        actions.style.display = 'flex';
        actions.style.gap = '4px';

        const restoreBtn = utils.createElement('div', 'btn-icon');
        restoreBtn.innerHTML = '<span class="icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></span>';
        restoreBtn.title = 'Restore Group';
        restoreBtn.style.cursor = 'pointer';
        restoreBtn.onclick = (e) => {
            e.stopPropagation();
            this.onRestore(this.groupTask);
        };

        const deleteBtn = utils.createElement('div', 'close-btn');
        deleteBtn.innerHTML = '<span class="icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></span>';
        deleteBtn.title = 'Delete Group (Move to History)';
        deleteBtn.style.position = 'static';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            this.onDelete(this.groupTask);
        };

        actions.appendChild(restoreBtn);
        actions.appendChild(deleteBtn);

        header.appendChild(leftContainer);
        header.appendChild(actions);

        const body = utils.createElement('div', 'group-body');
        header.setAttribute('aria-expanded', String(!body.classList.contains('hidden')));

        this.groupTask.tasks.forEach(task => {
            const taskCard = new TaskCard(task, () => { }, () => { }, null, { noteCount: 0 });
            const actionsDiv = taskCard.element.querySelector('.task-actions');
            if (actionsDiv) actionsDiv.style.display = 'none';
            const cb = taskCard.element.querySelector('.task-checkbox');
            if (cb) {
                cb.disabled = true;
                if (this.groupTask.completed) cb.checked = true;
            }
            if (this.groupTask.completed) taskCard.element.classList.add('completed');

            body.appendChild(taskCard.element);
        });

        header.addEventListener('click', (e) => {
            if (e.target.closest('.btn-icon') || e.target.closest('.close-btn') || e.target.closest('.task-checkbox-container')) return;
            body.classList.toggle('hidden');
            header.setAttribute('aria-expanded', String(!body.classList.contains('hidden')));
        });

        checkbox.addEventListener('change', () => {
            if (this.onToggleComplete) {
                this.onToggleComplete(this.groupTask);
            }
        });

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

            ctxMenu.dataset.targetId = this.groupTask.id;
            ctxMenu.dataset.targetType = 'task-group';
            if (window.updateContextLabels) window.updateContextLabels('task-group');
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

        card.appendChild(header);
        card.appendChild(body);

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
}
