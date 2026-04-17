import { utils } from '../lib/utils.js';

export class Toast {
    constructor() {
        this.element = this.create();
        document.body.appendChild(this.element);
        this.timeout = null;
    }

    create() {
        const toast = utils.createElement('div', 'toast hidden');
        toast.innerHTML = `
            <span class="toast-message"></span>
            <div class="toast-actions">
                <button class="toast-btn" id="toast-undo">Undo</button>
                <button class="toast-btn primary" id="toast-ok">OK</button>
            </div>
        `;
        return toast;
    }

    show(message, onUndo, duration = 5000) {
        // Clear previous
        if (this.timeout) clearTimeout(this.timeout);

        const msgEl = this.element.querySelector('.toast-message');
        const undoBtn = this.element.querySelector('#toast-undo');
        const okBtn = this.element.querySelector('#toast-ok');

        msgEl.textContent = message;
        this.element.classList.remove('hidden');

        const dismiss = () => {
            this.element.classList.add('hidden');
            if (this.timeout) clearTimeout(this.timeout);
        };

        undoBtn.onclick = () => {
            onUndo();
            dismiss();
        };

        okBtn.onclick = () => {
            dismiss();
        };

        this.timeout = setTimeout(dismiss, duration);
    }
}
