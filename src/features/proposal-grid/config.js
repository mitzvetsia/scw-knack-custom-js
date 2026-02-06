// src/features/proposal-grid/config.js
// Extracted CONFIG for proposal-grid (CommonJS)

const CONFIG = {
  views: {
    view_3301: {
      keys: {
        qty: 'field_1964',
        labor: 'field_2028',
        hardware: 'field_2201',
        cost: 'field_2203',
        discount: 'field_2267',
        field2019: 'field_2019',
        prefix: 'field_2240',
        number: 'field_1951',
        l2Sort: 'field_2218',
        l2Selector: 'field_2228',
        l3BlankLabelField: 'field_2208',
      },
    },
    view_3341: {
      keys: {
        qty: 'field_1964',
        labor: 'field_2028',
        hardware: 'field_2201',
        cost: 'field_2203',
        discount: 'field_2267',
        field2019: 'field_2019',
        prefix: 'field_2240',
        number: 'field_1951',
        l2Sort: 'field_2218',
        l2Selector: 'field_2228',
        l3BlankLabelField: 'field_2208',
      },
    },
    view_3371: {
      keys: {
        qty: 'field_1964',
        labor: 'field_2028',
        hardware: 'field_2201',
        cost: 'field_2203',
        discount: 'field_2267',
        field2019: 'field_2019',
        prefix: 'field_2240',
        number: 'field_1951',
        l2Sort: 'field_2218',
        l2Selector: 'field_2228',
        l3BlankLabelField: 'field_2208',
      },
    },
  },

  styleSceneIds: ['scene_1096'],

  features: {
    l2Sort: { enabled: true, missingSortGoesLast: true },
    hideL3WhenBlank: { enabled: true },

    hideBlankL4Headers: {
      enabled: true,
      cssClass: 'scw-hide-level4-header',
      requireField2019AlsoBlank: true,
    },

    hideL2Footer: {
      enabled: true,
      labels: ['Assumptions'],
      recordIds: ['697b7a023a31502ec68b3303'],
    },

    level2LabelRewrite: {
      enabled: true,
      rules: [
        {
          when: 'Video',
          match: 'exact',
          renames: {
            'Camera or Reader': 'Cameras',
            'Networking or Headend': 'NVRs, Switches, and Networking',
          },
        },
        {
          when: 'Access Control',
          match: 'exact',
          renames: {
            'Camera or Reader': 'Entries',
            'Networking or Headend': 'AC Controllers, Switches, and Networking',
          },
        },
        {
          when: 'video',
          match: 'contains',
          renames: {
            'Networking or Headend': 'NVR, Switches, and Networking',
          },
        },
      ],
    },

    eachColumn: { enabled: false, fieldKey: 'field_1960' },

    concat: { enabled: true, onlyContextKey: 'drop', onlyLevel: 4 },

    concatL3Mounting: {
      enabled: true,
      level2Label: 'Mounting Hardware',
      level: 3,
      cssClass: 'scw-concat-cameras--mounting',
    },
  },

  l2Context: {
    byId: {},
    byLabel: {
      'Cameras & Cabling': 'drop',
      'Cameras and Cabling': 'drop',
      'Cameras or Cabling': 'drop',
      'Camera or Reader': 'drop',
      'Cameras': 'drop',
      'Entries': 'drop',

      'Networking or Headend': 'headend',
      'Networking & Headend': 'headend',
      'NVRs, Switches, and Networking': 'headend',
      'NVR, Switches, and Networking': 'headend',
      'AC Controllers, Switches, and Networking': 'headend',

      Services: 'services',
    },
  },

  l2SectionRules: [
    {
      key: 'services',
      recordIds: ['6977caa7f246edf67b52cbcd'],
      labels: ['Services'],
      hideLevel3Summary: true,
      hideQtyCostColumns: true,
      hideSubtotalFilter: true,
      headerBackground: '',
      headerTextColor: '',
    },
    {
      key: 'assumptions',
      recordIds: ['697b7a023a31502ec68b3303'],
      labels: ['Assumptions'],
      hideLevel3Summary: true,
      hideQtyCostColumns: true,
      hideSubtotalFilter: true,
      headerBackground: '#f0f7ff',
      headerTextColor: '',
    },
  ],

  l2Specials: {
    mountingHardwareId: '',
    mountingHardwareLabel: 'Mounting Hardware',
    classOnLevel3: 'scw-level3--mounting-hardware',
  },

  debug: false,
  eventNs: '.scwTotals',
  cssId: 'scw-totals-css',
};

module.exports = CONFIG;