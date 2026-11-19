const authBase = "http://localhost:3000";
const apiBase = "http://localhost:5000/api";

async function signup(name, email, password) {
  const res = await fetch(`${authBase}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ name, email, password }),
  });

  const body = await res.json();

  if (!res.ok) {
    throw new Error(
      `Signup failed for ${email}: ${res.status} ${JSON.stringify(body)}`
    );
  }

  const cookie = res.headers
    .getSetCookie()
    .map((item) => item.split(";")[0])
    .join("; ");

  const tokenRes = await fetch(`${authBase}/api/auth/token`, {
    headers: { cookie, origin: "http://localhost:3000" },
  });

  const tokenBody = await tokenRes.json();

  if (!tokenRes.ok || !tokenBody.token) {
    throw new Error(
      `Token failed for ${email}: ${tokenRes.status} ${JSON.stringify(tokenBody)}`
    );
  }

  return { cookie, token: tokenBody.token, user: body.user };
}

async function api(path, token, options = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      `API ${path} failed: ${res.status} ${JSON.stringify(body)}`
    );
  }

  return body;
}

async function syncProfile(token, data) {
  return api("/users", token, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

const password = "RentsyQa123!";

const admin = await signup(
  "QA Admin",
  "qa-admin@rentsy.test",
  password
);
console.log("admin auth ok");

const owner = await signup(
  "QA Owner",
  "qa-owner@rentsy.test",
  password
);
console.log("owner auth ok");

const customer = await signup(
  "QA Customer",
  "qa-customer@rentsy.test",
  password
);
console.log("customer auth ok");

await syncProfile(owner.token, {
  name: "QA Owner",
  email: "qa-owner@rentsy.test",
  image: "https://i.postimg.cc/Bn3b664G/Rumi-Parvez.jpg",
  phone: "+8801711111111",
  address: "Dhaka, Bangladesh",
  role: "owner",
});

await syncProfile(customer.token, {
  name: "QA Customer",
  email: "qa-customer@rentsy.test",
  image: "",
  phone: "+8801722222222",
  address: "Narsingdi, Bangladesh",
  role: "customer",
});

await syncProfile(admin.token, {
  name: "QA Admin",
  email: "qa-admin@rentsy.test",
  image: "",
  phone: "+8801733333333",
  address: "Dhaka, Bangladesh",
  role: "owner",
});

console.log("profiles synced");

// Promote the QA admin directly. There is no public bootstrap API.
const { MongoClient } = await import("mongodb");

const fs = await import("node:fs");
const env = fs.readFileSync(
  "E:/Projects/Assignment B14 PH-9/rEntsy-server/.env",
  "utf8"
);
const uri = env.match(/MONGODB_CLIENT_URI=(.*)/)[1].trim();
const dbName = env.match(/DB_NAME=(.*)/)[1].trim();

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
await client.connect();
const db = client.db(dbName);

await db.collection("users").updateOne(
  { email: "qa-admin@rentsy.test" },
  { $set: { role: "admin", updatedAt: new Date() } }
);

const equipmentPayloads = [
  {
    equipmentName: "CAT 320D Excavator",
    description:
      "Heavy duty excavator suitable for construction and earthworks.",
    category: "Construction Equipment",
    location: "Dhaka",
    rentalPrice: 12000,
    rentalType: "daily",
    availableQuantity: 3,
    condition: "Excellent",
    brand: "CAT",
    model: "320D",
    imageUrl:
      "https://images.unsplash.com/photo-1503708928676-1cb796a0891e?auto=format&fit=crop&w=900&q=80",
    rentalTerms: "Minimum rental period is 2 days. Fuel is not included.",
  },
  {
    equipmentName: "Canon EOS R5 Kit",
    description:
      "Full-frame mirrorless camera with 24-105mm lens for events and product shoots.",
    category: "Photography Equipment",
    location: "Dhaka",
    rentalPrice: 3500,
    rentalType: "daily",
    availableQuantity: 2,
    condition: "Excellent",
    brand: "Canon",
    model: "EOS R5",
    imageUrl:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80",
    rentalTerms: "A valid ID must be submitted at pickup.",
  },
  {
    equipmentName: "Toyota Hiace Microbus",
    description:
      "12-seater microbus for group transport and event logistics.",
    category: "Vehicles",
    location: "Narsingdi",
    rentalPrice: 6500,
    rentalType: "daily",
    availableQuantity: 1,
    condition: "Good",
    brand: "Toyota",
    model: "Hiace",
    imageUrl:
      "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=900&q=80",
    rentalTerms: "Driver included. Fuel charged separately.",
  },
];

const createdEquipment = [];

for (const payload of equipmentPayloads) {
  const result = await api("/equipment", owner.token, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  createdEquipment.push(result.equipment);
}

console.log("equipment created:", createdEquipment.length);

await api(
  `/equipment/${createdEquipment[0]._id}/status`,
  admin.token,
  {
    method: "PATCH",
    body: JSON.stringify({ status: "approved" }),
  }
);

await api(
  `/equipment/${createdEquipment[1]._id}/status`,
  admin.token,
  {
    method: "PATCH",
    body: JSON.stringify({ status: "approved" }),
  }
);

console.log("equipment approved");

const today = new Date();
const start = new Date(today);
start.setDate(start.getDate() + 2);
const end = new Date(start);
end.setDate(end.getDate() + 4);

const booking = await api("/bookings", customer.token, {
  method: "POST",
  body: JSON.stringify({
    equipmentId: createdEquipment[1]._id,
    rentalStartDate: start.toISOString(),
    rentalEndDate: end.toISOString(),
    requiredQuantity: 1,
    contactNumber: "+8801722222222",
    deliveryAddress: "Narsingdi, Bangladesh",
    additionalNotes: "Please deliver before 9 AM.",
  }),
});

const booking2 = await api("/bookings", customer.token, {
  method: "POST",
  body: JSON.stringify({
    equipmentId: createdEquipment[0]._id,
    rentalStartDate: start.toISOString(),
    rentalEndDate: end.toISOString(),
    requiredQuantity: 1,
    contactNumber: "+8801722222222",
    deliveryAddress: "Narsingdi, Bangladesh",
    additionalNotes: "Site access available after 8 AM.",
  }),
});

console.log("bookings created:", booking.booking.bookingId, booking2.booking.bookingId);

await api(`/bookings/${booking.booking._id}/status`, owner.token, {
  method: "PATCH",
  body: JSON.stringify({ bookingStatus: "confirmed" }),
});

await api(`/bookings/${booking.booking._id}/status`, admin.token, {
  method: "PATCH",
  body: JSON.stringify({
    bookingStatus: "ongoing",
    paymentStatus: "paid",
  }),
});

await api(`/bookings/${booking2.booking._id}/status`, owner.token, {
  method: "PATCH",
  body: JSON.stringify({ bookingStatus: "completed" }),
});

await api(`/bookings/${booking2.booking._id}/status`, admin.token, {
  method: "PATCH",
  body: JSON.stringify({
    bookingStatus: "completed",
    paymentStatus: "paid",
  }),
});

console.log("bookings updated");

await api("/favorites", customer.token, {
  method: "POST",
  body: JSON.stringify({ equipmentId: createdEquipment[0]._id }),
});

await api("/favorites", customer.token, {
  method: "POST",
  body: JSON.stringify({ equipmentId: createdEquipment[1]._id }),
});

console.log("favorites created");

await client.close();

console.log(
  JSON.stringify(
    {
      password,
      adminToken: admin.token,
      ownerToken: owner.token,
      customerToken: customer.token,
    },
    null,
    2
  )
);
