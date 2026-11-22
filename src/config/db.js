import { MongoClient } from "mongodb";

const uri =
  process.env.MONGODB_CLIENT_URI ||
  process.env.MONGO_DB_CLIENT;

let database;
let connectionPromise;
let client;

const getClient = () => {
  if (!uri) {
    throw new Error(
      "MONGODB_CLIENT_URI is not defined in the server environment."
    );
  }

  if (!client) {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
    });
  }

  return client;
};

const ensureIndexes = async (db) => {
  const jobs = [
    db.collection("users").createIndex(
      { email: 1 },
      { unique: true, name: "users_email_unique" }
    ),
    db.collection("equipment").createIndex({
      status: 1,
      category: 1,
    }),
    db.collection("equipment").createIndex({
      ownerEmail: 1,
    }),
    db.collection("bookings").createIndex({
      customerEmail: 1,
    }),
    db.collection("bookings").createIndex({
      ownerEmail: 1,
    }),
    db.collection("bookings").createIndex({
      bookingStatus: 1,
    }),
    db.collection("favorites").createIndex(
      {
        userId: 1,
        equipmentId: 1,
      },
      { unique: true, name: "favorites_user_equipment_unique" }
    ),
    db.collection("bookings").createIndex(
      { checkoutId: 1 },
      {
        unique: true,
        name: "bookings_checkout_unique",
        partialFilterExpression: {
          checkoutId: { $type: "string" },
        },
      }
    ),
    db.collection("payments").createIndex({
      checkoutId: 1,
    }),
    db.collection("payments").createIndex({
      stripeSessionId: 1,
    }),
    db.collection("payments").createIndex({
      customerEmail: 1,
    }),
    // Only pending checkouts carry expiresAt, so paid transaction
    // records are never removed by the TTL monitor.
    db.collection("payments").createIndex(
      { expiresAt: 1 },
      {
        name: "payments_pending_ttl",
        expireAfterSeconds: 0,
      }
    ),
  ];

  // Index creation must never stop the API from booting.
  // Existing duplicate data can make a unique index fail.
  const results = await Promise.allSettled(jobs);

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.warn(
        "Index warning:",
        result.reason?.message || result.reason
      );
    }
  });
};

export const connectDB = async () => {
  if (database) {
    return database;
  }

  if (!connectionPromise) {
    connectionPromise = (async () => {
      try {
        const mongoClient = getClient();
        await mongoClient.connect();

        const connectedDatabase = mongoClient.db(
          process.env.DB_NAME || "rEntsy_server_DB"
        );

        await ensureIndexes(connectedDatabase);
        database = connectedDatabase;
        console.log("MongoDB connected successfully");

        return database;
      } catch (error) {
        connectionPromise = undefined;
        throw error;
      }
    })();
  }

  return connectionPromise;
};

export const getDB = () => {
  if (!database) {
    throw new Error("Database is not connected");
  }

  return database;
};
