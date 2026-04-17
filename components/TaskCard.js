import { utils } from '../lib/utils.js';

export class TaskCard {
    constructor(task, onRestore, onDelete, onToggleComplete, options = {}) {
        this.task = task;
        this.onRestore = onRestore;
        this.onDelete = onDelete;
        this.onToggleComplete = onToggleComplete;
        this.options = options;
        this.element = this.create();
    }

    create() {
        const card = utils.createElement('div', 'task-card');
        card.dataset.taskId = this.task.id;
        card.tabIndex = 0;
        card.setAttribute('role', 'group');
        card.setAttribute('aria-label', `Task: ${this.task.title}`);

        const checkboxConfig = utils.createElement('div', 'task-checkbox-container');
        const checkbox = utils.createElement('input', 'task-checkbox');
        checkbox.type = 'checkbox';
        checkbox.checked = !!this.task.completed;
        checkboxConfig.title = this.task.completed ? 'Mark as Incomplete' : 'Mark as Completed';
        checkboxConfig.appendChild(checkbox);

        const content = utils.createElement('div', 'task-content');
        const title = utils.createElement('div', 'task-title', this.task.title);
        const titleRow = utils.createElement('div', 'task-title-row');
        titleRow.appendChild(title);

        const meta = utils.createElement('div', 'task-meta');
        const time = utils.createElement('span', 'task-time', utils.formatDate(this.task.createdAt));
        time.title = utils.formatDateFull(this.task.createdAt);
        meta.appendChild(time);

        content.appendChild(titleRow);
        content.appendChild(meta);

        const actions = utils.createElement('div', 'task-actions');

        const restoreBtn = utils.createElement('button', 'btn-icon');
        restoreBtn.innerHTML = '<span class="icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></span>';
        restoreBtn.title = 'Restore to Open Tabs';
        restoreBtn.onclick = (e) => {
            e.stopPropagation();
            this.onRestore(this.task);
        };

        const deleteBtn = utils.createElement('button', 'btn-icon destructor');
        deleteBtn.innerHTML = '<span class="icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></span>';
        deleteBtn.title = 'Delete Task (Move to History)';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            this.onDelete(this.task);
        };

        actions.appendChild(restoreBtn);
        actions.appendChild(deleteBtn);

        // Inline note affordance
        const noteAffordance = utils.createElement('div', 'note-affordance');
        noteAffordance.dataset.url = this.task.url || '';
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

        card.appendChild(checkboxConfig);
        card.appendChild(content);
        card.appendChild(actions);
        card.appendChild(noteAffordance);
        card.appendChild(noteBody);

        checkbox.addEventListener('change', () => {
            if (this.onToggleComplete) {
                this.onToggleComplete(this.task);
            }
        });

        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const ctxMenu = document.getElementById('context-menu');
            ctxMenu.classList.remove('hidden');

            let x = e.pageX;
            let y = e.pageY;
            if (x + 160 > window.scrollX + window.innerWidth) x = window.scrollX + window.innerWidth - 165;
            if (y + 200 > window.scrollY + window.innerHeight) y = window.scrollY + window.innerHeight - 205;

            ctxMenu.style.top = `${y}px`;
            ctxMenu.style.left = `${x}px`;

            ctxMenu.dataset.targetId = this.task.id;
            ctxMenu.dataset.targetType = 'task';
            if (window.updateContextLabels) window.updateContextLabels('task');
        });

        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.onRestore(this.task);
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                this.onDelete(this.task);
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

        return card;
    }
}
