import express from "express";
import { ObjectId } from "mongodb";

import { getDB } from "../config/db.js";
import { loadUser } from "../middleware/loadUser.js";
import { verifyRole } from "../middleware/verifyRole.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

// --------------------------------------------------
// Constants
// --------------------------------------------------

const CATEGORIES = [
  "Construction Equipment",
  "Photography Equipment",
  "Vehicles",
  "Agriculture",
  "Electronics",
  "Events",
];

const CATEGORY_META = {
  "Construction Equipment": {
    slug: "construction-equipment",
    description:
      "Heavy duty excavators, concrete mixers, site lifts, and earthmoving gear.",
    imageUrl:
      "https://images.unsplash.com/photo-1503708928676-1cb796a0891e?auto=format&fit=crop&w=900&q=80",
  },

  "Photography Equipment": {
    slug: "photography-equipment",
    description:
      "Cameras, lenses, lighting rigs, gimbals, and studio production gear.",
    imageUrl:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80",
  },

  Vehicles: {
    slug: "vehicles",
    description:
      "Microbuses, cargo vans, utility trucks, and commercial transport vehicles.",
    imageUrl:
      "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=900&q=80",
  },

  Agriculture: {
    slug: "agriculture",
    description:
      "Farm tillers, harvesters, pumps, and agricultural field equipment.",
    imageUrl:
      "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=900&q=80",
  },

  Electronics: {
    slug: "electronics",
    description:
      "Generators, displays, power stations, diagnostic tools, and electronics.",
    imageUrl:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80",
  },

  Events: {
    slug: "events",
    description:
      "Audio systems, staging, lighting trusses, and event rental equipment.",
    imageUrl:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=80",
  },
};

const CONDITIONS = [
  "Excellent",
  "Good",
  "Fair",
  "Needs Maintenance",
];

const STATUSES = [
  "pending",
  "approved",
  "rejected",
];

const RENTAL_TYPES = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
];

const CATEGORY_STATUSES = [
  "pending",
  "approved",
  "rejected",
];

const DEFAULT_CATEGORY_IMAGE =
  "https://images.unsplash.com/photo-1503708928676-1cb796a0891e?auto=format&fit=crop&w=900&q=80";

// --------------------------------------------------
// Helpers
// --------------------------------------------------

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toPublicEquipment = (equipment) => {
  const publicEquipment = { ...equipment };

  delete publicEquipment.ownerId;
  delete publicEquipment.ownerEmail;
  delete publicEquipment.ownerPhone;

  return publicEquipment;
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
};

const toSlug = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const isOwnerOrAdmin = (equipment, user) => {
  return (
    user.role === "admin" ||
    equipment.ownerEmail === user.email
  );
};

// --------------------------------------------------
// Category helpers
// --------------------------------------------------

const getCategoryStats = async (db) => {
  const grouped = await db
    .collection("equipment")
    .aggregate([
      {
        $match: {
          status: "approved",
        },
      },
      {
        $group: {
          _id: "$category",
          equipmentCount: {
            $sum: 1,
          },
          imageUrl: {
            $first: "$imageUrl",
          },
        },
      },
    ])
    .toArray();

  const statsMap = new Map();

  grouped.forEach((entry) => {
    if (!entry._id) return;

    statsMap.set(String(entry._id).toLowerCase(), {
      count: toNumber(entry.equipmentCount, 0),

      imageUrl:
        typeof entry.imageUrl === "string"
          ? entry.imageUrl.trim()
          : "",
    });
  });

  return statsMap;
};

