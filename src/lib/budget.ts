import "server-only";
import { BlobPreconditionFailedError, get, put } from "@vercel/blob";

// A daily ceiling on the Clocked credits the public demo may spend, shared by
// every server instance. The count lives in one small private blob per UTC
// day and is updated with a conditional write (ETag), so two instances cannot
// overwrite each other's spend. Without a blob store (local dev) the count is
// kept in memory.

export const DAILY_CREDITS = Number(process.env.GATEHOUSE_DAILY_CREDITS ?? 600);
/** The examples cost 6 to 11 credits a screening and a long real issue about 35; plan for that. */
export const RESERVE_PER_SCREENING = 40;

type Usage = { day: string; credits: number; screenings: number };

const memory = new Map<string, Usage>();

export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

const blobStore = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const path = (day: string) => `usage/${day}.json`;

async function read(day: string): Promise<{ usage: Usage; etag: string | null }> {
  const empty = { day, credits: 0, screenings: 0 };
  if (!blobStore()) return { usage: memory.get(day) ?? empty, etag: null };
  const got = await get(path(day), { access: "private", useCache: false });
  if (!got || got.statusCode !== 200 || !got.stream) return { usage: empty, etag: null };
  const usage = (await new Response(got.stream).json()) as Usage;
  return { usage, etag: got.blob.etag };
}

/** True when the demo may spend another screening's worth of credits today. */
export async function canSpend(day = today()): Promise<boolean> {
  try {
    const { usage } = await read(day);
    return usage.credits + RESERVE_PER_SCREENING <= DAILY_CREDITS;
  } catch (err) {
    // If the counter cannot be read, do not spend: the key's credits matter
    // more than one visitor's request.
    console.error("budget read failed", err);
    return false;
  }
}

/** Add what a screening actually cost (X-Clocked-Credits) to today's count. */
export async function record(credits: number | null, day = today()): Promise<void> {
  const spent = credits ?? RESERVE_PER_SCREENING;
  if (!blobStore()) {
    const u = memory.get(day) ?? { day, credits: 0, screenings: 0 };
    memory.set(day, { day, credits: u.credits + spent, screenings: u.screenings + 1 });
    return;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { usage, etag } = await read(day);
      const next: Usage = { day, credits: usage.credits + spent, screenings: usage.screenings + 1 };
      await put(path(day), JSON.stringify(next), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
      });
      return;
    } catch (err) {
      const conflict = err instanceof BlobPreconditionFailedError || /already exists/i.test(String((err as Error).message));
      if (!conflict || attempt === 4) {
        console.error("budget write failed", err);
        return;
      }
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
    }
  }
}
