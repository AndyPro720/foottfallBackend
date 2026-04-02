// ─── Shared Property Field Definitions ───
// Used for Intake Form, Edit Form, and Detail View

export const SECTIONS = [
  {
    id: 'property-info',
    title: 'Property Information',
    collapsed: false,
    fields: [
      { name: 'name', label: 'Property Name', type: 'text', required: true, placeholder: 'e.g., Phoenix Mall Unit 204' },
      { name: 'propertyStatus', label: 'Property Status', type: 'select', options: ['Occupied', 'Available', 'Under Construction'], required: false },
      { name: 'completionTime', label: 'Completion Time (Months)', type: 'number', placeholder: 'Months to completion', conditionalOn: { field: 'propertyStatus', value: 'Under Construction' } },
      { name: 'partOC', label: 'Part OC', type: 'text', placeholder: 'e.g., Expected / Available / N/A', conditionalOn: { field: 'propertyStatus', value: 'Under Construction' } },
      { name: 'completeOC', label: 'Complete OC', type: 'text', placeholder: 'e.g., Expected / Available / N/A', conditionalOn: { field: 'propertyStatus', value: 'Under Construction' } },
      { name: 'buildingType', label: 'Building Type', type: 'select', options: ['Mall', 'Standalone', 'High Street'], required: false },
      { name: 'size', label: 'Carpet Area (sq ft)', type: 'number', required: false, placeholder: 'Carpet area' },
      { name: 'floor', label: 'Which Floor', type: 'text', placeholder: 'e.g., Ground, 1st, 2nd' },
      { name: 'entryToBuilding', label: 'Entry to Building Photo', type: 'file', accept: 'image/*,video/*' },
      { name: 'googleMapsLink', label: 'Google Map Link', type: 'text', placeholder: 'Paste Google Maps URL' },
      { name: 'location', label: 'Exact Location / Address', type: 'text', required: false, placeholder: 'Full address' },
      { name: 'tradeArea', label: 'Trade Area', type: 'text', placeholder: 'e.g., MG Road, Connaught Place' },

      { name: 'suitableFor', label: 'Suitable For', type: 'text', placeholder: 'e.g., F&B, Retail, Services' },
    ]
  },
  {
    id: 'contact',
    title: 'Contact Details',
    collapsed: true,
    fields: [
      { name: 'contactName', label: 'Contact Name', type: 'text', required: false, placeholder: 'Full name' },
      { name: 'contactDesignation', label: 'Designation', type: 'text', placeholder: 'e.g., Leasing Manager' },
      { name: 'contactInfo', label: 'Phone / Email', type: 'text', required: false, placeholder: '+91 XXXXX XXXXX' },
    ]
  },
  {
    id: 'specs',
    title: 'Unit Specifications',
    collapsed: true,
    fields: [
      { name: 'price', label: 'Price per Sq Ft (₹)', type: 'number', required: false, placeholder: '₹/sqft' },
      { name: 'mezzanine', label: 'Mezzanine Available', type: 'toggle' },
      { name: 'mezzanineSize', label: 'Mezzanine Size (sq ft)', type: 'number', placeholder: 'Size in sqft', conditionalOn: { field: 'mezzanine', value: 'yes' } },
      { name: 'clearHeight', label: 'Total Clear Height (ft)', type: 'number', placeholder: 'Floor to ceiling' },
      { name: 'clearHeightUnderMezz', label: 'Clear Height Under Mezzanine (ft)', type: 'number', placeholder: 'Floor to Mezzanine', conditionalOn: { field: 'mezzanine', value: 'yes' } },
      { name: 'clearHeightAboveMezz', label: 'Clear Height Above Mezzanine (ft)', type: 'number', placeholder: 'Mezzanine to ceiling', conditionalOn: { field: 'mezzanine', value: 'yes' } },
      { name: 'cam', label: 'CAM (₹/sqft)', type: 'number', placeholder: 'Common Area Maintenance' },
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
      { name: 'outsideSpace', label: 'Outside Space', type: 'toggle', hasPhoto: true },
      { name: 'serviceEntry', label: 'Service Entry', type: 'toggle', hasPhoto: true },
      { name: 'liftAccess', label: 'Lift Access', type: 'toggle', hasPhoto: true },
      { name: 'bohSpace', label: 'BOH Space', type: 'toggle', hasPhoto: true },
      { name: 'fireExit', label: 'Fire Exit', type: 'toggle' },
      { name: 'ocFile', label: 'OC File Upload', type: 'file', accept: 'image/*,video/*,.pdf' },
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
