(() => {
  'use strict';
  const api = window.OlivaApi;
  const $ = (selector) => document.querySelector(selector);
  const form = $('#menu-form');
  const deleteSelect = $('#delete-item-select');
  const deleteButton = $('#delete-item');
  const generalFeedback = $('#manage-feedback');
  const deleteFeedback = $('#delete-feedback');
  const pageError = $('#page-error');
  let menuItems = [];

  if (api.demoMode) {
    $('#demo-banner').hidden = false;
    document.querySelectorAll('a[href="/"]').forEach((link) => { link.href = '/?demo=1'; });
  }

  function feedback(element, message, type) {
    element.textContent = message || '';
    element.className = 'form-feedback' + (type ? ' ' + type : '');
  }

  function updateDeleteState() {
    deleteButton.disabled = !deleteSelect.value;
  }

  function renderMenuOptions() {
    const selected = deleteSelect.value;
    deleteSelect.innerHTML = '<option value="">Choose a dish</option>' + menuItems.map((item) =>
      '<option value="' + String(api.getId(item)) + '">' + String(item.title || 'Untitled dish').replace(/[&<>"']/g, (c) =>
        ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) +
      ' · ' + api.money(item.price) + '</option>'
    ).join('');
    if (menuItems.some((item) => String(api.getId(item)) === selected)) deleteSelect.value = selected;
    updateDeleteState();
  }

  async function loadMenu() {
    deleteSelect.innerHTML = '<option value="">Loading menu…</option>';
    updateDeleteState();
    pageError.hidden = true;
    try {
      const data = await api.request('/menu');
      menuItems = api.listFrom(data, ['menu','items','data']);
      renderMenuOptions();
    } catch (error) {
      menuItems = [];
      renderMenuOptions();
      pageError.textContent = 'Could not load the menu. ' + error.message;
      pageError.hidden = false;
    }
  }

  async function addItem(event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    feedback(generalFeedback, '');
    const body = {
      title:$('#item-title').value.trim(),
      price:Number($('#item-price').value),
      stock_quantity:Number($('#item-stock').value)
    };
    if (body.title.length < 2 || !Number.isFinite(body.price) || body.price <= 0 ||
        !Number.isInteger(body.stock_quantity) || body.stock_quantity < 0) {
      feedback(generalFeedback, 'Enter a dish name, positive price, and whole stock quantity.', 'error');
      return;
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await api.request('/menu', {method:'POST', body:JSON.stringify(body)});
      form.reset();
      await loadMenu();
      feedback(generalFeedback, body.title + ' added' + (api.demoMode ? ' to the preview.' : '.'));
    } catch (error) {
      feedback(generalFeedback, 'Could not add the dish. ' + error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  }

  async function deleteItem() {
    const id = deleteSelect.value;
    const item = menuItems.find((entry) => String(api.getId(entry)) === id);
    if (!item || !window.confirm('Delete "' + item.title + '" from the menu?')) return;
    deleteButton.disabled = true;
    try {
      await api.request('/menu/' + encodeURIComponent(id), {method:'DELETE'});
      await loadMenu();
      feedback(deleteFeedback, item.title + ' removed' + (api.demoMode ? ' from the preview.' : '.'));
    } catch (error) {
      feedback(deleteFeedback, 'Could not delete the dish. ' + error.message, 'error');
    } finally {
      updateDeleteState();
    }
  }

  form.addEventListener('submit', addItem);
  deleteSelect.addEventListener('change', updateDeleteState);
  deleteButton.addEventListener('click', deleteItem);
  loadMenu();
})();
