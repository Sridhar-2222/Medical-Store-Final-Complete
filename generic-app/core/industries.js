/*
 * Industry presets for BizCore.
 *
 * Every business shares the same core: a catalogue of things it sells
 * (products and/or services), stock, customers, suppliers, sales/billing,
 * purchases, payments & dues, expenses, staff, appointments and reports.
 * A preset only changes vocabulary, which modules are switched on, extra
 * fields per item, default categories/tax and some sample data.
 *
 * UMD: works with require() in Node and as a <script> in the browser.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BizIndustries = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ALL_MODULES = ['dashboard', 'pos', 'sales', 'items', 'purchases', 'customers', 'suppliers',
    'expenses', 'appointments', 'staff', 'reports', 'settings', 'data'];

  // Modules every preset gets unless it removes them.
  var BASE = ['dashboard', 'pos', 'sales', 'items', 'purchases', 'customers', 'suppliers',
    'expenses', 'staff', 'reports', 'settings', 'data'];

  function withModules(add, remove) {
    var list = BASE.concat(add || []);
    return ALL_MODULES.filter(function (m) { return list.indexOf(m) >= 0 && (remove || []).indexOf(m) < 0; });
  }

  var PRESETS = {
    generic: {
      name: 'General Business', icon: '🏪',
      labels: { item: 'Item', items: 'Items', customer: 'Customer', customers: 'Customers', sale: 'Invoice' },
      modules: withModules(['appointments']),
      flags: { batch: false, expiry: false, services: true },
      categories: ['General', 'Services'], units: ['pcs', 'kg', 'litre', 'box', 'hour'],
      taxRate: 0, itemFields: [],
      expenseCategories: ['Rent', 'Salary', 'Electricity', 'Transport', 'Maintenance', 'Other'],
      samples: [
        { name: 'Sample Product', category: 'General', price: 100, cost: 70, stock: 20, unit: 'pcs' },
        { name: 'Sample Service', category: 'Services', price: 500, cost: 0, isService: true, durationMin: 60 }
      ]
    },
    pharmacy: {
      name: 'Pharmacy / Medical Store', icon: '💊',
      labels: { item: 'Medicine', items: 'Medicines', customer: 'Patient', customers: 'Patients', sale: 'Bill' },
      modules: withModules([]),
      flags: { batch: true, expiry: true, services: false },
      categories: ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Surgical', 'OTC / FMCG'],
      units: ['strip', 'bottle', 'tube', 'vial', 'box', 'pcs'],
      taxRate: 12,
      itemFields: [
        { key: 'manufacturer', label: 'Manufacturer', type: 'text' },
        { key: 'composition', label: 'Composition / Salt', type: 'text' },
        { key: 'hsn', label: 'HSN code', type: 'text' },
        { key: 'rack', label: 'Rack / Shelf', type: 'text' },
        { key: 'rxRequired', label: 'Prescription required', type: 'checkbox' }
      ],
      expenseCategories: ['Rent', 'Salary', 'Electricity', 'Cold storage', 'Delivery', 'Licence fees', 'Other'],
      samples: [
        { name: 'Paracetamol 500mg', category: 'Tablet', unit: 'strip', price: 30, cost: 22, stock: 120, batch: 'PCM2401', expiryDays: 400, custom: { manufacturer: 'Generic Pharma', composition: 'Paracetamol 500mg' } },
        { name: 'Cough Syrup 100ml', category: 'Syrup', unit: 'bottle', price: 95, cost: 70, stock: 8, batch: 'CS1102', expiryDays: 45, custom: { rxRequired: false } },
        { name: 'Amoxicillin 250mg', category: 'Capsule', unit: 'strip', price: 85, cost: 60, stock: 40, batch: 'AMX778', expiryDays: 200, custom: { rxRequired: true } }
      ]
    },
    grocery: {
      name: 'Grocery / Supermarket', icon: '🛒',
      labels: { item: 'Product', items: 'Products', customer: 'Customer', customers: 'Customers', sale: 'Bill' },
      modules: withModules([]),
      flags: { batch: false, expiry: true, services: false },
      categories: ['Staples', 'Dairy', 'Beverages', 'Snacks', 'Personal care', 'Household', 'Fruits & Veg'],
      units: ['pcs', 'kg', 'g', 'litre', 'ml', 'pack', 'dozen'],
      taxRate: 5,
      itemFields: [
        { key: 'brand', label: 'Brand', type: 'text' },
        { key: 'mrp', label: 'MRP', type: 'number' },
        { key: 'shelf', label: 'Aisle / Shelf', type: 'text' }
      ],
      expenseCategories: ['Rent', 'Salary', 'Electricity', 'Wastage', 'Delivery', 'Other'],
      samples: [
        { name: 'Rice 5kg', category: 'Staples', unit: 'pack', price: 350, cost: 300, stock: 30, barcode: '8900000000011' },
        { name: 'Milk 1L', category: 'Dairy', unit: 'pcs', price: 60, cost: 52, stock: 6, expiryDays: 3 },
        { name: 'Biscuits', category: 'Snacks', unit: 'pack', price: 20, cost: 15, stock: 100, barcode: '8900000000028' }
      ]
    },
    restaurant: {
      name: 'Restaurant / Café', icon: '🍽️',
      labels: { item: 'Menu item', items: 'Menu', customer: 'Guest', customers: 'Guests', sale: 'Order' },
      modules: withModules(['appointments']),
      flags: { batch: false, expiry: false, services: true },
      categories: ['Starters', 'Main course', 'Breads', 'Rice', 'Desserts', 'Beverages', 'Raw material'],
      units: ['plate', 'pcs', 'glass', 'kg', 'litre'],
      taxRate: 5,
      itemFields: [
        { key: 'foodType', label: 'Food type', type: 'select', options: ['Veg', 'Non-veg', 'Egg', 'Vegan'] },
        { key: 'kitchenSection', label: 'Kitchen section', type: 'text' },
        { key: 'spicy', label: 'Spicy', type: 'checkbox' }
      ],
      expenseCategories: ['Rent', 'Salary', 'Gas', 'Electricity', 'Groceries', 'Packaging', 'Other'],
      samples: [
        { name: 'Veg Biryani', category: 'Rice', unit: 'plate', price: 180, cost: 70, isService: true, custom: { foodType: 'Veg' } },
        { name: 'Masala Tea', category: 'Beverages', unit: 'glass', price: 25, cost: 8, isService: true, custom: { foodType: 'Veg' } },
        { name: 'Cooking Oil', category: 'Raw material', unit: 'litre', price: 0, cost: 140, stock: 15 }
      ],
      appointmentLabel: 'Table reservation'
    },
    salon: {
      name: 'Salon / Spa / Beauty', icon: '💇',
      labels: { item: 'Service / Product', items: 'Services & Products', customer: 'Client', customers: 'Clients', sale: 'Invoice' },
      modules: withModules(['appointments']),
      flags: { batch: false, expiry: true, services: true },
      categories: ['Hair', 'Skin', 'Nails', 'Spa', 'Retail products'],
      units: ['session', 'pcs', 'ml'],
      taxRate: 18,
      itemFields: [{ key: 'gender', label: 'For', type: 'select', options: ['Unisex', 'Women', 'Men', 'Kids'] }],
      expenseCategories: ['Rent', 'Salary', 'Commission', 'Electricity', 'Consumables', 'Other'],
      samples: [
        { name: 'Haircut', category: 'Hair', price: 300, isService: true, durationMin: 30 },
        { name: 'Facial', category: 'Skin', price: 1200, isService: true, durationMin: 60 },
        { name: 'Shampoo 200ml', category: 'Retail products', unit: 'pcs', price: 450, cost: 300, stock: 12 }
      ],
      appointmentLabel: 'Appointment'
    },
    clinic: {
      name: 'Clinic / Diagnostic / Dental', icon: '🩺',
      labels: { item: 'Service', items: 'Services & Supplies', customer: 'Patient', customers: 'Patients', sale: 'Bill' },
      modules: withModules(['appointments']),
      flags: { batch: true, expiry: true, services: true },
      categories: ['Consultation', 'Procedure', 'Lab test', 'Medicine', 'Consumables'],
      units: ['visit', 'test', 'pcs', 'strip'],
      taxRate: 0,
      itemFields: [{ key: 'department', label: 'Department', type: 'text' }],
      expenseCategories: ['Rent', 'Salary', 'Equipment', 'Consumables', 'Lab outsourcing', 'Other'],
      samples: [
        { name: 'General Consultation', category: 'Consultation', price: 500, isService: true, durationMin: 15 },
        { name: 'Blood Sugar Test', category: 'Lab test', price: 150, cost: 40, isService: true, durationMin: 10 },
        { name: 'Gloves (box)', category: 'Consumables', unit: 'pcs', price: 0, cost: 250, stock: 5 }
      ],
      appointmentLabel: 'Appointment'
    },
    apparel: {
      name: 'Clothing / Footwear / Fashion', icon: '👗',
      labels: { item: 'Product', items: 'Products', customer: 'Customer', customers: 'Customers', sale: 'Invoice' },
      modules: withModules([]),
      flags: { batch: false, expiry: false, services: false },
      categories: ['Men', 'Women', 'Kids', 'Footwear', 'Accessories'],
      units: ['pcs', 'pair', 'set'],
      taxRate: 5,
      itemFields: [
        { key: 'size', label: 'Size', type: 'text' },
        { key: 'color', label: 'Colour', type: 'text' },
        { key: 'brand', label: 'Brand', type: 'text' },
        { key: 'material', label: 'Material', type: 'text' }
      ],
      expenseCategories: ['Rent', 'Salary', 'Electricity', 'Alterations', 'Marketing', 'Other'],
      samples: [
        { name: 'Cotton Shirt', category: 'Men', unit: 'pcs', price: 899, cost: 500, stock: 25, custom: { size: 'M', color: 'Blue' } },
        { name: 'Sneakers', category: 'Footwear', unit: 'pair', price: 1999, cost: 1200, stock: 4, custom: { size: '9' } }
      ]
    },
    electronics: {
      name: 'Electronics / Mobile Shop', icon: '📱',
      labels: { item: 'Product', items: 'Products', customer: 'Customer', customers: 'Customers', sale: 'Invoice' },
      modules: withModules(['appointments']),
      flags: { batch: false, expiry: false, services: true },
      categories: ['Mobiles', 'Accessories', 'Appliances', 'Computers', 'Repairs'],
      units: ['pcs', 'set'],
      taxRate: 18,
      itemFields: [
        { key: 'brand', label: 'Brand', type: 'text' },
        { key: 'model', label: 'Model', type: 'text' },
        { key: 'serial', label: 'Serial / IMEI', type: 'text' },
        { key: 'warrantyMonths', label: 'Warranty (months)', type: 'number' }
      ],
      expenseCategories: ['Rent', 'Salary', 'Electricity', 'Spare parts', 'Other'],
      samples: [
        { name: 'USB-C Charger', category: 'Accessories', unit: 'pcs', price: 799, cost: 450, stock: 30, custom: { warrantyMonths: 6 } },
        { name: 'Screen Replacement', category: 'Repairs', price: 1500, cost: 800, isService: true, durationMin: 60 }
      ],
      appointmentLabel: 'Repair booking'
    },
    hardware: {
      name: 'Hardware / Building Material', icon: '🔧',
      labels: { item: 'Item', items: 'Items', customer: 'Customer', customers: 'Customers', sale: 'Invoice' },
      modules: withModules([]),
      flags: { batch: false, expiry: false, services: false },
      categories: ['Tools', 'Plumbing', 'Electrical', 'Paint', 'Cement & Steel', 'Fasteners'],
      units: ['pcs', 'kg', 'bag', 'metre', 'litre', 'box'],
      taxRate: 18,
      itemFields: [{ key: 'brand', label: 'Brand', type: 'text' }, { key: 'size', label: 'Size / Spec', type: 'text' }],
      expenseCategories: ['Rent', 'Salary', 'Transport', 'Loading', 'Electricity', 'Other'],
      samples: [
        { name: 'Cement 50kg', category: 'Cement & Steel', unit: 'bag', price: 420, cost: 380, stock: 60 },
        { name: 'PVC Pipe 1 inch', category: 'Plumbing', unit: 'metre', price: 60, cost: 40, stock: 200 }
      ]
    },
    bakery: {
      name: 'Bakery / Sweets', icon: '🥐',
      labels: { item: 'Product', items: 'Products', customer: 'Customer', customers: 'Customers', sale: 'Bill' },
      modules: withModules([]),
      flags: { batch: true, expiry: true, services: false },
      categories: ['Breads', 'Cakes', 'Sweets', 'Snacks', 'Beverages', 'Raw material'],
      units: ['pcs', 'kg', 'box', 'pack'],
      taxRate: 5,
      itemFields: [{ key: 'eggless', label: 'Eggless', type: 'checkbox' }],
      expenseCategories: ['Rent', 'Salary', 'Gas', 'Raw material', 'Packaging', 'Wastage', 'Other'],
      samples: [
        { name: 'Bread Loaf', category: 'Breads', unit: 'pcs', price: 45, cost: 25, stock: 20, expiryDays: 3 },
        { name: 'Chocolate Cake 1kg', category: 'Cakes', unit: 'pcs', price: 750, cost: 350, stock: 3, expiryDays: 2 }
      ]
    },
    auto: {
      name: 'Auto Service / Garage', icon: '🚗',
      labels: { item: 'Part / Service', items: 'Parts & Services', customer: 'Customer', customers: 'Customers', sale: 'Job invoice' },
      modules: withModules(['appointments']),
      flags: { batch: false, expiry: false, services: true },
      categories: ['Service', 'Spare parts', 'Oils & Lubricants', 'Tyres', 'Accessories'],
      units: ['pcs', 'litre', 'set', 'job'],
      taxRate: 18,
      itemFields: [{ key: 'partNo', label: 'Part number', type: 'text' }, { key: 'vehicle', label: 'Fits vehicle', type: 'text' }],
      expenseCategories: ['Rent', 'Salary', 'Tools', 'Electricity', 'Other'],
      samples: [
        { name: 'General Service', category: 'Service', price: 1500, isService: true, durationMin: 120 },
        { name: 'Engine Oil 1L', category: 'Oils & Lubricants', unit: 'litre', price: 450, cost: 320, stock: 24 }
      ],
      appointmentLabel: 'Service booking'
    },
    fitness: {
      name: 'Gym / Fitness / Classes', icon: '🏋️',
      labels: { item: 'Plan / Product', items: 'Plans & Products', customer: 'Member', customers: 'Members', sale: 'Receipt' },
      modules: withModules(['appointments'], ['purchases']),
      flags: { batch: false, expiry: true, services: true },
      categories: ['Membership', 'Personal training', 'Classes', 'Supplements', 'Merchandise'],
      units: ['month', 'session', 'pcs'],
      taxRate: 18,
      itemFields: [{ key: 'validityDays', label: 'Validity (days)', type: 'number' }],
      expenseCategories: ['Rent', 'Salary', 'Equipment', 'Electricity', 'Marketing', 'Other'],
      samples: [
        { name: 'Monthly Membership', category: 'Membership', price: 1500, isService: true, custom: { validityDays: 30 } },
        { name: 'Personal Training Session', category: 'Personal training', price: 500, isService: true, durationMin: 60 },
        { name: 'Whey Protein 1kg', category: 'Supplements', unit: 'pcs', price: 2500, cost: 1900, stock: 6, expiryDays: 300 }
      ],
      appointmentLabel: 'Session'
    },
    services: {
      name: 'Professional / Home Services', icon: '🧰',
      labels: { item: 'Service', items: 'Services', customer: 'Client', customers: 'Clients', sale: 'Invoice' },
      modules: withModules(['appointments'], ['purchases', 'suppliers']),
      flags: { batch: false, expiry: false, services: true },
      categories: ['Consulting', 'Repair', 'Installation', 'Cleaning', 'Materials'],
      units: ['hour', 'job', 'visit', 'pcs'],
      taxRate: 18,
      itemFields: [],
      expenseCategories: ['Travel', 'Salary', 'Tools', 'Software', 'Other'],
      samples: [
        { name: 'Consultation (1 hr)', category: 'Consulting', unit: 'hour', price: 1000, isService: true, durationMin: 60 },
        { name: 'Home Visit', category: 'Repair', unit: 'visit', price: 300, isService: true, durationMin: 45 }
      ],
      appointmentLabel: 'Booking'
    }
  };

  function get(key) { return PRESETS[key] || PRESETS.generic; }
  function list() {
    return Object.keys(PRESETS).map(function (k) { return { key: k, name: PRESETS[k].name, icon: PRESETS[k].icon }; });
  }

  return { PRESETS: PRESETS, ALL_MODULES: ALL_MODULES, get: get, list: list };
});
