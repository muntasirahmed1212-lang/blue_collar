// js/data/professionals.js

export const professionals = [
  // Electricians
  {
    id: "pro-1",
    name: "Rajesh Kumar",
    photo: "https://i.pravatar.cc/150?img=11",
    categoryId: "cat-1",
    categoryName: "Electrician",
    rating: 4.9,
    reviewCount: 342,
    verified: true,
    yearsExperience: 8,
    hourlyRate: 350,
    location: "Andheri West, Mumbai",
    distance: "2.5 km away",
    bio: "Certified electrician with 8 years of experience. Specializing in home wiring, fault finding, and smart home installations. I guarantee clean work and safety.",
    skills: ["Wiring", "Inverter Setup", "Smart Home", "Fault Finding"],
    completedJobs: 1250,
    responseTime: "Usually responds in 15 mins",
    availability: "Available Today",
    reviews: [
      { user: "Amit S.", rating: 5, comment: "Very professional and arrived on time. Fixed the short circuit issue quickly.", date: "2 weeks ago" },
      { user: "Priya M.", rating: 5, comment: "Installed 3 fans and a chandelier. Very neat work.", date: "1 month ago" }
    ],
    gallery: ["https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&q=80", "https://images.unsplash.com/photo-1558611848-73f7eb4001a1?w=400&q=80"]
  },
  {
    id: "pro-2",
    name: "Suresh Menon",
    photo: "https://i.pravatar.cc/150?img=33",
    categoryId: "cat-1",
    categoryName: "Electrician",
    rating: 4.6,
    reviewCount: 128,
    verified: true,
    yearsExperience: 5,
    hourlyRate: 300,
    location: "Koramangala, Bangalore",
    distance: "4.1 km away",
    bio: "Reliable electrical repairs for residential and commercial spaces. Can fix switchboards, install heavy appliances, and manage load distribution.",
    skills: ["Appliance Install", "Switchboard", "MCB Box", "Lighting"],
    completedJobs: 450,
    responseTime: "Usually responds in 1 hr",
    availability: "Available Tomorrow",
    reviews: [
      { user: "Neha K.", rating: 4, comment: "Good work but was a bit late.", date: "3 months ago" }
    ],
    gallery: ["https://images.unsplash.com/photo-1558611848-73f7eb4001a1?w=400&q=80"]
  },
  
  // Plumbers
  {
    id: "pro-3",
    name: "Vikas Sharma",
    photo: "https://i.pravatar.cc/150?img=53",
    categoryId: "cat-2",
    categoryName: "Plumber",
    rating: 4.8,
    reviewCount: 215,
    verified: true,
    yearsExperience: 10,
    hourlyRate: 400,
    location: "Dwarka, Delhi",
    distance: "1.2 km away",
    bio: "Expert in solving complex plumbing issues. Leak detection, pipe replacement, and modern bathroom fittings.",
    skills: ["Leak Detection", "Pipe Replacement", "Bathroom Fittings"],
    completedJobs: 890,
    responseTime: "Usually responds in 10 mins",
    availability: "Available Today",
    reviews: [
      { user: "Rohit V.", rating: 5, comment: "Fixed the persistent sink leak in 20 minutes.", date: "1 week ago" }
    ],
    gallery: ["https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400&q=80"]
  },
  {
    id: "pro-4",
    name: "Imran Khan",
    photo: "https://i.pravatar.cc/150?img=15",
    categoryId: "cat-2",
    categoryName: "Plumber",
    rating: 4.5,
    reviewCount: 95,
    verified: false,
    yearsExperience: 3,
    hourlyRate: 250,
    location: "Bandra, Mumbai",
    distance: "5.0 km away",
    bio: "Quick and affordable plumbing fixes. Available for blockages, tap changes, and water tank issues.",
    skills: ["Blockage", "Tap Repair", "Water Tank"],
    completedJobs: 210,
    responseTime: "Usually responds in 2 hrs",
    availability: "Busy",
    reviews: [],
    gallery: []
  },

  // Carpenters
  {
    id: "pro-5",
    name: "Dinesh Patel",
    photo: "https://i.pravatar.cc/150?img=60",
    categoryId: "cat-3",
    categoryName: "Carpenter",
    rating: 4.9,
    reviewCount: 410,
    verified: true,
    yearsExperience: 15,
    hourlyRate: 500,
    location: "Indiranagar, Bangalore",
    distance: "3.3 km away",
    bio: "Master carpenter specialized in custom modular furniture, kitchen cabinets, and fine wood polishing.",
    skills: ["Modular Furniture", "Wood Polish", "Cabinets", "Door Fitting"],
    completedJobs: 1500,
    responseTime: "Usually responds in 30 mins",
    availability: "Available Tomorrow",
    reviews: [
      { user: "Swati L.", rating: 5, comment: "Built a beautiful custom bookshelf for my living room.", date: "2 months ago" }
    ],
    gallery: ["https://images.unsplash.com/photo-1621252178498-15a0c0f8623b?w=400&q=80", "https://images.unsplash.com/photo-1582282577232-06b29f9e71ec?w=400&q=80"]
  },

  // AC Repair
  {
    id: "pro-6",
    name: "Anil Reddy",
    photo: "https://i.pravatar.cc/150?img=52",
    categoryId: "cat-6",
    categoryName: "AC Repair",
    rating: 4.7,
    reviewCount: 180,
    verified: true,
    yearsExperience: 6,
    hourlyRate: 450,
    location: "Gachibowli, Hyderabad",
    distance: "1.8 km away",
    bio: "Specialist in Split and Window ACs. Gas refilling, deep foam cleaning, and PCB repairs.",
    skills: ["Gas Refill", "Deep Cleaning", "PCB Repair"],
    completedJobs: 600,
    responseTime: "Usually responds in 10 mins",
    availability: "Available Today",
    reviews: [
      { user: "Karan D.", rating: 5, comment: "AC is cooling like brand new after the deep clean.", date: "4 days ago" }
    ],
    gallery: []
  },

  // Cleaning
  {
    id: "pro-7",
    name: "Pooja Singh",
    photo: "https://i.pravatar.cc/150?img=47",
    categoryId: "cat-7",
    categoryName: "Cleaning",
    rating: 4.8,
    reviewCount: 290,
    verified: true,
    yearsExperience: 4,
    hourlyRate: 200,
    location: "Vasant Kunj, Delhi",
    distance: "4.5 km away",
    bio: "Detail-oriented professional cleaner. I bring my own high-quality cleaning supplies and equipment. Deep home cleaning and sofa spa specialist.",
    skills: ["Deep Cleaning", "Sofa Spa", "Bathroom Scubbing"],
    completedJobs: 850,
    responseTime: "Usually responds in 20 mins",
    availability: "Available Tomorrow",
    reviews: [
      { user: "Anita P.", rating: 5, comment: "The bathroom was sparkling clean. Highly recommended.", date: "1 week ago" }
    ],
    gallery: ["https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&q=80"]
  }
];

