(() => {
  'use strict';
  const DEMO_MODE = new URLSearchParams(window.location.search).get('demo') === '1';
  const API_PREFIX = '/api';
  const STORAGE_KEY = 'oliva-preview-v2';

  function initialDemoState() {
    return {
      menu: [
        {id:1,title:'Margherita Pizza',price:185,stock_quantity:8},
        {id:2,title:'Penne Arrabbiata',price:165,stock_quantity:6},
        {id:3,title:'Creamy Alfredo Pasta',price:210,stock_quantity:4},
        {id:4,title:'Garlic Bread',price:75,stock_quantity:0},
        {id:5,title:'Lasagna della Casa',price:225,stock_quantity:3},
        {id:6,title:'Tiramisu',price:120,stock_quantity:5}
      ],
      customers:[{id:1,name:'Sofia Rossi',email:'sofia@example.com'}],
      orders:[],
      nextMenuId:7,
      nextCustomerId:2,
      nextOrderId:1001
    };
  }

  let volatileState = initialDemoState();
  function readDemoState() {
    try {
      const saved = window.sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.menu) && Array.isArray(parsed.customers) && Array.isArray(parsed.orders)) return parsed;
      }
    } catch (_) {}
    return volatileState;
  }
  function writeDemoState(state) {
    volatileState = state;
    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function getId(record) {
    return record && (record.id ?? record.customer_id ?? record.menu_item_id);
  }

  function listFrom(data, keys) {
    if (Array.isArray(data)) return data;
    for (const key of keys) {
      if (Array.isArray(data && data[key])) return data[key];
    }
    return [];
  }

  function money(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 'Price unavailable';
    return new Intl.NumberFormat('en-EG', {
      style:'currency', currency:'EGP', maximumFractionDigits:2
    }).format(amount);
  }

  function kindForTitle(title) {
    const name = String(title || '').toLowerCase();
    if (/pizza/.test(name)) return 'pizza';
    if (/rice|risotto/.test(name)) return 'rice';
    if (/panna\s*cotta|pudding|custard/.test(name)) return 'pudding';
    if (/pasta|penne|spaghetti|alfredo|arrabbiata|fettuccine/.test(name)) return 'pasta';
    if (/lasagna/.test(name)) return 'lasagna';
    if (/bread|bruschetta|garlic/.test(name)) return 'bread';
    if (/tiramisu|dessert|cake|gelato/.test(name)) return 'dessert';
    return 'other';
  }

  function illustrationForTitle(title) {
    const kind = kindForTitle(title);
    return kind === 'other' ? '/assets/food-fallback.svg' : '/assets/dish-' + kind + '.svg';
  }

  async function demoRequest(path, options) {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : {};
    const state = readDemoState();

    if (path === '/menu' && method === 'GET') return state.menu.map((item) => ({...item}));
    if (path === '/menu' && method === 'POST') {
      const item = {id:state.nextMenuId++, ...body};
      state.menu.push(item);
      writeDemoState(state);
      return {...item};
    }
    let match = path.match(/^\/menu\/([^/]+)$/);
    if (match && method === 'DELETE') {
      state.menu = state.menu.filter((item) => String(item.id) !== match[1]);
      writeDemoState(state);
      return {message:'Preview item removed'};
    }
    if (path === '/customers' && method === 'GET') return state.customers.map((customer) => ({...customer}));
    if (path === '/customers' && method === 'POST') {
      const duplicate = state.customers.some((customer) => customer.email.toLowerCase() === String(body.email).toLowerCase());
      if (duplicate) throw new Error('A customer with this email is already registered.');
      const customer = {id:state.nextCustomerId++, ...body};
      state.customers.push(customer);
      writeDemoState(state);
      return {...customer};
    }
    if (path === '/orders' && method === 'GET') return state.orders.map((order) => ({...order}));
    if (path === '/orders' && method === 'POST') {
      const menuItem = state.menu.find((item) => String(item.id) === String(body.menu_item_id));
      if (!menuItem || menuItem.stock_quantity < body.quantity) throw new Error('There is not enough stock for this quantity.');
      menuItem.stock_quantity -= body.quantity;
      const order = {id:state.nextOrderId++, customer_id:body.customer_id, status:'pending', menu_item_id:menuItem.id, quantity:body.quantity};
      state.orders.push(order);
      writeDemoState(state);
      return {id:order.id,status:order.status};
    }
    match = path.match(/^\/orders\/([^/]+)$/);
    if (match && method === 'DELETE') {
      const order = state.orders.find((entry) => String(entry.id) === match[1]);
      if (!order) throw new Error('Preview order was not found.');
      if (order.status === 'cancelled') return {id:order.id,status:'cancelled',message:'Preview order was already cancelled'};
      if (order.status === 'completed') throw new Error('A completed order cannot be cancelled.');
      order.status = 'cancelled';
      const item = state.menu.find((entry) => String(entry.id) === String(order.menu_item_id));
      if (item) item.stock_quantity += order.quantity;
      writeDemoState(state);
      return {id:order.id,status:order.status,message:'Preview order cancelled and stock restored'};
    }
    throw new Error('Preview does not support ' + method + ' ' + path);
  }

  async function request(path, options) {
    const opts = options || {};
    if (DEMO_MODE) return demoRequest(path,opts);
    const method = (opts.method || 'GET').toUpperCase();
    const retryDelays = method === 'GET' ? [1000, 2000, 3000] : [];
    const requestOptions = {
      ...opts,
      headers:{
        ...(opts.body ? {'Content-Type':'application/json'} : {}),
        ...opts.headers
      }
    };
    let response;
    for (let attempt = 0; ; attempt += 1) {
      try {
        response = await fetch(API_PREFIX + path, requestOptions);
        if (!([502, 503, 504].includes(response.status) && attempt < retryDelays.length)) break;
      } catch (_) {
        if (attempt >= retryDelays.length) {
          throw new Error(method === 'GET'
            ? 'The server is unavailable. Please try again.'
            : 'Connection lost. Check whether your action succeeded before trying again.');
        }
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
    }
    const raw = await response.text();
    let data = null;
    if (raw) {
      try { data = JSON.parse(raw); }
      catch (_) {
        data = {detail: /^\s*</.test(raw) ? 'The server is temporarily unavailable. Please try again.' : raw};
      }
    }
    if (!response.ok) {
      const detail = data && (data.detail ?? data.message ?? data.error);
      const message = Array.isArray(detail)
        ? detail.map((item) => item.msg || JSON.stringify(item)).join(', ')
        : (detail || 'Request failed (' + response.status + ')');
      throw new Error(message);
    }
    return data;
  }

  window.OlivaApi = {demoMode:DEMO_MODE, request, getId, listFrom, money, illustrationForTitle, kindForTitle};
})();
