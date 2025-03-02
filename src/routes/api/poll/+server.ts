import { json } from "@sveltejs/kit";
import { lastChange } from "$lib/prisma";

export async function GET() {
    return json(lastChange);
}