// Add 43 more generated pros to reach 50+
const names = ["Ramesh", "Deepak", "Manoj", "Sanjay", "Vijay", "Kamal", "Rahul", "Prakash", "Gaurav", "Nitin", "Sunil", "Ashok"];
const surnames = ["Sharma", "Verma", "Gupta", "Singh", "Yadav", "Das", "Joshi", "Mishra", "Chauhan", "Rao"];
const cats = ["cat-1", "cat-2", "cat-3", "cat-4", "cat-5", "cat-6", "cat-7", "cat-8", "cat-9", "cat-10", "cat-11", "cat-12"];
const catNames = ["Electrician", "Plumber", "Carpenter", "Painter", "Constructor", "AC Repair", "Cleaning", "Pest Control", "Appliance Repair", "Locksmith", "CCTV & Security", "Gardening"];
const locations = ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Pune"];
const availabilities = ["Available Today", "Available Tomorrow", "Busy"];

for (let i = 8; i <= 55; i++) {
  const catIndex = i % 12;
  professionals.push({
    id: `pro-${i}`,
    name: `${names[i % names.length]} ${surnames[i % surnames.length]}`,
    photo: `https://i.pravatar.cc/150?img=${(i % 70) + 1}`,
    categoryId: cats[catIndex],
    categoryName: catNames[catIndex],
    rating: Number((3.5 + Math.random() * 1.5).toFixed(1)), // 3.5 to 5.0
    reviewCount: Math.floor(Math.random() * 500) + 10,
    verified: Math.random() > 0.3,
    yearsExperience: Math.floor(Math.random() * 15) + 1,
    hourlyRate: Math.floor(Math.random() * 300) + 200, // 200 to 500
    location: locations[i % locations.length],
    distance: `${(Math.random() * 10 + 0.5).toFixed(1)} km away`,
    bio: "Experienced professional dedicated to providing high-quality service and customer satisfaction.",
    skills: ["General Service", "Maintenance", "Repair"],
    completedJobs: Math.floor(Math.random() * 2000) + 50,
    responseTime: "Usually responds in 1 hr",
    availability: availabilities[i % 3],
    reviews: [],
    gallery: []
  });
}

export function getProfessionalsByCategory(categoryId) {
  return professionals.filter(p => p.categoryId === categoryId);
}

export function getProfessionalById(id) {
  return professionals.find(p => p.id === id);
}

export function getFeaturedProfessionals(limit = 6) {
  return [...professionals].sort((a, b) => b.rating - a.rating).slice(0, limit);
}
