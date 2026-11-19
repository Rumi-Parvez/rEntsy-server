import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_CLIENT_URI;

if (!uri) {
  throw new Error("MONGODB_CLIENT_URI is not defined in .env");
}

const client = new MongoClient(uri);

let database;

export const connectDB = async () => {
  try {
    await client.connect();

    database = client.db(process.env.DB_NAME);

    console.log("MongoDB connected successfully");

    return database;
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
};

export const getDB = () => {
  if (!database) {
    throw new Error("Database is not connected");
  }

  return database;
};