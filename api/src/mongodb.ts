import mongoose from "mongoose";

let cached: { promise?: Promise<typeof mongoose>; conn?: typeof mongoose } = {};

function resolveDbName(uri: string): string {
  try {
    const u = new URL(uri);
    const path = (u.pathname || "").replace(/^\//, "");
    return (process.env.MONGODB_DBNAME || path || "mane").toLowerCase();
  } catch {
    return (process.env.MONGODB_DBNAME || "mane").toLowerCase();
  }
}

export async function connectMongo() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("Missing MONGODB_URI");
    const dbName = resolveDbName(uri);
    cached.promise = mongoose.connect(uri, { bufferCommands: false, dbName });
  }
  cached.conn = await cached.promise!;
  return cached.conn;
}
