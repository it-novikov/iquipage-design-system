"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fieldError = fieldError;
exports.setFieldError = setFieldError;
exports.validateFields = validateFields;
const components_js_1 = require("./components.js");
/** Field-level validation; this module never creates a second form-wide alert. */
function setFieldError(input, message) {
    const field = input.closest('.iq-field'), shell = input.closest('.iq-input-shell');
    if (!field || !shell)
        return;
    input.id ||= components_js_1.uid();
    const id = input.id + '-validation';
    let helper = field.querySelector('[data-validation-error]');
    if (message && !helper) {
        helper = document.createElement('small');
        helper.id = id;
        helper.className = 'iq-helper error';
        helper.dataset.validationError = '';
        helper.setAttribute('aria-live', 'polite');
        field.append(helper);
    }
    if (helper) {
        helper.textContent = message;
        helper.hidden = !message;
    }
    shell.querySelector('[data-validation-icon]')?.remove();
    input.setAttribute('aria-invalid', String(!!message));
    shell.classList.toggle('error', !!message);
    const descriptions = new Set((input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
    message ? descriptions.add(id) : descriptions.delete(id);
    if (descriptions.size)
        input.setAttribute('aria-describedby', [...descriptions].join(' '));
    else
        input.removeAttribute('aria-describedby');
}
function fieldError(input) {
    if (input.required && !input.value.trim())
        return input.type === 'email' ? 'Укажите рабочую почту.' : input.name === 'title' ? 'Добавьте название задачи.' : 'Укажите ваше имя.';
    if (input.value.trim() && input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim()))
        return 'Укажите адрес полностью: name@company.com';
    if (!input.validity.valid)
        return input.validationMessage || 'Проверьте значение поля.';
    return '';
}
function validateFields(form) {
    let first;
    form.querySelectorAll('input:not([type=hidden])').forEach(input => {
        if (input.disabled)
            return;
        const message = fieldError(input);
        setFieldError(input, message);
        if (message && !first)
            first = input;
    });
    form.dataset.validationAttempted = 'true';
    first?.focus();
    return !first;
}