const serializeCategory = (doc, statsMap) => {
  const name = String(doc.name || "").trim();
  const stats = statsMap.get(name.toLowerCase()) || {
    count: 0,
    imageUrl: "",
  };

  const meta = CATEGORY_META[name] || {};

  return {
    _id: doc._id ? String(doc._id) : null,
    name,
    slug: doc.slug || toSlug(name),
    description:
      doc.description ||
      meta.description ||
      `Verified ${name} available for rent on rEntsy.`,
    imageUrl:
      stats.imageUrl ||
      doc.imageUrl ||
      meta.imageUrl ||
      DEFAULT_CATEGORY_IMAGE,
    equipmentCount: stats.count,
    status: doc.status || "approved",
    isBuiltIn: Boolean(doc.isBuiltIn),
    createdAt: doc.createdAt || null,
  };
};

/**
 * Returns the built-in categories followed by approved custom categories.
 * Pass `includeUnapproved` for owner/admin management screens.
 */
const getCategoryRecords = async (
  db,
  { includeUnapproved = false } = {}
) => {
  const statsMap = await getCategoryStats(db);

  const builtIn = CATEGORIES.map((name) => ({
    _id: null,
    name,
    slug: CATEGORY_META[name]?.slug || toSlug(name),
    description: CATEGORY_META[name]?.description || "",
    imageUrl: CATEGORY_META[name]?.imageUrl || DEFAULT_CATEGORY_IMAGE,
    status: "approved",
    isBuiltIn: true,
    createdAt: null,
  }));

  const customDocs = await db
    .collection("categories")
    .find({})
    .sort({ createdAt: -1 })
    .toArray();

  const seen = new Set(
    CATEGORIES.map((name) => name.toLowerCase())
  );

  const custom = [];

  customDocs.forEach((doc) => {
    const name =
      typeof doc.name === "string" ? doc.name.trim() : "";

    if (!name) return;

    const key = name.toLowerCase();

    if (seen.has(key)) return;

    seen.add(key);

    if (!includeUnapproved && doc.status !== "approved") {
      return;
    }

    custom.push({
      _id: doc._id,
      name,
      slug: doc.slug || toSlug(name),
      description: doc.description || "",
      imageUrl: doc.imageUrl || "",
      status: doc.status || "pending",
      isBuiltIn: false,
      createdAt: doc.createdAt || null,
    });
  });

  return [...builtIn, ...custom].map((doc) =>
    serializeCategory(doc, statsMap)
  );
};

const getApprovedCategoryNames = async (db) => {
  const records = await getCategoryRecords(db);

  return records.map((record) => record.name);
};

const isApprovedCategory = (categoryNames, value) => {
  const target = String(value || "").trim().toLowerCase();

  return categoryNames.some(
    (name) => name.toLowerCase() === target
  );
};


// ==================================================
// PUBLIC GET ROUTES
// ==================================================

// --------------------------------------------------
// GET /api/equipment/meta
// Public
// --------------------------------------------------

router.get("/meta", async (req, res) => {
  try {
    const db = getDB();

    const categories = await getApprovedCategoryNames(db);

    return res.status(200).json({
      success: true,
      categories,
      conditions: CONDITIONS,
      rentalTypes: RENTAL_TYPES,
      statuses: STATUSES,
    });
  } catch (error) {
    console.error("Get equipment meta error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load equipment metadata.",
    });
  }
});

// --------------------------------------------------
// GET /api/equipment/categories
// Public: approved categories only
// --------------------------------------------------

router.get("/categories", async (req, res) => {
  try {
    const db = getDB();

    const q =
      typeof req.query.q === "string"
        ? req.query.q.trim()
        : "";

    const categories = await getCategoryRecords(db);

    const filtered = q
      ? categories.filter(
          (item) =>
            item.name
              .toLowerCase()
              .includes(q.toLowerCase()) ||
            item.description
              .toLowerCase()
              .includes(q.toLowerCase())
        )
      : categories;

    return res.status(200).json({
      success: true,
      count: filtered.length,
      categories: filtered,
    });
  } catch (error) {
    console.error(
      "Get categories error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load equipment categories.",
    });
  }
});

// --------------------------------------------------
// GET /api/equipment/categories/manage
// Owner + Admin: includes pending / rejected categories
// --------------------------------------------------

