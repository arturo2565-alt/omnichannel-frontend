/** Datos de inspección local. No salen de una conversación ni se guardan. */

export const SUPERVISION_PREVIEW_CASES = [
  {
    id: 'cita',
    label: 'Cotización y cita',
    input: {
      autopilotOn: true,
      leadStatus: 'agendado',
      contact: { name: 'Ejemplo de revisión', channel: 'lab' },
      vehicles: [
        {
          identity: {
            vehicleId: 'vista-1',
            displayLabel: 'Mazda 2 2024',
            make: 'Mazda',
            model: '2',
            year: '2024',
            source: 'user',
            confirmedByUser: true,
          },
        },
      ],
      quote: {
        hasQuote: true,
        sent: true,
        partial: false,
        cartEditable: false,
        sentTotal: 6950,
        total: 6950,
      },
      lines: [
        {
          id: 'vista-costado',
          label: 'Costado izquierdo',
          code: 'CTI',
          amount: 4050,
          severity: 'Fuerte',
          treatment: 'Reparar',
          priceSource: 'AUTOFIX_CATALOG',
          pricingStatus: 'OK',
        },
        {
          id: 'vista-fascia',
          label: 'Fascia trasera',
          code: 'FT',
          amount: 2900,
          severity: 'Leve',
          treatment: 'Reparar',
          priceSource: 'AUTOFIX_CATALOG',
          pricingStatus: 'OK',
        },
      ],
      evidence: [
        {
          url: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2264%22 height=%2264%22%3E%3Crect width=%2264%22 height=%2264%22 fill=%22%2394a3b8%22/%3E%3C/svg%3E',
          panel: 'Costado izquierdo',
          severity: 'Fuerte',
          treatment: 'Reparar',
        },
      ],
      appointment: {
        status: 'confirmada',
        when: 'mañana 10:00',
        scheduledAt: '2099-01-01T16:00:00.000Z',
        clientName: 'Ejemplo de revisión',
        vehicle: 'Mazda 2 2024',
        phone: '5500000000',
      },
    },
  },
  {
    id: 'vacia',
    label: 'Sin cotización',
    input: {
      autopilotOn: true,
      leadStatus: 'nuevo',
      contact: { name: '', channel: 'whatsapp' },
      vehicles: [],
      quote: { hasQuote: false },
      lines: [],
      evidence: [],
      appointment: null,
    },
  },
  {
    id: 'parcial',
    label: 'Cotización parcial',
    input: {
      autopilotOn: true,
      leadStatus: 'cotizado',
      contact: { name: 'Ejemplo de revisión', channel: 'messenger' },
      vehicles: [
        {
          identity: {
            vehicleId: 'vista-2',
            displayLabel: 'Mazda 2',
            make: 'Mazda',
            model: '2',
            source: 'vision',
          },
        },
      ],
      quote: {
        hasQuote: true,
        sent: true,
        partial: true,
        cartEditable: true,
        sentTotal: 6950,
        total: 2900,
      },
      lines: [
        {
          id: 'vista-fascia-parcial',
          label: 'Fascia trasera',
          code: 'FT',
          amount: 2900,
          priceSource: 'AUTOFIX_CATALOG',
          pricingStatus: 'OK',
        },
        {
          id: 'vista-costado-parcial',
          label: 'Costado izquierdo',
          code: 'CTI',
          amount: 0,
          priceSource: 'UNCONFIGURED',
          pricingStatus: 'UNCONFIGURED',
        },
      ],
      awaitingVehicle: false,
    },
  },
  {
    id: 'intervencion',
    label: 'Intervención humana',
    input: {
      autopilotOn: false,
      leadStatus: 'cotizado',
      contact: { name: 'Ejemplo de revisión', channel: 'lab' },
      vehicles: [
        {
          identity: {
            vehicleId: 'vista-3',
            displayLabel: 'Mazda 2 2024',
            source: 'user',
            confirmedByUser: true,
          },
        },
        {
          identity: {
            vehicleId: 'vista-4',
            displayLabel: 'Jetta 2018',
            source: 'vision',
          },
        },
      ],
      quote: { hasQuote: true, sent: false, cartEditable: true, total: 2900 },
      lines: [
        {
          id: 'vista-una',
          label: 'Fascia trasera',
          code: 'FT',
          amount: 2900,
          priceSource: 'AUTOFIX_CATALOG',
          pricingStatus: 'OK',
        },
      ],
      error: '',
      appointment: {
        status: 'confirmada',
        when: 'mañana 10:00',
        clientName: 'Ejemplo de revisión',
        vehicle: '',
      },
    },
  },
];
