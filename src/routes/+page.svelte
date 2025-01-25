<script lang="ts">
import axios from '$lib/axios';
import { onMount } from 'svelte';
import { slide, fade } from 'svelte/transition';
import { flip } from 'svelte/animate';
import moment from 'moment';

import SelectButton from '$lib/SelectButton.svelte';
import { deleteCookie } from '$lib/cookie';

import type { PageData } from './$types';
import type { AxiosResponse } from 'axios';
import type Prisma from '@prisma/client';
import { postTypeEmoji } from '$lib/utils';

let { data }: { data: PageData }  = $props();
let loading = $state(true);

type PostType = PageData["posts"];

let posts: PostType = $state([]);
let oldPosts: PostType = $state([]);
let oldPostsShown = $state(false);

function parseDate(date: string | Date): Date {
    if (typeof date === 'string') {
        return new Date(date);
    }
    return date;
}

function filterPosts(postList: PostType): void {
    let today = new Date();
    let dayOfWeek = today.getDay();
    let dayOfMonth = today.getDate() - (dayOfWeek == 0 ? 6 : dayOfWeek)
    let lastSunday = new Date(today.getFullYear(), today.getMonth(), dayOfMonth, 0, 0, 0);

    posts = postList.filter(v => parseDate(v.createdAt) > lastSunday);
    oldPosts = postList.filter(v => parseDate(v.createdAt) <= lastSunday);
}

async function deletePost(id: number) {
    if (!window.confirm("Are you sure?")) {
        return;
    }

    const res: AxiosResponse = await axios
        .post("/api/delete-post", { id })
        .then((res) => res)
        .catch((err) => err.response);
    if (res.status === 200) {
        posts = posts.filter(v => v.id != id);
    }
}

let userEditables: {id: string, postId: number}[] = [];

function editable(postId: number): boolean {
    for (const el of userEditables) {
        if (el.postId === postId) return true;
    }
    return false;
}

// undefined for admin
let currentPostEdit: {editId: string | undefined, postId: number, postListIdx: number} | null = $state(null);
const editing = (id: number) => currentPostEdit !== null && currentPostEdit.postId == id;

async function startPostEdit(postId: number) {
    if (currentPostEdit !== null) {
        return newNotification("Already editing", NotifType.warning, 2000);
    }
    if (text !== "") {
        return newNotification("Unsubmitted request", NotifType.warning);
    }

    let idx = posts.findIndex(el => el.id == postId);
    let post = posts[idx];
    currentPostEdit = { postId, postListIdx: idx, editId: userEditables.find(el => el.postId == postId)?.id };

    text = post.text;
    currentState = States.textarea;
    postType = null;
}

async function completePostEdit() {
    const res: AxiosResponse = await axios
        .post("/api/edit-post", {
            id: currentPostEdit!.editId,
            postId: currentPostEdit!.postId,
            text, postType,
        })
        .then(res => res)
        .catch(err => err.response);

    if (res.status !== 200) {
        currentState = States.textarea;
        newNotification("Unable to perform update", NotifType.error);
        console.error(res);
        return;
    }

    posts[currentPostEdit!.postListIdx] = res.data.post;
    abortPostEdit();
}

async function abortPostEdit() {
    currentPostEdit = null;
    text = "";
    postType = null;
    currentState = States.button;
}

const States = {
    button: 0,
    textarea: 1,
    select: 2,
    submit: 3
};
let currentState = $state(States.button);
let disabled = $derived(currentState == States.submit);
let postType: Prisma.PostType | null = null;
let submitErr = $state(false);
let text = $state("");

async function submitOnShiftEnter(e: KeyboardEvent) {
    if (e.key == "Enter" && e.shiftKey) {
        currentState = States.select;
    }
}

// css animation
function errorAnimation() {
    submitErr = true;
    setTimeout(() => {
        submitErr = false;
    }, 1000);
}

async function submitForm(_event: Event) {
    if (currentPostEdit !== null) {
        return completePostEdit();
    }

    if (text === "") {
        return errorAnimation();
    }

    if (postType === null) {
        console.error("invalid post type");
        return;
    }

    currentState = States.submit;
    submitErr = false;

    const res: AxiosResponse = await axios
        .post("/api/create-post", {
            text: text.trim(),
            postType: postType
        })
        .then((res) => res)
        .catch((err) => err.response);
    postType = null;

    if (res.status === 400) {
        currentState = States.textarea;
        newNotification(res.data.message || res.data, NotifType.error);
        return errorAnimation();
    }

    let post = res.data.post;
    userEditables.push({id: res.data.editId, postId: post.id});
    posts.splice(0, 0, post); // insert at beginning
    text = "";
    currentState = States.button;
}

