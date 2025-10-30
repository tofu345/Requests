import { verifyToken } from "$lib/jwt";
import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
    const token = event.cookies.get("token");
    if (token) {
        const email = verifyToken(token);
        if (email) {
            event.locals.admin = email;
        }
    }

    const response = await resolve(event);
    return response;
};
