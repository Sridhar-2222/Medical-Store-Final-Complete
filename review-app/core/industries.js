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

  // Review & insights screens (owner / reviewer view of department numbers).
  var REVIEW_MODULES = ['overview', 'daily', 'scan', 'stock', 'vault', 'entries', 'review', 'departments', 'guide'];
  var ALL_MODULES = REVIEW_MODULES.concat(['dashboard', 'pos', 'sales', 'items', 'purchases', 'customers', 'suppliers',
    'expenses', 'appointments', 'staff', 'reports', 'settings', 'data']);

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
      name: 'Garments / Clothing / Footwear', icon: '👗',
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
    hotel: {
      name: 'Hotel / Resort / Lodge', icon: '🏨',
      labels: { item: 'Service / Item', items: 'Services & Items', customer: 'Guest', customers: 'Guests', sale: 'Bill' },
      modules: withModules(['appointments']),
      flags: { batch: false, expiry: true, services: true },
      categories: ['Rooms', 'Food', 'Beverages', 'Banquet', 'Laundry', 'Stores'],
      units: ['night', 'plate', 'pcs', 'kg', 'litre'],
      taxRate: 12, itemFields: [],
      expenseCategories: ['Salary', 'Electricity', 'Gas', 'Linen', 'Maintenance', 'Groceries', 'Other'],
      samples: [
        { name: 'Deluxe Room (night)', category: 'Rooms', unit: 'night', price: 2500, isService: true },
        { name: 'Veg Thali', category: 'Food', unit: 'plate', price: 220, cost: 90, isService: true }
      ],
      appointmentLabel: 'Booking'
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


  /*
   * Review mode: each business is a set of departments that report sales, money
   * collected, expenses, purchases, goods received, wastage and miscellaneous
   * items. Cost categories carry a default fixed / variable type. receiptHints
   * help the receipt reader (OCR / AI) for that kind of business.
   */
  var F = 'fixed', V = 'variable';
  function cats(list) { return list.map(function (c) { return { name: c[0], type: c[1] }; }); }
  var COMMON_FIXED = [['Rent', F], ['Salaries', F], ['Loan / EMI', F], ['Licences & fees', F], ['Internet & phone', F], ['Insurance', F]];
  var REVIEW = {
    generic: { departments: ['Sales counter', 'Operations', 'Office'],
      costCategories: cats(COMMON_FIXED.concat([['Electricity', V], ['Raw material', V], ['Transport', V], ['Repairs', V], ['Packaging', V], ['Other', V]])),
      receiptHints: 'general business purchases and expenses' },
    pharmacy: { departments: ['Retail counter', 'Wholesale', 'Home delivery'],
      costCategories: cats(COMMON_FIXED.concat([['Medicine purchase', V], ['Surgical / OTC purchase', V], ['Electricity', V], ['Delivery', V], ['Expired / damaged stock', V], ['Other', V]])),
      receiptHints: 'medicine distributor invoices with batch, expiry, MRP, PTR/purchase rate, free quantity, GST' },
    grocery: { departments: ['Billing counter', 'Fresh produce', 'Dairy & bakery', 'Stores / godown'],
      costCategories: cats(COMMON_FIXED.concat([['Stock purchase', V], ['Vegetables & fruits', V], ['Electricity', V], ['Transport', V], ['Packaging', V], ['Other', V]])),
      receiptHints: 'wholesale grocery bills, vegetable mandi slips in kg, MRP and rate' },
    restaurant: { departments: ['Kitchen', 'Dining / service', 'Takeaway & delivery', 'Bar / beverages', 'Stores'],
      costCategories: cats(COMMON_FIXED.concat([['Vegetables', V], ['Meat & fish', V], ['Dairy', V], ['Groceries & oil', V], ['Gas', V], ['Packaging', V], ['Delivery commission', V], ['Electricity', V], ['Other', V]])),
      receiptHints: 'kitchen purchase slips for vegetables, meat, fish, dairy, groceries and gas, usually in kg or litres' },
    hotel: { departments: ['Front office / rooms', 'Restaurant', 'Bar', 'Banquet', 'Housekeeping', 'Laundry', 'Maintenance', 'Stores'],
      costCategories: cats(COMMON_FIXED.concat([['Food purchase', V], ['Beverages', V], ['Linen & amenities', V], ['Laundry', V], ['Gas', V], ['Electricity', V], ['Repairs & maintenance', V], ['OTA commission', V], ['Other', V]])),
      receiptHints: 'hotel purchase bills for food, beverages, linen, amenities, laundry and maintenance' },
    salon: { departments: ['Hair', 'Skin & spa', 'Nails', 'Retail products'],
      costCategories: cats(COMMON_FIXED.concat([['Products & consumables', V], ['Commission', V], ['Electricity', V], ['Laundry', V], ['Other', V]])),
      receiptHints: 'beauty product and consumable invoices' },
    clinic: { departments: ['OPD / consultation', 'Procedures', 'Lab', 'Pharmacy'],
      costCategories: cats(COMMON_FIXED.concat([['Medicines & consumables', V], ['Lab reagents', V], ['Outsourced tests', V], ['Electricity', V], ['Biomedical waste', V], ['Other', V]])),
      receiptHints: 'medical supplies, reagents and medicine invoices' },
    apparel: { departments: ['Showroom', 'Alterations', 'Online orders'],
      costCategories: cats(COMMON_FIXED.concat([['Stock purchase', V], ['Alteration charges', V], ['Packaging', V], ['Electricity', V], ['Marketing', V], ['Other', V]])),
      receiptHints: 'garment and footwear purchase invoices with sizes' },
    electronics: { departments: ['Sales', 'Service & repairs', 'Accessories'],
      costCategories: cats(COMMON_FIXED.concat([['Stock purchase', V], ['Spare parts', V], ['Electricity', V], ['Courier', V], ['Other', V]])),
      receiptHints: 'electronics and spare part invoices with model numbers' },
    hardware: { departments: ['Counter sales', 'Bulk / site orders', 'Godown'],
      costCategories: cats(COMMON_FIXED.concat([['Stock purchase', V], ['Loading & unloading', V], ['Transport', V], ['Electricity', V], ['Other', V]])),
      receiptHints: 'hardware, cement, steel, pipe and paint invoices' },
    bakery: { departments: ['Production', 'Counter sales', 'Orders & cakes'],
      costCategories: cats(COMMON_FIXED.concat([['Flour, sugar & raw material', V], ['Dairy & eggs', V], ['Gas', V], ['Packaging', V], ['Electricity', V], ['Other', V]])),
      receiptHints: 'bakery raw material bills (flour, sugar, butter, eggs, cream) in kg' },
    auto: { departments: ['Workshop', 'Spare parts counter', 'Washing'],
      costCategories: cats(COMMON_FIXED.concat([['Spare parts', V], ['Oils & lubricants', V], ['Outside work', V], ['Electricity', V], ['Other', V]])),
      receiptHints: 'spare parts and lubricant invoices with part numbers' },
    fitness: { departments: ['Memberships', 'Personal training', 'Supplements & shop'],
      costCategories: cats(COMMON_FIXED.concat([['Supplements stock', V], ['Equipment repair', V], ['Electricity', V], ['Marketing', V], ['Other', V]])),
      receiptHints: 'supplement and equipment invoices' },
    services: { departments: ['Field jobs', 'Office'],
      costCategories: cats(COMMON_FIXED.concat([['Materials', V], ['Travel', V], ['Tools', V], ['Software', V], ['Other', V]])),
      receiptHints: 'material, travel and tool bills' }
  };

  /*
   * Key numbers per business type, with a healthy range and what it means.
   * num / den pick entries: t = entry types, c = category pattern, d = department pattern.
   * Shown on Overview and Spot check, and flagged when outside the range.
   */
  function K(label, num, den, lo, hi, why) { return { label: label, num: num, den: den, lo: lo, hi: hi, why: why }; }
  var SALES = { t: ['sale'] }, BUY = { t: ['purchase'] }, WASTE = { t: ['wastage'] }, COLL = { t: ['collection'] }, EXP = { t: ['expense', 'misc'] };
  var KPIS = {
    generic: [K('Purchases as % of sales', BUY, SALES, 30, 65, 'How much of every sale goes back into buying stock or material.'),
      K('Wastage as % of purchases', WASTE, BUY, 0, 3, 'Money lost to spoiled, damaged or expired goods.'),
      K('Running expenses as % of sales', EXP, SALES, 0, 25, 'Rent, salaries, power and other costs against sales.')],
    pharmacy: [K('Purchases as % of sales', BUY, SALES, 70, 85, 'Below 70% may mean missing purchase bills; above 85% means thin margins (healthy margin is 15–25%).'),
      K('Expired / damaged as % of purchases', WASTE, BUY, 0, 1.5, 'Above 1.5% means slow movers are being over-bought or expiry returns are not claimed.'),
      K('Collected as % of sales', COLL, SALES, 95, 100, 'Below 95% means too much credit to patients or unrecorded cash.'),
      K('Delivery costs as % of delivery sales', { t: ['expense'], c: /deliver|courier|fuel/i }, { t: ['sale'], d: /deliver/i }, 0, 6, 'Home delivery should cost under 6% of what it sells.')],
    grocery: [K('Purchases as % of sales', BUY, SALES, 78, 90, 'Grocery margins are thin (10–22%); outside this range check pricing or missing bills.'),
      K('Fresh produce wastage', { t: ['wastage'], d: /fresh|produce|veg|fruit/i }, { t: ['purchase'], d: /fresh|produce|veg|fruit/i }, 0, 5, 'Vegetables and fruit lost to spoilage; above 5% means over-buying.'),
      K('Collected as % of sales', COLL, SALES, 97, 100, 'Billing counters should collect almost everything the same day.')],
    restaurant: [K('Food cost (purchases as % of sales)', BUY, SALES, 28, 35, 'The single most watched number in a restaurant. Above 35%: prices too low, portions too big, waste or pilferage.'),
      K('Beverage cost of the bar', { t: ['purchase'], d: /bar|beverage/i }, { t: ['sale'], d: /bar|beverage/i }, 18, 25, 'Bar purchases against bar sales; high values point to free pours or missing bills.'),
      K('Wastage as % of purchases', WASTE, BUY, 0, 4, 'Kitchen waste above 4% needs a look at prep quantities and storage.'),
      K('Gas & power as % of sales', { t: ['expense'], c: /gas|electric/i }, SALES, 0, 6, 'Energy over 6% of sales often means equipment left running.'),
      K('Delivery app commission', { t: ['expense'], c: /commission/i }, { t: ['sale'], d: /takeaway|delivery/i }, 0, 22, 'Aggregator commission against delivery sales.')],
    hotel: [K('F&B cost (food & beverage purchases vs F&B sales)', { t: ['purchase'], c: /food|bever|vegetable|meat|dairy|grocer/i }, { t: ['sale'], d: /restaurant|bar|banquet|kitchen/i }, 28, 36, 'Restaurant, bar and banquet purchases against their sales.'),
      K('OTA commission as % of room sales', { t: ['expense'], c: /ota|commission/i }, { t: ['sale'], d: /front|room/i }, 0, 18, 'Booking-site commission; push direct bookings when this is high.'),
      K('Linen, laundry & amenities vs room sales', { t: ['expense', 'purchase'], c: /linen|laundry|amenit/i }, { t: ['sale'], d: /front|room/i }, 0, 8, 'Housekeeping consumables per rupee of room revenue.'),
      K('Energy as % of all sales', { t: ['expense'], c: /electric|gas|power|diesel/i }, SALES, 0, 9, 'Power and fuel; check AC and lights in empty rooms when high.'),
      K('Wastage as % of purchases', WASTE, BUY, 0, 4, 'Kitchen and banquet leftovers and spoilage.')],
    salon: [K('Products & consumables as % of sales', { t: ['purchase', 'expense'], c: /product|consumable/i }, SALES, 6, 15, 'Product used per rupee of service; high values suggest over-use or pilferage.'),
      K('Staff commission as % of sales', { t: ['expense'], c: /commission/i }, SALES, 0, 30, 'Commission above 30% squeezes the margin.'),
      K('Retail products share of sales', { t: ['sale'], d: /retail/i }, SALES, 8, 100, 'Selling take-home products is easy extra margin; aim above 8%.')],
    clinic: [K('Medicines & consumables as % of sales', { t: ['purchase', 'expense'], c: /medicine|consumable|reagent/i }, SALES, 0, 22, 'Supplies used per rupee billed.'),
      K('Outsourced tests as % of lab sales', { t: ['expense'], c: /outsourc/i }, { t: ['sale'], d: /lab/i }, 0, 45, 'If high, consider doing more tests in-house.'),
      K('Collected as % of billed', COLL, SALES, 95, 100, 'Unpaid bills and insurance pending.')],
    apparel: [K('Purchases as % of sales', BUY, SALES, 45, 65, 'Clothing usually earns 35–55%; high values mean heavy discounting.'),
      K('Alterations as % of sales', { t: ['expense'], c: /alter/i }, SALES, 0, 3, 'Free alterations add up.'),
      K('Marketing as % of sales', { t: ['expense'], c: /market/i }, SALES, 0, 6, 'Spend on ads and promotions.')],
    electronics: [K('Purchases as % of sales', BUY, SALES, 78, 92, 'Electronics margins are thin; check pricing when above 92%.'),
      K('Service & repair share of sales', { t: ['sale'], d: /service|repair/i }, SALES, 10, 100, 'Repairs earn far better margins than products; grow this.'),
      K('Spare parts as % of service sales', { t: ['purchase', 'expense'], c: /spare/i }, { t: ['sale'], d: /service|repair/i }, 0, 50, 'Parts cost per rupee of repair billing.')],
    hardware: [K('Purchases as % of sales', BUY, SALES, 78, 90, 'Typical hardware margin is 10–22%.'),
      K('Loading & transport as % of sales', { t: ['expense'], c: /load|transport/i }, SALES, 0, 3, 'Free delivery to sites eats margin.'),
      K('Collected as % of sales', COLL, SALES, 90, 100, 'Contractor credit is common; below 90% needs follow-up.')],
    bakery: [K('Raw material as % of sales', { t: ['purchase'] }, SALES, 25, 38, 'Flour, sugar, dairy and eggs against sales.'),
      K('Unsold / wasted as % of purchases', WASTE, BUY, 0, 5, 'Bake to demand; above 5% means over-production.'),
      K('Packaging as % of sales', { t: ['expense', 'purchase'], c: /packag/i }, SALES, 0, 4, 'Boxes and bags per rupee sold.')],
    auto: [K('Parts as % of sales', { t: ['purchase'], c: /spare|part|oil|lubric/i }, SALES, 35, 60, 'Parts against total billing; labour should make up the rest.'),
      K('Outside work as % of sales', { t: ['expense'], c: /outside/i }, SALES, 0, 10, 'Work sent to other garages.'),
      K('Collected as % of sales', COLL, SALES, 95, 100, 'Vehicles should not leave unpaid.')],
    fitness: [K('Collected as % of sales', COLL, SALES, 97, 100, 'Memberships should be paid upfront.'),
      K('Supplements cost vs shop sales', { t: ['purchase'], c: /supplement/i }, { t: ['sale'], d: /supplement|shop/i }, 55, 75, 'Margin on supplements and merchandise.'),
      K('Marketing as % of sales', { t: ['expense'], c: /market/i }, SALES, 0, 8, 'Spend to get new members.')],
    services: [K('Materials as % of sales', { t: ['purchase', 'expense'], c: /material/i }, SALES, 0, 30, 'Material cost per rupee billed.'),
      K('Travel as % of sales', { t: ['expense'], c: /travel|fuel/i }, SALES, 0, 10, 'Travel to jobs; club nearby jobs when high.'),
      K('Collected as % of sales', COLL, SALES, 90, 100, 'Unpaid jobs.')],
  };

  /*
   * Guide per business type: who is involved, what to capture, what the owner
   * learns, and what the owner can offer customers.
   */
  function G(o) { return o; }
  var PLAYBOOK = {
    generic: G({ photos: ['Supplier bills', 'Expense vouchers', 'Stock count sheet'], inputs: ['Daily sales and collections per counter', 'Expenses with fixed or variable', 'Wastage and miscellaneous'],
      owner: ['Profit estimate every day without an accountant', 'Collections shortfall by counter and day', 'Fixed vs variable cost split to plan pricing'],
      customers: ['Bills and payment reminders on WhatsApp', 'Consistent pricing because purchase price rises are caught early'] }),
    pharmacy: G({ photos: ['Distributor invoices (batch, expiry, PTR, free qty)', 'Expiry / breakage return slips', 'Monthly stock count sheet'],
      inputs: ['Counter, wholesale and delivery sales', 'Cash / UPI / card collections and patient credit', 'Expired and damaged stock as wastage', 'Issues to the delivery boy or branch as supply'],
      owner: ['Margin per day and per department (15–25% is healthy)', 'Distributor rate rises and cheaper distributors for the same medicine', 'Short supply: billed vs received strips', 'Expiry loss trend and stock missing from the shelf'],
      customers: ['Bill on WhatsApp for every patient', 'Refill and payment reminders on WhatsApp', 'Fresher stock with fewer near-expiry medicines', 'Faster service because popular medicines are not out of stock'] }),
    grocery: G({ photos: ['Wholesale and mandi bills', 'Delivery challans', 'Fresh produce wastage sheet', 'Weekly stock count'],
      inputs: ['Counter sales and collections', 'Fresh produce purchases and wastage separately', 'Godown issues to the shop floor'],
      owner: ['Margin by department (staples vs fresh vs dairy)', 'Mandi price rises day to day', 'Shrinkage: stock missing between godown and counter'],
      customers: ['WhatsApp bills and home-delivery orders', 'Fresher vegetables when over-buying stops', 'Stable prices'] }),
    restaurant: G({ photos: ['Vegetable, meat, dairy and grocery bills', 'Gas cylinder bills', 'Store-to-kitchen issue slips', 'End-of-day wastage sheet', 'Weekly stock count'],
      inputs: ['Dining, takeaway/delivery and bar sales with collections', 'Kitchen purchases with items', 'Daily issues from stores to kitchen and bar', 'Wastage and staff meals'],
      owner: ['Food cost % every day (target 28–35%)', 'Bar beverage cost and missing bottles', 'Vendor price rises and short deliveries', 'Which half of the day earns more, and leakages on a random day'],
      customers: ['Consistent portions and quality', 'Table bookings with WhatsApp reminders', 'Prices that stay steady because costs are controlled'] }),
    hotel: G({ photos: ['Kitchen and bar purchase bills', 'Linen, amenities and laundry bills', 'Maintenance bills', 'Stores issue slips', 'Stock count sheets'],
      inputs: ['Room, restaurant, bar and banquet sales with collections', 'OTA commission and laundry as expenses', 'Issues from stores to kitchen, bar and housekeeping'],
      owner: ['Each department as its own profit centre', 'F&B cost, OTA commission and energy against healthy ranges', 'Linen and amenity leakage from stock counts', 'Night-shift (second half) collections checked separately'],
      customers: ['Booking reminders and bills on WhatsApp', 'Better-kept rooms and food because waste is visible', 'Fair room rates when costs are under control'] }),
    salon: G({ photos: ['Product and consumables bills', 'Retail stock invoices', 'Monthly product count'],
      inputs: ['Hair, skin, nails and retail sales', 'Commission and product use as expenses', 'Products issued to each section'],
      owner: ['Product use per rupee of service', 'Commission share and best-performing sections', 'Retail product upsell share'],
      customers: ['Appointment reminders and digital bills on WhatsApp', 'Consistent product quality'] }),
    clinic: G({ photos: ['Medicine and consumable bills', 'Lab reagent and outsourcing bills', 'Biomedical waste receipts'],
      inputs: ['OPD, procedures, lab and pharmacy billing with collections', 'Consumables issued to OPD and lab'],
      owner: ['Supplies cost per rupee billed', 'Outsourced lab cost vs lab billing', 'Pending payments and insurance'],
      customers: ['Appointment reminders and bills on WhatsApp', 'Fewer stock-outs of common medicines and tests'] }),
    apparel: G({ photos: ['Garment purchase invoices', 'Alteration tailor bills', 'Season-end stock count'],
      inputs: ['Showroom, alterations and online sales', 'Discounts given', 'Stock moved to the floor'],
      owner: ['Margin after discounts', 'Slow sizes and colours from stock counts', 'Supplier price rises'],
      customers: ['Bills and new-arrival messages on WhatsApp', 'Right sizes in stock'] }),
    electronics: G({ photos: ['Product invoices with model numbers', 'Spare parts bills', 'Courier bills'],
      inputs: ['Product sales and repair billing separately', 'Parts issued to repairs'],
      owner: ['Repair vs product margin', 'Parts used per repair job', 'Price rises across suppliers'],
      customers: ['Repair status and bills on WhatsApp', 'Faster repairs when parts are in stock'] }),
    hardware: G({ photos: ['Cement, steel, pipe and paint invoices', 'Transport and loading slips', 'Godown stock count'],
      inputs: ['Counter and site-order sales with contractor credit', 'Godown issues to counter and sites'],
      owner: ['Contractor credit outstanding', 'Transport cost per sale', 'Godown shortages'],
      customers: ['Statements and payment reminders on WhatsApp', 'Reliable stock for site orders'] }),
    bakery: G({ photos: ['Flour, sugar, butter and egg bills', 'Packaging bills', 'Unsold goods sheet each night'],
      inputs: ['Counter and order sales', 'Raw material issued to production', 'Unsold items as wastage'],
      owner: ['Raw material cost % and unsold %', 'Which half of the day sells more, to bake to demand', 'Ingredient price rises'],
      customers: ['Fresh products every day', 'Cake order reminders on WhatsApp'] }),
    auto: G({ photos: ['Spare parts and lubricant bills', 'Outside work bills', 'Parts stock count'],
      inputs: ['Workshop, parts counter and washing sales', 'Parts issued to each job'],
      owner: ['Parts vs labour in billing', 'Parts missing from the store', 'Outside work cost'],
      customers: ['Service reminders and bills on WhatsApp', 'Faster delivery of vehicles'] }),
    fitness: G({ photos: ['Supplement purchase bills', 'Equipment repair bills'],
      inputs: ['Membership, training and shop sales with collections', 'Supplements issued to the shop'],
      owner: ['Renewals collected on time', 'Supplement margin', 'Marketing spend per rupee earned'],
      customers: ['Session reminders on WhatsApp', 'Supplements always in stock'] }),
    services: G({ photos: ['Material bills', 'Fuel and travel bills', 'Tool purchases'],
      inputs: ['Job billing and collections', 'Materials issued to each job'],
      owner: ['Material and travel cost per job', 'Unpaid jobs', 'Profit per day'],
      customers: ['Booking reminders and invoices on WhatsApp', 'Clear, consistent quotes'] }),
  };

  /*
   * Customer Vault: what each business keeps for its customers and how it stays
   * in touch. records = kinds of records kept per customer (dueLabel = the date
   * that triggers a reminder); templates = ready WhatsApp messages
   * ({name}, {shop}, {item}, {date} are filled in).
   */
  function T(key, label, text) { return { key: key, label: label, text: text }; }
  var THANKS = T('thanks', 'Thank you', 'Dear {name}, thank you for choosing {shop}. Your bills and records are saved in your {shop} vault.');
  var OFFER = T('offer', 'Offer / news', 'Dear {name}, {shop} has something new for you: {item}. Reply to this message to know more.');
  var DUES = T('dues', 'Payment reminder', 'Dear {name}, a balance is pending at {shop}. Kindly clear it at your convenience. Thank you.');
  var VAULT = {
    generic: { records: [['bill', 'Bill', ''], ['document', 'Document / quote', ''], ['followup', 'Follow-up', 'Follow up on']],
      templates: [THANKS, T('followup', 'Follow-up', 'Dear {name}, this is {shop}. Just checking in about {item}. Do let us know if you need anything.'), OFFER, DUES] },
    pharmacy: { records: [['prescription', 'Prescription', 'Refill due'], ['bill', 'Bill', ''], ['allergy', 'Allergy / health note', ''], ['report', 'Lab report reference', '']],
      templates: [T('refill', 'Refill reminder', 'Dear {name}, your medicines ({item}) are due for refill on {date}. Reply to this message and we will keep them ready at {shop}.'),
        T('pickup', 'Order ready', 'Dear {name}, your medicines are ready for pickup at {shop}.'), THANKS, OFFER, DUES] },
    grocery: { records: [['bill', 'Bill', ''], ['list', 'Monthly list', 'Next order due'], ['preference', 'Preference', '']],
      templates: [T('monthly', 'Monthly order reminder', 'Dear {name}, time for your monthly groceries? Reply with your list and {shop} will pack it for you.'), T('fresh', 'Fresh arrivals', 'Dear {name}, fresh {item} just arrived at {shop}.'), THANKS, DUES] },
    restaurant: { records: [['visit', 'Visit / order', ''], ['occasion', 'Birthday / anniversary', 'Occasion on'], ['preference', 'Food preference / allergy', '']],
      templates: [T('occasion', 'Birthday / anniversary', 'Dear {name}, warm wishes from {shop}! Celebrate with us: a special treat is waiting for you on {date}.'), T('reserve', 'Reservation confirmation', 'Dear {name}, your table at {shop} is booked for {date}. See you soon!'), THANKS, OFFER] },
    hotel: { records: [['stay', 'Stay', ''], ['preference', 'Room / food preference', ''], ['occasion', 'Birthday / anniversary', 'Occasion on'], ['invoice', 'Invoice', '']],
      templates: [T('prearrival', 'Before arrival', 'Dear {name}, we look forward to welcoming you at {shop} on {date}. Tell us if you need anything special.'), T('occasion', 'Occasion wishes', 'Dear {name}, warm wishes from {shop}! Enjoy a special offer for your celebration on {date}.'), THANKS, OFFER] },
    salon: { records: [['service', 'Service done', 'Next visit due'], ['preference', 'Hair / skin note', ''], ['package', 'Package', 'Package ends']],
      templates: [T('nextvisit', 'Next visit reminder', 'Dear {name}, it has been a while since your {item}. Book your next visit at {shop}, due around {date}.'), T('package', 'Package ending', 'Dear {name}, your {item} package at {shop} ends on {date}.'), THANKS, OFFER] },
    clinic: { records: [['visit', 'Visit / consultation', 'Follow-up due'], ['prescription', 'Prescription', 'Review due'], ['report', 'Test report', '']],
      templates: [T('followup', 'Follow-up reminder', 'Dear {name}, your follow-up at {shop} is due on {date}. Reply to book a time.'), T('report', 'Report ready', 'Dear {name}, your report ({item}) is ready at {shop}.'), THANKS, DUES] },
    apparel: { records: [['bill', 'Bill', ''], ['size', 'Sizes & preferences', ''], ['alteration', 'Alteration', 'Ready on']],
      templates: [T('ready', 'Alteration ready', 'Dear {name}, your {item} is ready for pickup at {shop}.'), T('arrivals', 'New arrivals', 'Dear {name}, new {item} in your size just arrived at {shop}.'), THANKS, OFFER] },
    electronics: { records: [['warranty', 'Product & warranty', 'Warranty ends'], ['repair', 'Repair job', 'Ready on'], ['bill', 'Bill', '']],
      templates: [T('warranty', 'Warranty ending', 'Dear {name}, the warranty on your {item} from {shop} ends on {date}. Ask us about extended cover.'), T('repairready', 'Repair ready', 'Dear {name}, your {item} is repaired and ready at {shop}.'), THANKS, OFFER] },
    hardware: { records: [['bill', 'Bill / estimate', ''], ['site', 'Site / project', 'Next delivery'], ['statement', 'Account statement', '']],
      templates: [T('delivery', 'Delivery update', 'Dear {name}, your order ({item}) from {shop} will be delivered on {date}.'), T('statement', 'Statement', 'Dear {name}, your account statement from {shop} is ready. Reply to receive it.'), DUES, THANKS] },
    bakery: { records: [['order', 'Cake / order', 'Delivery on'], ['occasion', 'Birthday / anniversary', 'Occasion on'], ['preference', 'Preference (eggless etc.)', '']],
      templates: [T('occasion', 'Occasion reminder', 'Dear {name}, a special day is coming up on {date}. Order your cake from {shop} today!'), T('orderready', 'Order ready', 'Dear {name}, your {item} is ready at {shop}.'), THANKS, OFFER] },
    auto: { records: [['vehicle', 'Vehicle', ''], ['service', 'Service done', 'Next service due'], ['insurance', 'Insurance / PUC', 'Renewal due']],
      templates: [T('service', 'Service due', 'Dear {name}, your {item} is due for service on {date}. Reply to book a slot at {shop}.'), T('renewal', 'Insurance / PUC renewal', 'Dear {name}, the {item} for your vehicle expires on {date}. {shop} can help you renew it.'), T('ready', 'Vehicle ready', 'Dear {name}, your vehicle is ready for pickup at {shop}.'), THANKS] },
    fitness: { records: [['membership', 'Membership', 'Renewal due'], ['progress', 'Progress / measurements', ''], ['diet', 'Diet / training plan', '']],
      templates: [T('renewal', 'Renewal reminder', 'Dear {name}, your {item} at {shop} ends on {date}. Renew now to keep your streak going!'), T('missed', 'We miss you', 'Dear {name}, we have not seen you at {shop} for a while. Your trainer is waiting!'), THANKS, OFFER] },
    services: { records: [['job', 'Job done', 'Next visit due'], ['quote', 'Quote / estimate', 'Valid till'], ['amc', 'AMC / contract', 'Renewal due']],
      templates: [T('nextvisit', 'Next visit reminder', 'Dear {name}, your {item} is due on {date}. Reply to book {shop}.'), T('amc', 'AMC renewal', 'Dear {name}, your {item} with {shop} renews on {date}.'), THANKS, DUES] }
  };
  Object.keys(PRESETS).forEach(function (k) {
    var r = REVIEW[k] || REVIEW.generic;
    r.kpis = KPIS[k] || KPIS.generic;
    r.playbook = PLAYBOOK[k] || PLAYBOOK.generic;
    var v = VAULT[k] || VAULT.generic;
    r.vault = { records: v.records.map(function (x) { return { key: x[0], label: x[1], dueLabel: x[2] }; }), templates: v.templates };
    r.playbook.inputs = ['Walk-ins (number of customers) for the morning and the evening'].concat(r.playbook.inputs);
    r.playbook.photos = r.playbook.photos.concat(['Day-end sales report printed by your billing machine']);
    r.playbook.owner = r.playbook.owner.concat(['Any day to any day: sales, expenses, profit, walk-ins, average spend and day-on-day growth', 'Stock used against sales, day by day']);
    // Customer-centred benefits: the vault and continuous contact come first.
    r.playbook.customers = ['A personal vault for every customer: ' + v.records.map(function (x) { return x[1].toLowerCase(); }).join(', ') + ', all in one place they can open any time',
      'Timely WhatsApp messages from you: ' + v.templates.map(function (x) { return x.label.toLowerCase(); }).join(', ')].concat(r.playbook.customers);
    PRESETS[k].review = r;
  });
  var REVIEW_DEFAULT_MODULES = REVIEW_MODULES.concat(['settings', 'data']);

  function get(key) { return PRESETS[key] || PRESETS.generic; }
  function list() {
    return Object.keys(PRESETS).map(function (k) { return { key: k, name: PRESETS[k].name, icon: PRESETS[k].icon }; });
  }

  return { PRESETS: PRESETS, ALL_MODULES: ALL_MODULES, REVIEW_MODULES: REVIEW_MODULES, REVIEW_DEFAULT_MODULES: REVIEW_DEFAULT_MODULES, get: get, list: list };
});