router.get(
  "/categories/manage",
  verifyToken,
  loadUser,
  verifyRole("owner", "admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const categories = await getCategoryRecords(db, {
        includeUnapproved: true,
      });

      return res.status(200).json({
        success: true,
        count: categories.length,
        categories,
      });
    } catch (error) {
      console.error(
        "Manage categories error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to load categories.",
      });
    }
  }
);

// --------------------------------------------------
// POST /api/equipment/categories
// Owner + Admin: create a new category
// Owner categories start as "pending".
// --------------------------------------------------

router.post(
  "/categories",
  verifyToken,
  loadUser,
  verifyRole("owner", "admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const body = req.body || {};

      const name =
        typeof body.name === "string"
          ? body.name.trim()
          : "";

      if (name.length < 2 || name.length > 60) {
        return res.status(400).json({
          success: false,
          message:
            "Category name must be between 2 and 60 characters.",
        });
      }

      const slug = toSlug(name);

      if (!slug) {
        return res.status(400).json({
          success: false,
          message:
            "Category name must contain letters or numbers.",
        });
      }

      const builtInExists = CATEGORIES.some(
        (category) =>
          category.toLowerCase() === name.toLowerCase()
      );

      if (builtInExists) {
        return res.status(409).json({
          success: false,
          message: "That category already exists.",
        });
      }

      const existing = await db
        .collection("categories")
        .findOne({
          $or: [
            { slug },
            {
              name: {
                $regex: `^${escapeRegex(name)}$`,
                $options: "i",
              },
            },
          ],
        });

      if (existing) {
        return res.status(409).json({
          success: false,
          message: "That category already exists.",
        });
      }

      const now = new Date();

      const category = {
        name,
        slug,
        description:
          typeof body.description === "string"
            ? body.description.trim()
            : "",
        imageUrl:
          typeof body.imageUrl === "string"
            ? body.imageUrl.trim()
            : "",
        status:
          req.userRole === "admin"
            ? "approved"
            : "pending",
        createdBy: {
          id: req.dbUser._id.toString(),
          name: req.dbUser.name || "",
          email: req.dbUser.email || "",
          role: req.dbUser.role || req.userRole,
        },
        createdAt: now,
        updatedAt: now,
      };

      const result = await db
        .collection("categories")
        .insertOne(category);

      const statsMap = await getCategoryStats(db);

      return res.status(201).json({
        success: true,
        message:
          category.status === "approved"
            ? "Category created and approved."
            : "Category submitted for admin approval.",
        category: serializeCategory(
          {
            ...category,
            _id: result.insertedId,
          },
          statsMap
        ),
      });
    } catch (error) {
      console.error(
        "Create category error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to create category.",
      });
    }
  }
);

// --------------------------------------------------
// PATCH /api/equipment/categories/:id
// Admin: approve, reject, or edit a category
// --------------------------------------------------

