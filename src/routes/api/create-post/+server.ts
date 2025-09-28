import Joi from "joi";
import { error as errorRes, json, type RequestHandler } from "@sveltejs/kit";

import { createPost } from "$lib/prisma";
import { makeEditId, editables } from "$lib/editable";

// js skill issues
import { Prisma as PrismaObj } from "@prisma/client";
import Prisma from "@prisma/client";
import { maxTextLength } from "$lib/constants";

const postSchema = Joi.object({
    text: Joi.string().max(maxTextLength).required(),
    postType: Joi.string()
        .valid(...Object.values(Prisma.PostType))
        .required(),
});

export const POST: RequestHandler = async function ({ request }) {
    const data = await request.json();
    let { error, value } = postSchema.validate({
        text: data.text,
        postType: data.postType,
    });
    if (error !== undefined) {
        return errorRes(400, error.details.map((v) => v.message).join("\n"));
    }

    let post = null;
    try {
        post = await createPost(value.text, value.postType);
    } catch (e) {
        if (e instanceof PrismaObj.PrismaClientKnownRequestError) {
            return errorRes(400, e);
        }
        throw e;
    }

    let editId = makeEditId();
    editables.push({ editId, postId: post.id });

    return json({ post, editId });
};