function autoExpandTextarea(obj: any) {
    obj.style.height = Math.min(obj.scrollHeight, 150) + "px";
}

function focusOnCreate(el: HTMLTextAreaElement) {
    autoExpandTextarea(el);
    el.focus();
}

const NotifType = {
    warning: 0,
    error: 1,
    info: 2
}
let notifications: {id: number, type: number, msg: string}[] = $state([]);

function newNotification(msg: string, type: number, timeout?: number) {
    if (typeof msg == 'object') msg = JSON.stringify(msg);
    let id = Math.max(...notifications.map(v => v.id)) + 1;
    if (notifications.length === 0) {
        id = 0;
    }
    notifications.push({ id, type, msg });
    if (timeout) {
        setTimeout(() => delNotifById(id), timeout);
    }
}

function delNotifById(id: number) {
    notifications = notifications.filter(v => v.id !== id);
}

let runInterval = true;

onMount(async () => {
    loading = false;
    filterPosts(data.posts);

    window.addEventListener("blur", () => runInterval = false);
    window.addEventListener("focus", () => runInterval = true);
    setInterval(async function(){
        if (!runInterval) return;

        const res: AxiosResponse = await axios
            .get("/api/get-posts")
            .then((res) => res)
            .catch((err) => err.response);

        if (res.status === 200) {
            filterPosts(res.data);
        }
    }, 60000); // every min
});
</script>