router.patch(
  "/categories/:id",
  verifyToken,
  loadUser,
  verifyRole("admin"),
  async (req, res) => {
    try {
      const db = getDB();

      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID.",
        });
      }

      const category = await db
        .collection("categories")
        .findOne({
          _id: new ObjectId(req.params.id),
        });

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found.",
        });
      }

      const body = req.body || {};
      const update = { updatedAt: new Date() };

      if (body.status !== undefined) {
        if (!CATEGORY_STATUSES.includes(body.status)) {
          return res.status(400).json({
            success: false,
            message: "Invalid category status.",
          });
        }

        update.status = body.status;
      }

      if (body.name !== undefined) {
        const name =
          typeof body.name === "string"
            ? body.name.trim()
            : "";

        if (name.length < 2 || name.length > 60) {
          return res.status(400).json({
            success: false,
            message:
              "Category name must be between 2 and 60 characters.",
          });
        }

        const duplicate = await db
          .collection("categories")
          .findOne({
            _id: { $ne: category._id },
            name: {
              $regex: `^${escapeRegex(name)}$`,
              $options: "i",
            },
          });

        if (duplicate) {
          return res.status(409).json({
            success: false,
            message: "That category already exists.",
          });
        }

        update.name = name;
        update.slug = toSlug(name);
      }

      if (body.description !== undefined) {
        update.description =
          typeof body.description === "string"
            ? body.description.trim()
            : "";
      }

      if (body.imageUrl !== undefined) {
        update.imageUrl =
          typeof body.imageUrl === "string"
            ? body.imageUrl.trim()
            : "";
      }

      if (Object.keys(update).length <= 1) {
        return res.status(400).json({
          success: false,
          message: "Nothing to update.",
        });
      }

      await db
        .collection("categories")
        .updateOne(
          { _id: category._id },
          { $set: update }
        );

      const updated = await db
        .collection("categories")
        .findOne({ _id: category._id });

      const statsMap = await getCategoryStats(db);

      return res.status(200).json({
        success: true,
        message: "Category updated successfully.",
        category: serializeCategory(updated, statsMap),
      });
    } catch (error) {
      console.error(
        "Update category error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to update category.",
      });
    }
  }
);

// --------------------------------------------------
// DELETE /api/equipment/categories/:id
// Admin only
// --------------------------------------------------

router.delete(
  "/categories/:id",
  verifyToken,
  loadUser,
  verifyRole("admin"),
  async (req, res) => {
    try {
      const db = getDB();

      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID.",
        });
      }

      const category = await db
        .collection("categories")
        .findOne({
          _id: new ObjectId(req.params.id),
        });

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found.",
        });
      }

      const equipmentCount = await db
        .collection("equipment")
        .countDocuments({ category: category.name });

      if (equipmentCount > 0) {
        return res.status(400).json({
          success: false,
          message:
            "This category still has equipment. Reassign or remove those listings first.",
        });
      }

      await db
        .collection("categories")
        .deleteOne({ _id: category._id });

      return res.status(200).json({
        success: true,
        message: "Category deleted.",
      });
    } catch (error) {
      console.error(
        "Delete category error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to delete category.",
      });
    }
  }
);


// --------------------------------------------------
// GET /api/equipment
// PUBLIC approved equipment
// Search / filters / sorting
// --------------------------------------------------

router.get("/", async (req, res) => {
  try {
    const db = getDB();

    const {
      search = "",
      category = "",
      rentalType = "",
      minPrice,
      maxPrice,
      sort = "recent",
      limit,
    } = req.query;

    const filter = {
      status: "approved",
    };

    if (category) {
      filter.category = category;
    }

    if (RENTAL_TYPES.includes(rentalType)) {
      filter.rentalType = rentalType;
    }

    if (
      minPrice !== undefined ||
      maxPrice !== undefined
    ) {
      filter.rentalPrice = {};

      if (
        minPrice !== undefined &&
        minPrice !== ""
      ) {
        filter.rentalPrice.$gte =
          toNumber(minPrice);
      }

      if (
        maxPrice !== undefined &&
        maxPrice !== ""
      ) {
        filter.rentalPrice.$lte =
          toNumber(maxPrice);
      }
    }

    if (
      typeof search === "string" &&
      search.trim()
    ) {
      const pattern = new RegExp(
        escapeRegex(search.trim()),
        "i"
      );

      filter.$or = [
        {
          equipmentName: pattern,
        },
        {
          description: pattern,
        },
        {
          category: pattern,
        },
        {
          location: pattern,
        },
        {
          brand: pattern,
        },
      ];
    }

    const sortMap = {
      price_asc: {
        rentalPrice: 1,
      },

      price_desc: {
        rentalPrice: -1,
      },

      recent: {
        createdAt: -1,
      },

      oldest: {
        createdAt: 1,
      },

      name: {
        equipmentName: 1,
      },
    };

    const pageSize = Math.min(
      Math.max(
        toNumber(limit, 60),
        1
      ),
      200
    );

    const equipment = await db
      .collection("equipment")
      .find(filter)
      .sort(
        sortMap[sort] ||
          sortMap.recent
      )
      .limit(pageSize)
      .toArray();

    return res.status(200).json({
      success: true,
      count: equipment.length,
      equipment: equipment.map(
        toPublicEquipment
      ),
    });
  } catch (error) {
    console.error(
      "List equipment error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load equipment.",
    });
  }
});

