import * as bcrypt from "bcrypt-ts";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "$env/static/private";
import { PrismaClient } from "@prisma/client";
import type Prisma from "@prisma/client";

const prisma = new PrismaClient();
let cache: Prisma.Post[] | null = null;
export let lastChange: Date = new Date(); // last (create, edit, delete) made

function clearCache() {
    cache = null;
    lastChange = new Date();
}

export function twoSundaysAgo(): Date {
    let date = new Date();
    // normalise to sunday with getDay() and walk back two sundays
    date.setDate(date.getDate() - date.getDay() - 14);
    date.setUTCHours(0);
    date.setUTCMinutes(0);
    date.setUTCSeconds(0);
    return date;
}

export async function getPosts() {
    if (cache != null) {
        return cache;
    }

    cache = await prisma.post.findMany({ orderBy: { createdAt: "desc" } });
    return cache;
}

export async function createPost(
    text: string,
    postType: Prisma.PostType,
): Promise<Prisma.Post> {
    clearCache();
    return prisma.post.create({
        data: {
            text: text,
            postType: postType,
        },
    });
}

export async function editPost(
    id: number,
    text: string,
    postType: Prisma.PostType,
): Promise<Prisma.Post> {
    clearCache();
    return prisma.post.update({
        where: { id },
        data: { text, postType },
    });
}

export async function deletePost(id: number) {
    clearCache();
    return prisma.post.deleteMany({ where: { id } });
}

export async function verifyAdminPassword(
    email: string,
    password: string,
): Promise<boolean> {
    const admin = await getAdmin(email);
    if (admin === null) {
        return false;
    }
    return await bcrypt.compare(password, admin.password);
}

export async function getAdmin(email: string): Promise<Prisma.Admin | null> {
    return prisma.admin.findFirst({ where: { email } });
}

async function createAdmin(
    email: string,
    password: string,
): Promise<Prisma.Admin> {
    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);
    const admin = await prisma.admin.create({
        data: { email, password: hash },
    });
    return admin;
}

async function main() {
    let admins = await prisma.admin.count();
    if (admins === 0 && ADMIN_EMAIL && ADMIN_PASSWORD) {
        createAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
    }

    let deletedPosts = await prisma.post.deleteMany({
        where: { createdAt: { lte: twoSundaysAgo() } },
    });
    if (deletedPosts.count > 0) {
        console.log(`> Deleted ${deletedPosts.count} old posts`);
    }
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
