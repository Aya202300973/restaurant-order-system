(() => {
  'use strict';
  const api = window.OlivaApi;
  const $ = (selector) => document.querySelector(selector);
  const menuGrid = $('#menu-grid');
  const menuNote = $('#menu-note');
  const menuEmpty = $('#menu-empty');
  const menuError = $('#menu-error');
  const drawer = $('#cart-drawer');
  const backdrop = $('#drawer-backdrop');
  const checkoutPanel = $('#checkout-panel');
  const cartFeedback = $('#cart-feedback');
  const checkoutFeedback = $('#checkout-feedback');
  const result = $('#order-result');
  const customerSelect = $('#customer-select');
  const quantityInput = $('#cart-quantity');
  const placeOrderButton = $('#place-order');
  let menuItems = [];
  let customers = [];
  let basket = null;
  let currentOrderId = null;
  let orders = [];
  let busy = false;
  let lastFocus = null;

  if (api.demoMode) {
    $('#demo-banner').hidden = false;
    document.querySelectorAll('a[href="/manage.html"]').forEach((link) => { link.href = '/manage.html?demo=1'; });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[character]);
  }

  function showFeedback(element, message, type) {
    element.textContent = message || '';
    element.className = 'form-feedback' + (type ? ' ' + type : '');
  }

  function renderMenu() {
    menuGrid.innerHTML = menuItems.map((item) => {
      const itemId = api.getId(item);
      const stock = Number(item.stock_quantity);
      const available = Number.isFinite(stock) && stock > 0;
      const stockText = !Number.isFinite(stock) ? 'Availability confirmed at checkout'
        : stock === 0 ? 'Sold out'
        : stock <= 3 ? 'Only ' + stock + ' left'
        : 'In stock';
      return '<article class="menu-card">' +
        '<div class="food-image-wrap ' + api.kindForTitle(item.title) + '">' +
          '<img class="food-image" data-food-photo src="' + escapeHtml(api.illustrationForTitle(item.title)) + '" alt="' + escapeHtml(item.title || 'Italian dish') + '" loading="lazy" />' +
          '<span class="availability' + (available ? '' : ' sold-out') + '">' + escapeHtml(stockText) + '</span>' +
        '</div>' +
        '<div class="menu-card-body">' +
          '<div class="menu-card-info"><h3>' + escapeHtml(item.title || 'Untitled dish') + '</h3><span class="dish-price">' + api.money(item.price) + '</span></div>' +
          '<button class="button button-primary add-button" data-add-item="' + escapeHtml(itemId) + '" type="button" ' + (available ? '' : 'disabled') + '>' +
            (available ? 'Add to order' : 'Sold out') + '<span class="add-button-icon" aria-hidden="true">+</span>' +
          '</button>' +
        '</div>' +
      '</article>';
    }).join('');
    menuEmpty.hidden = menuItems.length > 0;
    menuNote.textContent = menuItems.length ? menuItems.length + (menuItems.length === 1 ? ' dish' : ' dishes') : '';
    menuError.hidden = true;
    syncBasketWithMenu();
  }

  function loadFailure(message) {
    menuGrid.innerHTML = '';
    menuEmpty.hidden = true;
    menuNote.textContent = '';
    menuError.textContent = message;
    menuError.hidden = false;
  }

  async function loadMenu() {
    menuNote.textContent = api.demoMode ? 'Loading preview menu…' : 'Loading menu…';
    menuError.hidden = true;
    menuEmpty.hidden = true;
    try {
      const data = await api.request('/menu');
      menuItems = api.listFrom(data, ['menu','items','data']);
      renderMenu();
      renderOrders();
    } catch (error) {
      menuItems = [];
      loadFailure('Could not load the menu. ' + error.message);
    }
  }

  function renderOrders() {
    if (!orders.length) {
      $('#orders-note').textContent = api.demoMode ? 'No preview orders yet.' : 'No orders yet.';
      $('#orders-list').innerHTML = '';
      return;
    }
    $('#orders-note').textContent = orders.length + (orders.length === 1 ? ' order' : ' orders');
    $('#orders-list').innerHTML = orders.map((order) => {
      const orderId = api.getId(order);
      const item = menuItems.find((entry) => String(api.getId(entry)) === String(order.menu_item_id));
      const customer = customers.find((entry) => String(api.getId(entry)) === String(order.customer_id));
      const status = String(order.status || 'pending').toLowerCase();
      const safeStatus = /^(pending|preparing|ready|completed|cancelled)$/.test(status) ? status : 'pending';
      return '<article class="order-status-row">' +
        '<div class="order-status-main"><strong>Order #' + escapeHtml(orderId) + '</strong>' +
        '<span>' + escapeHtml(item ? item.title : 'Dish #' + order.menu_item_id) + ' × ' + escapeHtml(order.quantity) +
        (customer ? ' · ' + escapeHtml(customer.name) : '') + '</span></div>' +
        '<span class="order-status-badge ' + safeStatus + '">' + escapeHtml(safeStatus) + '</span></article>';
    }).join('');
  }

  async function loadOrders() {
    $('#orders-note').textContent = 'Loading orders…';
    try {
      const data = await api.request('/orders');
      orders = api.listFrom(data, ['orders','items','data']);
      renderOrders();
    } catch (error) {
      orders = [];
      $('#orders-note').textContent = 'Could not load order statuses. ' + error.message;
      $('#orders-list').innerHTML = '';
    }
  }

  async function loadCustomers() {
    customerSelect.innerHTML = '<option value="">Loading customers…</option>';
    try {
      const data = await api.request('/customers');
      customers = api.listFrom(data, ['customers','data']);
      customerSelect.innerHTML = '<option value="">Select a customer</option>' + customers.map((customer) =>
        '<option value="' + escapeHtml(api.getId(customer)) + '">' +
        escapeHtml(customer.name || 'Customer') + (customer.email ? ' · ' + escapeHtml(customer.email) : '') +
        '</option>'
      ).join('');
    } catch (error) {
      customers = [];
      customerSelect.innerHTML = '<option value="">Could not load customers</option>';
      showFeedback(checkoutFeedback, 'Could not load customers. You can register below. ' + error.message, 'error');
    }
    renderOrders();
    updatePlaceOrderState();
  }

  function syncBasketWithMenu() {
    if (!basket) return;
    const current = menuItems.find((item) => String(api.getId(item)) === String(basket.id));
    if (!current || Number(current.stock_quantity) <= 0) {
      basket = null;
      showFeedback(cartFeedback, 'That dish is no longer available and was removed from your order.', 'error');
    } else {
      basket.title = current.title;
      basket.price = Number(current.price);
      basket.stock = Number(current.stock_quantity);
      basket.quantity = Math.min(basket.quantity, basket.stock);
    }
    renderBasket();
  }

  function renderBasket() {
    const hasItem = Boolean(basket);
    $('#cart-empty').hidden = hasItem;
    $('#cart-item').hidden = !hasItem;
    $('#cart-summary').hidden = !hasItem;
    if (hasItem) {
      $('#cart-image').dataset.fallback = '';
      $('#cart-image').src = api.illustrationForTitle(basket.title);
      $('#cart-image').alt = basket.title;
      $('#cart-item-title').textContent = basket.title;
      $('#cart-item-price').textContent = api.money(basket.price) + ' each';
      $('#cart-stock').textContent = basket.stock + ' available';
      quantityInput.value = String(basket.quantity);
      quantityInput.max = String(basket.stock);
      $('#cart-total').textContent = api.money(basket.price * basket.quantity);
    }
    const count = hasItem ? basket.quantity : 0;
    $('#cart-count').textContent = String(count);
    $('#cart-toggle').setAttribute('aria-label', 'Open your order' + (hasItem ? ', ' + count + (count === 1 ? ' item' : ' items') : ''));
    $('#checkout-button').disabled = !hasItem || busy;
    syncAddButtons();
    updatePlaceOrderState();
  }

  function syncAddButtons() {
    menuGrid.querySelectorAll('[data-add-item]').forEach((button) => {
      const item = menuItems.find((entry) => String(api.getId(entry)) === String(button.dataset.addItem));
      if (!item) return;
      const stock = Number(item.stock_quantity);
      const available = Number.isFinite(stock) && stock > 0;
      const selected = available && basket && String(basket.id) === String(api.getId(item));
      button.disabled = !available;
      button.classList.toggle('in-cart', Boolean(selected));
      button.innerHTML = (selected ? 'In cart · ' + basket.quantity : available ? 'Add to order' : 'Sold out') +
        '<span class="add-button-icon" aria-hidden="true">' + (selected ? '✓' : '+') + '</span>';
      button.setAttribute('aria-label', selected
        ? item.title + ', in your cart: ' + basket.quantity + '. Add one more.'
        : available ? 'Add ' + item.title + ' to your order' : item.title + ', sold out');
    });
  }

  function updatePlaceOrderState() {
    const quantity = basket ? Number(basket.quantity) : 0;
    placeOrderButton.disabled = busy || !basket || !customerSelect.value ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > Number(basket && basket.stock);
  }

  function setQuantity(value) {
    if (!basket) return;
    const max = Math.max(1, Number(basket.stock) || 1);
    const parsed = Number.parseInt(value, 10);
    basket.quantity = Math.min(max, Math.max(1, Number.isFinite(parsed) ? parsed : 1));
    renderBasket();
  }

  function addToOrder(rawId) {
    const item = menuItems.find((entry) => String(api.getId(entry)) === String(rawId));
    if (!item || Number(item.stock_quantity) <= 0) return;
    const id = api.getId(item);
    if (basket && String(basket.id) !== String(id)) {
      basket = {id, title:item.title, price:Number(item.price), stock:Number(item.stock_quantity), quantity:1};
      showFeedback(cartFeedback, item.title + ' added to your order. Your previous dish was replaced.');
    } else if (basket) {
      basket.stock = Number(item.stock_quantity);
      basket.quantity = Math.min(basket.stock, basket.quantity + 1);
      showFeedback(cartFeedback, basket.quantity === basket.stock
        ? item.title + ' · ' + basket.quantity + ' in your order (maximum available).'
        : item.title + ' · ' + basket.quantity + ' in your order.');
    } else {
      basket = {id, title:item.title, price:Number(item.price), stock:Number(item.stock_quantity), quantity:1};
      showFeedback(cartFeedback, item.title + ' added to your order.');
    }
    result.hidden = true;
    checkoutPanel.hidden = true;
    renderBasket();
  }

  function openDrawer() {
    lastFocus = document.activeElement;
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.hidden = false;
    document.body.classList.add('drawer-open');
    $('#cart-close').focus();
  }

  function closeDrawer() {
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.hidden = true;
    document.body.classList.remove('drawer-open');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  function openCheckout() {
    checkoutPanel.hidden = false;
    result.hidden = true;
    checkoutPanel.scrollIntoView({behavior:'smooth', block:'nearest'});
    updatePlaceOrderState();
  }

  async function registerCustomer(event) {
    event.preventDefault();
    showFeedback(checkoutFeedback, '');
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const body = {
      name:$('#customer-name').value.trim(),
      email:$('#customer-email').value.trim()
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      showFeedback(checkoutFeedback, 'Enter a valid email address.', 'error');
      return;
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Registering…';
    try {
      let response;
      try {
        response = await api.request('/customers', {method:'POST', body:JSON.stringify(body)});
      } catch (error) {
        await loadCustomers();
        const existing = customers.find((customer) => String(customer.email).toLowerCase() === body.email.toLowerCase());
        if (!existing) throw error;
        response = existing;
      }
      let customer = response && (response.customer ?? response.data ?? response);
      let customerId = api.getId(customer);
      await loadCustomers();
      if (customerId == null) {
        customer = customers.find((entry) => String(entry.email).toLowerCase() === body.email.toLowerCase());
        customerId = api.getId(customer);
      }
      if (customerId == null) throw new Error('Registration did not provide a customer ID. Check the backend response.');
      customerSelect.value = String(customerId);
      form.reset();
      $('#register-details').open = false;
      showFeedback(checkoutFeedback, (customer.name || body.name) + ' is selected.');
      updatePlaceOrderState();
    } catch (error) {
      showFeedback(checkoutFeedback, error.message, 'error');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Register customer';
    }
  }

  async function placeOrder() {
    showFeedback(checkoutFeedback, '');
    if (!basket) return showFeedback(checkoutFeedback, 'Add a dish before checkout.', 'error');
    if (!customerSelect.value) return showFeedback(checkoutFeedback, 'Select or register a customer.', 'error');
    if (!Number.isInteger(Number(basket.quantity)) || basket.quantity < 1) return showFeedback(checkoutFeedback, 'Quantity must be a positive whole number.', 'error');
    if (basket.quantity > basket.stock) return showFeedback(checkoutFeedback, 'That quantity is higher than current stock.', 'error');

    busy = true;
    renderBasket();
    placeOrderButton.textContent = 'Sending order…';
    try {
      const data = await api.request('/orders', {
        method:'POST',
        body:JSON.stringify({
          customer_id:Number(customerSelect.value),
          menu_item_id:Number(basket.id),
          quantity:Number(basket.quantity)
        })
      });
      const order = data && (data.order ?? data.data ?? data);
      currentOrderId = order && (order.id ?? order.order_id ?? order.orderId);
      if (currentOrderId === '') currentOrderId = null;
      const status = order && order.status;
      const details = [];
      if (currentOrderId != null) details.push('Order ID: ' + escapeHtml(currentOrderId));
      if (status) details.push('Status: ' + escapeHtml(status));
      result.className = 'order-result success';
      result.innerHTML = '<strong>' + (api.demoMode ? 'Preview order placed' : 'Order placed') + '.</strong>' +
        (details.length ? '<span>' + details.join(' · ') + '</span>' : '') +
        (api.demoMode ? '<span>Preview only; not saved to the backend.</span>' : '') +
        (currentOrderId != null ? '<button id="cancel-order" class="text-button cancel-link" type="button">Cancel this order</button>' : '');
      result.hidden = false;
      basket = null;
      showFeedback(cartFeedback, '');
      await loadMenu();
      await loadOrders();
    } catch (error) {
      showFeedback(checkoutFeedback, 'Could not place the order. ' + error.message, 'error');
    } finally {
      busy = false;
      placeOrderButton.innerHTML = 'Place Order <span aria-hidden="true">→</span>';
      renderBasket();
    }
  }

  async function cancelOrder() {
    if (currentOrderId == null || !window.confirm('Cancel order ' + currentOrderId + '?')) return;
    const button = $('#cancel-order');
    if (button) button.disabled = true;
    try {
      await api.request('/orders/' + encodeURIComponent(currentOrderId), {method:'DELETE'});
      currentOrderId = null;
      result.className = 'order-result success';
      result.innerHTML = '<strong>Order cancelled.</strong>';
      await loadMenu();
      await loadOrders();
    } catch (error) {
      result.className = 'order-result error';
      result.insertAdjacentHTML('beforeend', '<span>' + escapeHtml(error.message) + '</span>');
      if (button) button.disabled = false;
    }
  }

  menuGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-item]');
    if (button) addToOrder(button.dataset.addItem);
  });
  menuGrid.addEventListener('error', (event) => {
    const image = event.target;
    if (image.matches('[data-food-photo]') && !image.dataset.fallback) {
      image.dataset.fallback = 'true';
      image.src = '/assets/food-fallback.svg';
    }
  }, true);
  $('#cart-image').addEventListener('error', (event) => {
    const image = event.currentTarget;
    if (!image.dataset.fallback) {
      image.dataset.fallback = 'true';
      image.src = '/assets/food-fallback.svg';
    }
  });  $('#cart-toggle').addEventListener('click', openDrawer);
  $('#cart-close').addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  $('#browse-menu').addEventListener('click', () => {
    closeDrawer();
    $('#menu').scrollIntoView({behavior:'smooth'});
  });
  $('#checkout-button').addEventListener('click', openCheckout);
  $('#refresh-orders').addEventListener('click', loadOrders);
  $('#cart-remove').addEventListener('click', () => {
    basket = null;
    showFeedback(cartFeedback, 'Dish removed from your order.');
    checkoutPanel.hidden = true;
    renderBasket();
  });
  document.querySelectorAll('[data-cart-step]').forEach((button) => {
    button.addEventListener('click', () => setQuantity(Number(quantityInput.value || 1) + Number(button.dataset.cartStep)));
  });
  quantityInput.addEventListener('input', () => setQuantity(quantityInput.value));
  customerSelect.addEventListener('change', updatePlaceOrderState);
  $('#customer-form').addEventListener('submit', registerCustomer);
  placeOrderButton.addEventListener('click', placeOrder);
  result.addEventListener('click', (event) => {
    if (event.target.id === 'cancel-order') cancelOrder();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !drawer.hidden) closeDrawer();
  });

  renderBasket();
  loadMenu();
  loadCustomers();
  loadOrders();
})();
