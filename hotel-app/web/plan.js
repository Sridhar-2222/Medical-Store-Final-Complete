/* Fingertip Hotel: headers and sub-headers. Names only, no examples, no data. */
window.PLAN = {
  headers: [
    { key: 'rooms', name: 'Rooms', ic: '🛏', subs: [
      { key: 'bookings', name: 'Bookings', ic: '📅', fields: ['date', 'guest', 'room', 'qty', 'amount', 'note'], qty: 'Nights' },
      { key: 'checkin', name: 'Check-in / Check-out', ic: '🔑', fields: ['date', 'guest', 'room', 'note'] },
      { key: 'roomstatus', name: 'Room status', ic: '🚪', fields: ['date', 'room', 'note'] },
      { key: 'housekeeping', name: 'Housekeeping', ic: '🧹', fields: ['date', 'room', 'person', 'note'] },
      { key: 'roomsales', name: 'Room sales', ic: '₹', fields: ['date', 'room', 'qty', 'amount', 'note'], qty: 'Rooms sold', income: true }
    ] },
    { key: 'restaurant', name: 'Restaurant', ic: '🍽', subs: [
      { key: 'dinein', name: 'Dine-in', ic: '🍛', fields: ['date', 'qty', 'amount', 'note'], qty: 'Covers', income: true },
      { key: 'roomservice', name: 'Room service', ic: '🛎', fields: ['date', 'room', 'amount', 'note'], income: true },
      { key: 'takeaway', name: 'Takeaway / Delivery', ic: '🛵', fields: ['date', 'qty', 'amount', 'note'], qty: 'Orders', income: true },
      { key: 'banquets', name: 'Banquets & parties', ic: '🎉', fields: ['date', 'guest', 'qty', 'amount', 'note'], qty: 'Plates', income: true },
      { key: 'kitchen', name: 'Kitchen stock', ic: '🥬', fields: ['date', 'qty', 'amount', 'note'], qty: 'Quantity' }
    ] },
    { key: 'guests', name: 'Guests', ic: '☺', subs: [
      { key: 'vaults', name: 'Guest vaults', ic: '🗂', special: 'vaults' },
      { key: 'messages', name: 'Messages', ic: '✉', special: 'messages' },
      { key: 'reminders', name: 'Reminders', ic: '⏰', special: 'reminders' }
    ] },
    { key: 'money', name: 'Money', ic: '💰', subs: [
      { key: 'payments', name: 'Payments received', ic: '⬇', fields: ['date', 'guest', 'amount', 'mode', 'note'] },
      { key: 'otherincome', name: 'Other income', ic: '➕', fields: ['date', 'amount', 'note'], income: true },
      { key: 'expenses', name: 'Expenses', ic: '➖', fields: ['date', 'amount', 'mode', 'note'], cost: true },
      { key: 'bank', name: 'Bank / UPI statement', ic: '🏦', fields: ['date', 'amount', 'note'] }
    ] },
    { key: 'purchases', name: 'Purchases', ic: '🧾', subs: [
      { key: 'supplier', name: 'Supplier bills', ic: '🧾', fields: ['date', 'person', 'amount', 'note'], cost: true, personLabel: 'Supplier' },
      { key: 'store', name: 'Store in / out', ic: '📦', fields: ['date', 'qty', 'note'], qty: 'Quantity' }
    ] },
    { key: 'staff', name: 'Staff', ic: '◎', subs: [
      { key: 'attendance', name: 'Attendance', ic: '✓', fields: ['date', 'person', 'note'] },
      { key: 'salaries', name: 'Salaries', ic: '₹', fields: ['date', 'person', 'amount', 'note'], cost: true },
      { key: 'advances', name: 'Advances', ic: '⇄', fields: ['date', 'person', 'amount', 'note'] }
    ] },
    { key: 'reports', name: 'Reports', ic: '▤', subs: [
      { key: 'r-daily', name: 'Daily', ic: '☀', special: 'report', period: 'day' },
      { key: 'r-monthly', name: 'Monthly', ic: '🗓', special: 'report', period: 'month' },
      { key: 'r-occupancy', name: 'Occupancy', ic: '🛏', special: 'occupancy' },
      { key: 'r-profit', name: 'Profit', ic: '∑', special: 'profit' }
    ] },
    { key: 'settings', name: 'Settings', ic: '⚙', subs: [
      { key: 's-business', name: 'Business details', ic: '⌂', special: 'business' },
      { key: 's-rooms', name: 'Rooms list', ic: '🛏', special: 'roomslist' },
      { key: 's-ai', name: 'AI', ic: '✦', special: 'ai' },
      { key: 's-backup', name: 'Backup', ic: '⇩', special: 'backup' }
    ] }
  ],
  labels: { date: 'Date', guest: 'Guest', room: 'Room', qty: 'Count', amount: 'Amount ₹', note: 'Note', person: 'Person', mode: 'Paid by' }
};
