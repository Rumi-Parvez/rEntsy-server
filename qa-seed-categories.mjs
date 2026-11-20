import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const uri = process.env.MONGODB_CLIENT_URI;
const dbName = process.env.DB_NAME;

if (!uri) {
  throw new Error("MONGODB_URI is missing.");
}

if (!dbName) {
  throw new Error("DB_NAME is missing.");
}

const client = new MongoClient(uri);

const categories = [
  {
    name: "Construction",
    slug: "construction",
    description:
      "Excavators, loaders, mixers and essential construction equipment.",
    imageUrl:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=85",
    icon: "HardHat",
    order: 1,
  },

  {
    name: "Lifting & Access",
    slug: "lifting-access",
    description:
      "Cranes, boom lifts and access equipment for demanding projects.",
    imageUrl:
      "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=1200&q=85",
    icon: "ArrowUpFromLine",
    order: 2,
  },

  {
    name: "Material Handling",
    slug: "material-handling",
    description:
      "Forklifts and equipment designed for moving heavy materials.",
    imageUrl:
      "https://images.unsplash.com/photo-1586528116493-da8b8a0b4f3e?auto=format&fit=crop&w=1200&q=85",
    icon: "Forklift",
    order: 3,
  },

  {
    name: "Generators & Power",
    slug: "generators-power",
    description:
      "Reliable power equipment for construction and outdoor projects.",
    imageUrl:
      "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1200&q=85",
    icon: "Zap",
    order: 4,
  },

  {
    name: "Transportation",
    slug: "transportation",
    description:
      "Cargo trucks and utility vehicles for moving equipment and materials.",
    imageUrl:
      "https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=1200&q=85",
    icon: "Truck",
    order: 5,
  },

  {
    name: "Cleaning Equipment",
    slug: "cleaning-equipment",
    description:
      "Pressure washers and professional cleaning equipment.",
    imageUrl:
      "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1200&q=85",
    icon: "Droplets",
    order: 6,
  },

  {
    name: "Agriculture",
    slug: "agriculture",
    description:
      "Agricultural machinery and equipment for farming projects.",
    imageUrl:
      "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1200&q=85",
    icon: "Wheat",
    order: 7,
  },

  {
    name: "Events & Outdoor",
    slug: "events-outdoor",
    description:
      "Equipment for outdoor projects, events and temporary setups.",
    imageUrl:
      "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1200&q=85",
    icon: "Tent",
    order: 8,
  },
];

try {
  await client.connect();

  const db = client.db(dbName);
  const collection = db.collection("categories");

  await collection.deleteMany({});

  await collection.insertMany(
    categories.map((category) => ({
      ...category,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  );

  console.log("8 categories inserted successfully.");
} catch (error) {
  console.error("Category seed failed:", error);
} finally {
  await client.close();
}