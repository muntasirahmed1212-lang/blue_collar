// js/data/categories.js

export const categories = [
  {
    id: "cat-1",
    name: "Electrician",
    slug: "electrician",
    icon: "zap",
    description: "Expert electrical repairs, wiring, and installations for your home.",
    serviceCount: 124,
    popularServices: ["Fan Installation", "Switchboard Repair", "Inverter Setup", "Wiring"]
  },
  {
    id: "cat-2",
    name: "Plumber",
    slug: "plumber",
    icon: "wrench",
    description: "Fix leaks, unclog drains, and install new bathroom fittings.",
    serviceCount: 98,
    popularServices: ["Tap Repair", "Washbasin Blockage", "Toilet Repair", "Water Tank Cleaning"]
  },
  {
    id: "cat-3",
    name: "Carpenter",
    slug: "carpenter",
    icon: "hammer",
    description: "Custom furniture, door repairs, and all types of woodwork.",
    serviceCount: 85,
    popularServices: ["Door Lock Change", "Bed Repair", "Custom Wardrobe", "Drill & Hang"]
  },
  {
    id: "cat-4",
    name: "Painter",
    slug: "painter",
    icon: "paint-bucket",
    description: "Interior and exterior wall painting, waterproofing, and polishing.",
    serviceCount: 45,
    popularServices: ["Full Home Painting", "Accent Wall", "Waterproofing", "Wood Polish"]
  },
  {
    id: "cat-5",
    name: "Constructor",
    slug: "constructor",
    icon: "hard-hat",
    description: "Masonry work, tiling, and general home renovations.",
    serviceCount: 32,
    popularServices: ["Floor Tiling", "Wall Plastering", "Bathroom Renovation", "Brickwork"]
  },
  {
    id: "cat-6",
    name: "AC Repair",
    slug: "ac-repair",
    icon: "snowflake",
    description: "AC servicing, installation, and gas refilling by certified technicians.",
    serviceCount: 156,
    popularServices: ["AC Deep Clean", "Gas Refill", "AC Installation", "PCB Repair"]
  },
  {
    id: "cat-7",
    name: "Cleaning",
    slug: "cleaning",
    icon: "sparkles",
    description: "Deep home cleaning, sofa cleaning, and bathroom scrubbing.",
    serviceCount: 210,
    popularServices: ["Full Home Deep Clean", "Sofa Spa", "Bathroom Cleaning", "Kitchen Cleaning"]
  },
  {
    id: "cat-8",
    name: "Pest Control",
    slug: "pest-control",
    icon: "shield",
    description: "Safe and effective treatment for termites, cockroaches, and bed bugs.",
    serviceCount: 67,
    popularServices: ["Cockroach Control", "Termite Treatment", "Bed Bug Control", "Ant Control"]
  },
  {
    id: "cat-9",
    name: "Appliance Repair",
    slug: "appliance-repair",
    icon: "settings",
    description: "Washing machine, refrigerator, microwave, and TV repair.",
    serviceCount: 112,
    popularServices: ["Washing Machine Repair", "Fridge Repair", "TV Wall Mount", "Geyser Repair"]
  },
  {
    id: "cat-10",
    name: "Locksmith",
    slug: "locksmith",
    icon: "lock",
    description: "Emergency lock opening, key duplication, and smart lock installation.",
    serviceCount: 28,
    popularServices: ["Emergency Unlocking", "Key Duplication", "Smart Lock Install", "Door Closer"]
  },
  {
    id: "cat-11",
    name: "CCTV & Security",
    slug: "cctv-security",
    icon: "camera",
    description: "CCTV camera installation, video doorbells, and alarm systems.",
    serviceCount: 42,
    popularServices: ["CCTV Installation", "Video Doorbell Setup", "DVR Configuration", "Fault Repair"]
  },
  {
    id: "cat-12",
    name: "Gardening",
    slug: "gardening",
    icon: "leaf",
    description: "Lawn care, tree trimming, balcony gardens, and landscaping.",
    serviceCount: 35,
    popularServices: ["Lawn Mowing", "Plant Pruning", "Balcony Garden Setup", "Pesticide Spray"]
  }
];

export function getCategoryBySlug(slug) {
  return categories.find(c => c.slug === slug);
}