// --------------------------------------------------
// GET /api/equipment/:id
// PUBLIC
// --------------------------------------------------

router.get("/:id", async (req, res, next) => {
  if (req.params.id === "manage") {
    return next();
  }

  try {
    if (
      !ObjectId.isValid(
        req.params.id
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid equipment ID.",
      });
    }

    const equipment =
      await getDB()
        .collection("equipment")
        .findOne({
          _id: new ObjectId(
            req.params.id
          ),

          status: "approved",
        });

    if (!equipment) {
      return res.status(404).json({
        success: false,
        message:
          "Equipment not found.",
      });
    }

    return res.status(200).json({
      success: true,
      equipment:
        toPublicEquipment(
          equipment
        ),
    });
  } catch (error) {
    console.error(
      "Get equipment error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load equipment.",
    });
  }
});

// ==================================================
// PROTECTED ROUTES
// ==================================================

// --------------------------------------------------
// GET /api/equipment/manage
// Owner: own equipment
// Admin: every equipment
// --------------------------------------------------

router.get(
  "/manage",
  verifyToken,
  loadUser,
  verifyRole("owner", "admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const {
        status = "",
        q = "",
      } = req.query;

      const filter = {};

      if (
        req.userRole !== "admin"
      ) {
        filter.ownerEmail =
          req.dbUser.email;
      }

      if (
        STATUSES.includes(status)
      ) {
        filter.status = status;
      }

      if (
        typeof q === "string" &&
        q.trim()
      ) {
        const pattern =
          new RegExp(
            escapeRegex(
              q.trim()
            ),
            "i"
          );

        filter.$or = [
          {
            equipmentName:
              pattern,
          },
          {
            category:
              pattern,
          },
          {
            location:
              pattern,
          },
          {
            brand:
              pattern,
          },
        ];
      }

      const equipment =
        await db
          .collection(
            "equipment"
          )
          .find(filter)
          .sort({
            createdAt: -1,
          })
          .limit(500)
          .toArray();

      return res.status(200).json({
        success: true,
        count:
          equipment.length,
        equipment:
          equipment.map(
            toPublicEquipment
          ),
      });
    } catch (error) {
      console.error(
        "Manage equipment error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to load equipment.",
      });
    }
  }
);

// --------------------------------------------------
// POST /api/equipment
// Owner + Admin
// --------------------------------------------------

