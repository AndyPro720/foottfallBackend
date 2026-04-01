// ─── Shared Property Field Definitions ───
// Used for Intake Form, Edit Form, and Detail View

export const SECTIONS = [
  {
    id: 'property-info',
    title: 'Property Information',
    collapsed: false,
    fields: [
      { name: 'name', label: 'Property Name', type: 'text', required: true, placeholder: 'e.g., Phoenix Mall Unit 204' },
      { name: 'buildingType', label: 'Building Type', type: 'select', options: ['Mall', 'Standalone', 'High Street'], required: true },
      { name: 'floor', label: 'Which Floor', type: 'text', placeholder: 'e.g., Ground, 1st, 2nd' },
      { name: 'location', label: 'Exact Location / Address', type: 'text', required: true, placeholder: 'Full address' },
      { name: 'tradeArea', label: 'Trade Area', type: 'text', placeholder: 'e.g., MG Road, Connaught Place' },
      { name: 'suitableFor', label: 'Suitable For', type: 'text', placeholder: 'e.g., F&B, Retail, Services' },
    ]
  },
  {
    id: 'contact',
    title: 'Contact Details',
    collapsed: true,
    fields: [
      { name: 'contactName', label: 'Contact Name', type: 'text', required: true, placeholder: 'Full name' },
      { name: 'contactDesignation', label: 'Designation', type: 'text', placeholder: 'e.g., Leasing Manager' },
      { name: 'contactInfo', label: 'Phone / Email', type: 'text', required: true, placeholder: '+91 XXXXX XXXXX' },
    ]
  },
  {
    id: 'specs',
    title: 'Unit Specifications',
    collapsed: true,
    fields: [
      { name: 'size', label: 'Size (sq ft)', type: 'number', required: true, placeholder: 'Carpet area' },
      { name: 'price', label: 'Price per Sq Ft (₹)', type: 'number', required: true, placeholder: '₹/sqft' },
      { name: 'cam', label: 'CAM (₹/sqft)', type: 'number', placeholder: 'Common Area Maintenance' },
      { name: 'clearHeight', label: 'Clear Height (ft)', type: 'number', placeholder: 'Floor to ceiling' },
      { name: 'connectedLoad', label: 'Connected Load (KW)', type: 'number', placeholder: 'Electrical load' },
      { name: 'buildingAge', label: 'Age of Building (years)', type: 'number', placeholder: 'Approximate age' },
    ]
  },
  {
    id: 'facilities',
    title: 'Facilities',
    collapsed: true,
    fields: [
      { name: 'parking', label: 'Parking Space', type: 'toggle', hasCount: true, countLabel: 'Number of spots', hasPhoto: true },
      { name: 'outsideVisibility', label: 'Outside Visibility', type: 'toggle' },
      { name: 'serviceEntry', label: 'Service Entry', type: 'toggle', hasPhoto: true },
      { name: 'liftAccess', label: 'Lift Access', type: 'toggle', hasPhoto: true },
      { name: 'bohSpace', label: 'BOH Space', type: 'toggle', hasPhoto: true },
      { name: 'fireExit', label: 'Fire Exit', type: 'toggle' },
      { name: 'ocFile', label: 'OC File Available', type: 'toggle' },
    ]
  },
  {
    id: 'photos',
    title: 'Photos, Videos & Documents',
    collapsed: true,
    fields: [
      { name: 'buildingFacade', label: 'Building Facade', type: 'file', accept: 'image/*,video/*', multiple: true },
      { name: 'unitFacade', label: 'Unit Facade', type: 'file', accept: 'image/*,video/*', multiple: true },
      { name: 'interior', label: 'Interior', type: 'file', accept: 'image/*,video/*', multiple: true },
      { name: 'signage', label: 'Signage', type: 'file', accept: 'image/*,video/*', multiple: true },
      { name: 'floorPlan', label: 'Floor Plan', type: 'file', accept: 'image/*,video/*,.pdf' },
    ]
  }
];