<!-- good enough for now i guess -->
<div id="notif-wrapper" class="flex flex-col gap-3 fixed top-0 right-0 p-3 z-50">
    {#each notifications as notif (notif.id)}
        <div
            in:fade={{ delay: 200, duration: 200 }}
            out:fade={{ duration: 200 }}
            animate:flip={{ delay: 200, duration: 200 }}
            class="h-full w-[15rem] p-3 pr-2 flex gap-4 justify-between items-center rounded-lg"
            class:bg-green-800={notif.type == NotifType.info}
            class:bg-yellow-800={notif.type == NotifType.warning}
            class:bg-red-800={notif.type == NotifType.error}
        >
            <p class="w-[90%] whitespace-pre-wrap text-sm"> {notif.msg} </p>
            <button class="h-[100%] flex justify-center items-center" onclick={() => delNotifById(notif.id)}>
                <img src="/close.svg" alt="close" />
            </button>
        </div>
    {/each}
</div>

{#if data.admin}
    <button
        class="absolute top-0 right-0 m-2 text-blue-300"
        onclick={() => {
            deleteCookie("token");
            window.location.reload();
        }}>
        Admin Logout
    </button>
{/if}

<div class="w-full flex justify-center mt-4">
    <a href="https://www.ikon.church">
        <img class="h-10" src="/IKON-Logo.png" alt="IKON" />
    </a>
</div>
<div class="w-full flex justify-center mb-2">
    <p class="text-sm">Prayer and Praise Requests</p>
</div>

<div class="h-fit w-full p-2 sm:flex sm:justify-center">
    <div class="p-1 py-3 rounded-lg border border-gray-500 sm:w-[80%] min-h-40 relative">
        {#if loading}
            <div class="w-full h-36 flex justify-center items-center text-sm italic">
                Loading...
            </div>
        {:else}
            <div class="flex flex-col gap-2">
                <!-- PostList -->
                {#each posts as post (post.id)}
                    <div
                        class="w-full flex"
                        in:fade={{ delay: 200, duration: 200 }}
                        out:fade={{ duration: 200 }}
                        animate:flip={{ delay: 200, duration: 200 }}
                    >
                        <div class="text-sm m-1 mr-2 self-center"> {postTypeEmoji(post.postType)} </div>
                        <div class="bg-gray-600 rounded h-fit my-auto">
                            <p style="overflow-wrap: break-word;" class="whitespace-pre-wrap p-1 px-2">
                                {post.text}
                            </p>
                        </div>
                        <div class="mx-2 flex flex-col w-fit gap-1">
                            <div class="h-full">
                                <div
                                    class="flex gap-2"
                                    class:flex-col={editing(post.id) && post.text.length > 38}>
                                    {#if data.admin}
                                        <button
                                            onclick={() => deletePost(post.id)}
                                            class="w-fit bg-red-400 rounded border border-transparent">
                                            <img src="/trash.svg" alt="trash" />
                                        </button>
                                    {/if}
                                    {#if editing(post.id)}
                                        <button
                                            onclick={() => abortPostEdit()}
                                            class="bg-red-400 p-1 flex gap-1 justify-center items-center rounded border border-transparent">
                                            <p class="text-black text-sm leading-none"> Cancel </p>
                                            <img width="10" src="/close.svg" alt="" />
                                        </button>
                                    {:else if data.admin || editable(post.id)}
                                        <button
                                            onclick={() => startPostEdit(post.id)}
                                            class="bg-blue-400 p-1 flex justify-center items-center rounded border border-transparent">
                                            <img width="10" src="/edit.svg" alt="edit" />
                                        </button>
                                    {/if}
                                </div>
                            </div>
                            <p class="text-xs text-gray-300 w-fit whitespace-nowrap">
                                {moment(post.createdAt).format("ddd Do MMM")}
                            </p>
                        </div>
                    </div>
                {:else}
                    <div class="w-full h-36 flex justify-center items-center text-sm italic">
                        None yet...
                    </div>
                {/each}
            </div>

            {#if oldPosts.length != 0}
                <div class="relative h-[36px] my-1 ml-2">
                    <button
                        class="h-full w-full"
                        onclick={() => oldPostsShown = !oldPostsShown}
                        out:fade={{ delay: 300, duration: 0 }}
                    >
                        <div class="p-2 absolute -top-0 -left-[0.7rem] flex items-center gap-[0.4rem] cursor-pointer text-sm w-full">
                            {#if oldPostsShown}
                                <img src="/caret-down.svg" alt="caret-down" />
                            {:else}
                                <img src="/caret-right.svg" alt="caret-right" />
                            {/if}
                            <p> Last week </p>
                        </div>
                    </button>
                </div>
            {/if}

            {#if oldPostsShown && oldPosts.length != 0}
                <div transition:slide={{ duration: 300 }}>
                    <div class="flex flex-col gap-2">
                        <!-- OldPostList -->
                        {#each oldPosts as post (post.id)}
                            <div
                                class="w-full flex"
                                in:fade={{ delay: 200, duration: 200 }}
                                out:fade={{ duration: 200 }}
                                animate:flip={{ delay: 200, duration: 200 }}
                            >
                                <div class="text-sm m-1 mr-2 self-center"> {postTypeEmoji(post.postType)} </div>
                                <div class="bg-gray-600 rounded h-fit my-auto">
                                    <p
                                        style="overflow-wrap: break-word;"
                                        class="whitespace-pre-wrap p-1 px-2">
                                        {post.text}
                                    </p>
                                </div>
                                <div class="mx-2 flex flex-col w-fit">
                                    <div class="h-full">
                                        {#if data.admin}
                                            <button
                                                onclick={() => deletePost(post.id)}
                                                class="bg-red-400 rounded border border-transparent">
                                                <img src="/trash.svg" alt="trash" />
                                            </button>
                                        {/if}
                                    </div>
                                    <p class="text-xs text-gray-300 w-fit whitespace-nowrap">
                                        {moment(post.createdAt).format("ddd Do MMM")}
                                    </p>
                                </div>
                            </div>
                        {:else}
                            <div class="w-full h-36 flex justify-center items-center text-sm italic">
                                None yet...
                            </div>
                        {/each}
                    </div>

                </div>
            {/if}
        {/if}
    </div>
</div>

<div class="w-full p-2 lg:mx-50 mb-2 flex justify-center">
    {#if currentState == States.submit}
        <div
            class="flex justify-center items-center bg-gray-600 rounded-lg h-[60px] w-full sm:w-[80%] px-1 text-sm">
            <div class="loader"></div>
        </div>

    {:else if currentState == States.select}
        <div
            class="flex justify-between items-center bg-gray-600 rounded-lg h-[60px] w-full sm:w-[80%] px-1 text-sm">
            <SelectButton
                onclick={(e) => { postType = "PrayerRequest"; submitForm(e); }}
                emoji={postTypeEmoji("PrayerRequest")}
                str="Prayer Request"
            />
            <button
                class="w-8 h-full mx-5 rounded"
                onclick={() => { currentState = States.textarea; }}>
                <img
                    id="errorSvg"
                    src="/error.svg"
                    alt="error img"
                    class="w-full"
                />
            </button>
            <SelectButton
                onclick={(e) => { postType = "PraiseReport"; submitForm(e); }}
                emoji={postTypeEmoji("PraiseReport")}
                str="Praise Report"
            />
        </div>

    {:else if currentState == States.textarea}
        <div
            class="relative w-full sm:w-[80%] h-fit p-2 rounded-lg border-2 border-gray-400 bg-gray-600 flex justify-between">
            <textarea
                {disabled}
                bind:value={text}
                oninput={(e) => autoExpandTextarea(e.target)}
                onkeypress={submitOnShiftEnter}
                rows="1"
                placeholder=""
                id="textarea"
                class="bg-transparent w-full outline-none resize-none mr-[30px]"
                use:focusOnCreate
                maxlength="280"
            ></textarea>
            <button
                onclick={() => {
                    if (text.trim() === "") { return errorAnimation(); }
                    currentState = States.select;
                }}
                class="bg-transparent p-1 absolute top-[0.25rem] right-1">
                {#if submitErr}
                    <img
                        id="errorSvg"
                        src="/error.svg"
                        alt="error img"
                        class="boop pos-y-wiggle"
                    />
                {:else}
                    <img src="/send.svg" alt="send img"/>
                {/if}
            </button>
        </div>

    {:else}
        <button
            onclick={() => {currentState = States.textarea}}
            class="outline-none border-2 border-transparent hover:border-gray-400 bg-gray-600 rounded-lg h-[44px] w-full sm:w-[80%] p-2 text-sm"
        > Submit Request </button>
    {/if}
</div>

<style>
.resize-none{
    resize: none;
}

.loader {
    width: 24px;
    height: 24px;
    border: 2px solid lightgray;
    border-bottom-color: transparent;
    border-radius: 50%;
    display: inline-block;
    box-sizing: border-box;
    animation: rotation 1s linear infinite;
}

@keyframes rotation {
0% {
    transform: rotate(0deg);
    -o-transform: rotate(0deg);
    -ms-transform: rotate(0deg);
    -moz-transform: rotate(0deg);
    -webkit-transform: rotate(0deg);
}
100% {
    transform: rotate(360deg);
    -o-transform: rotate(360deg);
    -ms-transform: rotate(360deg);
    -moz-transform: rotate(360deg);
    -webkit-transform: rotate(360deg);
}
}

@keyframes pos-y-wiggle {
0% {
    transform: translateX(0px);
    -o-transform: translateX(0px);
    -ms-transform: translateX(0px);
    -moz-transform: translateX(0px);
    -webkit-transform: translateX(0px);
}
20% {
    transform: translateX(10px);
    -o-transform: translateX(10px);
    -ms-transform: translateX(10px);
    -moz-transform: translateX(10px);
    -webkit-transform: translateX(10px);
}
40% {
    transform: translateX(-10px);
    -o-transform: translateX(-10px);
    -ms-transform: translateX(-10px);
    -moz-transform: translateX(-10px);
    -webkit-transform: translateX(-10px);
}
60% {
    transform: translateX(5px);
    -o-transform: translateX(5px);
    -ms-transform: translateX(5px);
    -moz-transform: translateX(5px);
    -webkit-transform: translateX(5px);
}
80% {
    transform: translateX(-5px);
    -o-transform: translateX(-5px);
    -ms-transform: translateX(-5px);
    -moz-transform: translateX(-5px);
    -webkit-transform: translateX(-5px);
}
90% {
    transform: translateX(1px);
    -o-transform: translateX(1px);
    -ms-transform: translateX(1px);
    -moz-transform: translateX(1px);
    -webkit-transform: translateX(1px);
}
95% {
    transform: translateX(-1px);
    -o-transform: translateX(-1px);
    -ms-transform: translateX(-1px);
    -moz-transform: translateX(-1px);
    -webkit-transform: translateX(-1px);
}
100% {
    transform: translateX(0px);
    -o-transform: translateX(0px);
    -ms-transform: translateX(0px);
    -moz-transform: translateX(0px);
    -webkit-transform: translateX(0px);
}
}

.boop {
    display: inline-block;
    animation-duration: 0.3s;
    animation-play-state: paused;
    animation-fill-mode: forwards;
}
.boop.pos-y-wiggle {
    animation-name: pos-y-wiggle;
    animation-play-state: running;
}
</style>