router.post(
  "/",
  verifyToken,
  loadUser,
  verifyRole(
    "owner",
    "admin"
  ),
  async (req, res) => {
    try {
      const db = getDB();

      const body =
        req.body || {};

      const equipmentName =
        typeof body.equipmentName ===
        "string"
          ? body.equipmentName.trim()
          : "";

      const category =
        typeof body.category ===
        "string"
          ? body.category.trim()
          : "";

      if (
        !equipmentName ||
        !category
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Equipment name and category are required.",
        });
      }

      const approvedCategories =
        await getApprovedCategoryNames(db);

      if (
        !isApprovedCategory(
          approvedCategories,
          category
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Select an approved equipment category.",
        });
      }

      const rentalPrice =
        toNumber(
          body.rentalPrice,
          NaN
        );

      if (
        !Number.isFinite(
          rentalPrice
        ) ||
        rentalPrice < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A valid rental price is required.",
        });
      }

      const now =
        new Date();

      const equipment = {
        equipmentName,

        description:
          typeof body.description ===
          "string"
            ? body.description.trim()
            : "",

        category,

        location:
          typeof body.location ===
          "string"
            ? body.location.trim()
            : "",

        rentalPrice,

        rentalType:
          RENTAL_TYPES.includes(
            body.rentalType
          )
            ? body.rentalType
            : "daily",

        availableQuantity:
          Math.max(
            toNumber(
              body.availableQuantity,
              1
            ),
            0
          ),

        condition:
          CONDITIONS.includes(
            body.condition
          )
            ? body.condition
            : "Excellent",

        brand:
          typeof body.brand ===
          "string"
            ? body.brand.trim()
            : "",

        model:
          typeof body.model ===
          "string"
            ? body.model.trim()
            : "",

        imageUrl:
          typeof body.imageUrl ===
          "string"
            ? body.imageUrl.trim()
            : "",

        rentalTerms:
          typeof body.rentalTerms ===
          "string"
            ? body.rentalTerms.trim()
            : "",

        status:
          req.userRole ===
          "admin"
            ? "approved"
            : "pending",

        ownerId:
          req.dbUser._id.toString(),

        ownerName:
          req.dbUser.name,

        ownerEmail:
          req.dbUser.email,

        ownerPhone:
          req.dbUser.phone ||
          "",

        createdAt:
          now,

        updatedAt:
          now,
      };

      const result =
        await db
          .collection(
            "equipment"
          )
          .insertOne(
            equipment
          );

      return res.status(201).json({
        success: true,

        message:
          equipment.status ===
          "approved"
            ? "Equipment created successfully."
            : "Equipment submitted for approval.",

        equipment: {
          _id:
            result.insertedId,

          ...equipment,
        },
      });
    } catch (error) {
      console.error(
        "Create equipment error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to create equipment.",
      });
    }
  }
);

// --------------------------------------------------
// PATCH /api/equipment/:id
// Owner (own) + Admin
// --------------------------------------------------

router.patch(
  "/:id",
  verifyToken,
  loadUser,
  verifyRole(
    "owner",
    "admin"
  ),
  async (req, res) => {
    try {
      const db = getDB();

      if (
        !ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid equipment ID.",
        });
      }

      const equipment =
        await db
          .collection(
            "equipment"
          )
          .findOne({
            _id:
              new ObjectId(
                req.params.id
              ),
          });

      if (!equipment) {
        return res.status(404).json({
          success: false,
          message:
            "Equipment not found.",
        });
      }

      if (
        !isOwnerOrAdmin(
          equipment,
          req.dbUser
        )
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You can only update your own equipment.",
        });
      }

      const body =
        req.body || {};

      if (
        typeof body.category === "string" &&
        body.category.trim() &&
        body.category.trim() !== equipment.category
      ) {
        const approvedCategories =
          await getApprovedCategoryNames(db);

        if (
          !isApprovedCategory(
            approvedCategories,
            body.category
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Select an approved equipment category.",
          });
        }
      }

      const update = {
        updatedAt:
          new Date(),
      };

      const textFields = [
        "equipmentName",
        "description",
        "category",
        "location",
        "brand",
        "model",
        "imageUrl",
        "rentalTerms",
      ];

      textFields.forEach(
        (field) => {
          if (
            typeof body[field] ===
            "string"
          ) {
            update[field] =
              body[field].trim();
          }
        }
      );

      if (
        body.rentalPrice !==
        undefined
      ) {
        const price =
          toNumber(
            body.rentalPrice,
            NaN
          );

        if (
          !Number.isFinite(
            price
          ) ||
          price < 0
        ) {
          return res.status(400).json({
            success: false,
            message:
              "A valid rental price is required.",
          });
        }

        update.rentalPrice =
          price;
      }

      if (
        body.availableQuantity !==
        undefined
      ) {
        update.availableQuantity =
          Math.max(
            toNumber(
              body.availableQuantity,
              0
            ),
            0
          );
      }

      if (
        RENTAL_TYPES.includes(
          body.rentalType
        )
      ) {
        update.rentalType =
          body.rentalType;
      }

      if (
        CONDITIONS.includes(
          body.condition
        )
      ) {
        update.condition =
          body.condition;
      }

      if (
        req.userRole ===
          "admin" &&
        STATUSES.includes(
          body.status
        )
      ) {
        update.status =
          body.status;
      }

      if (
        update.equipmentName !==
          undefined &&
        !update.equipmentName
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Equipment name cannot be empty.",
        });
      }

      await db
        .collection(
          "equipment"
        )
        .updateOne(
          {
            _id:
              equipment._id,
          },
          {
            $set:
              update,
          }
        );

      const updatedEquipment =
        await db
          .collection(
            "equipment"
          )
          .findOne({
            _id:
              equipment._id,
          });

      return res.status(200).json({
        success: true,
        message:
          "Equipment updated successfully.",
        equipment:
          updatedEquipment,
      });
    } catch (error) {
      console.error(
        "Update equipment error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to update equipment.",
      });
    }
  }
);

