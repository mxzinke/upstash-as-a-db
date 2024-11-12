# Upstash-as-a-DB

**Ever needed a simple database to store flexible data in a structured way with a clear type-safe interface?**

This package has been created to interact with [Upstash Redis Service](https://upstash.com) and make it work as a database. Ideal for data processing applications or small projects.

**The package is able to:**

- Production-ready and type-safe way to connect to Upstash Redis Databases.
- Provide additional search indexes (e.g. for virtual relations).
- Detecting concurrent updates, which could cause inconsistency.
- High standard e2e-encryption, preventing possible data leaks.

## Why does it exist?

The [`@upstash/redis`](https://github.com/upstash/redis-js) package has already a nice interface, but handling the different `set`'s and `get`'s could get messy over time.

Also, a big issue was the missing encryption to prevent leaking sensitive customer data.

That's why the package has a `Collection` interface which can be used to handle each data type individually, fully type-safe and if needed with E2E Encryption (means only the app can read the data in Redis).

## Installation

```bash
bun add @coin-mirror/upstash-as-a-db
# OR
pnpm add @coin-mirror/upstash-as-a-db
# OR
yarn add @coin-mirror/upstash-as-a-db
# OR
npm install @coin-mirror/upstash-as-a-db
```

You can generate the secrets and vector for encryption like this:

```bash
# For Secret (at least 32 bytes)
openssl rand -base64 32

# For IV (at least 16 bytes)
openssl rand -base64 16
```

## Usage

It's recommended to use Typescript to profit from extra type-safety.

```typescript
import Collection from "upstash-as-a-db";
import { Redis } from "@upstash/redis";

// Init the redis instance as usual
const redis = new Redis();

interface SensitiveCustomer {
  id: string;
  customerName: string;
  customerAddress: {
    // ...
  };
  paymentToken: string;
  stripeCustomerId: string;
}

// Init the Collection instance with
const customers = new Collection<SensitiveCustomer>(
  redis, // The redis instance
  {
    // The redis key prefix, e.g. id will be `customers:<id>` (default none)
    keyPrefix: "customers",

    // Default TTL of every key set, excl. from `setex` (default none)
    defaultTTL: 600,

    // When set, this will be used to encrypt/decrypt the data entries.
    // Please note, the "id" parameter (main index) and other indexes are not encrypted!
    // By default disabled (undefined = disabled)
    enableEncryption: {
      secret: process.env.INTERNAL_ENCRYPTION_SECRET!, // Recommended: Use ENV-Variables to inject, don't hardcode.
      iv: process.env.INTERNAL_ENCRYPTION_IV!,
    },
  },
);

// Additional Search Index for later search or to form virtual relations.
// (This needs to be set before first insert)
const stripeCustomersIdx = customers.addIndex(
  "stripeCustomerId", // Key of your type, where a search index should be set
);

// Creating a first customer to the database, will get added to the index automatically.
await customers.set({
  id: "first-customer"
  name: "John Doe",
  customerAddress: {
    line: "71 World-Trade-Center",
    city: "New York",
    postalCode: "10007",
    state: "NY",
    country: "US"
  },
  paymentToken: "very-secret-token",
  stripeCustomerId: "c_12345678934567"
})

// Searching by ID
const firstCustomer = await customers.get("first-customer");

// Searching by other field
const stripeCustomer = await stripeCustomersIdx.getItems("c_12345678934567")

// Persisting (since default TTL is set in Collection)
await customers.persist("first-customer")

// Deleting the object
await customers.delete("first-customer")
```

You see, it's very straight forward. In case of questions, please open any issues.

## Limits & Constraints

**Important security related note:** The main index (`id`-value) and other index values are not encrypted.

The package was tried to made very safe, by detecting concurrent updates or encrypting data. The package is used in production and not made any issues so far. But still, everyone would be happy if you catch the last bugs in the code. 😉

The underlaying Upstash Database is very limited in space, so it is not made for very big datasets. _But that's on your plate._

**Beyond Upstash the package is currently not working with `ioredis` package or similar ones!**

## Development

This project is using **Bun.js** as a package manager and for running the project.
