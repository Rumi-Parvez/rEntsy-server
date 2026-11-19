const fs = await import("node:fs");
const env = fs.readFileSync(
  "E:/Projects/Assignment B14 PH-9/rEntsy-server/.env",
  "utf8"
);
const uri = env.match(/MONGODB_CLIENT_URI=(.*)/)[1].trim();
const dbName = env.match(/DB_NAME=(.*)/)[1].trim();

const { MongoClient } = await import("mongodb");
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 });
await client.connect();
const db = client.db(dbName);

const users = await db
  .collection("users")
  .find({ email: /qa-|@g\.com$/ })
  .project({ email: 1, role: 1, name: 1 })
  .toArray();

const equipment = await db
  .collection("equipment")
  .find({})
  .project({ equipmentName: 1, status: 1, ownerEmail: 1 })
  .toArray();

const bookings = await db
  .collection("bookings")
  .find({})
  .project({ bookingId: 1, bookingStatus: 1, paymentStatus: 1 })
  .toArray();

const favorites = await db.collection("favorites").find({}).toArray();
const authUsers = await db
  .collection("user")
  .find({ email: /qa-/ })
  .project({ email: 1 })
  .toArray();

console.log(
  JSON.stringify({ users, equipment, bookings, favorites: favorites.length, authUsers }, null, 2)
);

await client.close();