// --------------------------------------------------
// PATCH /api/equipment/:id/status
// Admin approval
// --------------------------------------------------

router.patch(
  "/:id/status",
  verifyToken,
  loadUser,
  verifyRole("admin"),
  async (req, res) => {
    try {
      const db =
        getDB();

      const {
        status,
      } =
        req.body || {};

      if (
        !STATUSES.includes(
          status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid equipment status.",
        });
      }

      if (
        !ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid equipment ID.",
        });
      }

      const result =
        await db
          .collection(
            "equipment"
          )
          .updateOne(
            {
              _id:
                new ObjectId(
                  req.params.id
                ),
            },
            {
              $set: {
                status,
                updatedAt:
                  new Date(),
              },
            }
          );

      if (
        result.matchedCount ===
        0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Equipment not found.",
        });
      }

      return res.status(200).json({
        success: true,
        message:
          `Equipment ${status}.`,
      });
    } catch (error) {
      console.error(
        "Equipment status error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to update equipment status.",
      });
    }
  }
);

// --------------------------------------------------
// DELETE /api/equipment/:id
// Owner (own) + Admin
// --------------------------------------------------

router.delete(
  "/:id",
  verifyToken,
  loadUser,
  verifyRole(
    "owner",
    "admin"
  ),
  async (req, res) => {
    try {
      const db =
        getDB();

      if (
        !ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid equipment ID.",
        });
      }

      const equipment =
        await db
          .collection(
            "equipment"
          )
          .findOne({
            _id:
              new ObjectId(
                req.params.id
              ),
          });

      if (!equipment) {
        return res.status(404).json({
          success: false,
          message:
            "Equipment not found.",
        });
      }

      if (
        !isOwnerOrAdmin(
          equipment,
          req.dbUser
        )
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You can only delete your own equipment.",
        });
      }

      const activeBookings =
        await db
          .collection(
            "bookings"
          )
          .countDocuments({
            equipmentId:
              equipment._id.toString(),

            bookingStatus: {
              $in: [
                "pending",
                "confirmed",
                "ongoing",
              ],
            },
          });

      if (
        activeBookings > 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This equipment has active bookings and cannot be deleted.",
        });
      }

      await db
        .collection(
          "equipment"
        )
        .deleteOne({
          _id:
            equipment._id,
        });

      await db
        .collection(
          "favorites"
        )
        .deleteMany({
          equipmentId:
            equipment._id.toString(),
        });

      return res.status(200).json({
        success: true,
        message:
          "Equipment deleted successfully.",
      });
    } catch (error) {
      console.error(
        "Delete equipment error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to delete equipment.",
      });
    }
  }
);

export default router;