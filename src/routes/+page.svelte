<script lang="ts">
import { flip } from 'svelte/animate';
import { onMount } from 'svelte';
import { slide, fade } from 'svelte/transition';

import Post from '$lib/client/Post.svelte';
import axios from '$lib/client/axios';
import { deleteCookie } from '$lib/client/cookie';
import { maxTextLength } from '$lib/client/constants';

import type { PageData } from './$types';
import type { AxiosResponse } from 'axios';
import type Prisma from '@prisma/client';
import type { Edit } from '$lib/server/editable';

type Posts = Prisma.Post[];

let { data }: { data: PageData } = $props();

const isAdmin = data.admin !== null && data.admin !== "";

let posts: Posts = $state([]);
let oldPosts: Posts = $state([]);
let oldPostsShown = $state(true);

function parseDate(date: string | Date): Date {
    if (typeof date === 'string') return new Date(date);
    return date; // surely it can't be anything else?
}

// Store all posts made before the last sunday in [oldPosts] and those since in
// [posts].
function setPostList(list: Posts): void {
    let today = new Date();
    let dayOfWeek = today.getDay(); // 0 on sundays.
    // day of the month of the last sunday.
    let dayOfMonth = today.getDate() - (dayOfWeek == 0 ? 6 : dayOfWeek);
    let lastSunday = new Date(today.getFullYear(), today.getMonth(), dayOfMonth, 0, 0, 0);

    posts = list.filter(v => parseDate(v.createdAt) > lastSunday);
    oldPosts = list.filter(v => parseDate(v.createdAt) <= lastSunday);
}

async function fetchPosts() {
    const res: AxiosResponse = await axios
        .get("/api/get-posts")
        .then((res) => res)
        .catch((err) => err.response);
    if (res?.status === 200) {
        setPostList(res.data);
    }
}

const States = {
    button: 0,
    textarea: 1,
    select: 2,
    submit: 3
};
let currentState = $state(States.button);
let textArea = $state("");
let textAreaDisabled = $derived(currentState == States.submit);
let postType: Prisma.PostType | null = null;
let submitError = $state(false);

let lastPoll = new Date();

let currentEdit: number | null = $state(null);
// see `src/lib/server/editable.ts`
let edits: Map<number, Edit> = $state(new Map());

function getEditIds() {
    const data = localStorage.getItem('editable');
    if (data) {
        const editsArray: [number, Edit][] = JSON.parse(data);
        for (const [id, edit] of editsArray) {
            // keep valid edits
            if (new Date() < parseDate(edit.expiration)) {
                edits.set(id, edit);
            }
        }
    }
}
function storeEditIds() {
    localStorage.setItem('editable', JSON.stringify(Array.from(edits.entries())));
}

async function startEdit(postId: number) {
    if (currentEdit !== null) {
        return newNotification("Already editing another post",
                               NotifType.warning, 2000);
    }
    if (textArea.trim() !== "") {
        currentState = States.textarea;
        return newNotification("You have unsaved changes\nDelete them to continue",
                               NotifType.warning);
    }

    let post = posts.find(el => el.id == postId)
            || oldPosts.find(el => el.id == postId);
    if (post === undefined) {
        return newNotification("The post you are trying to edit is nowhere to be found",
                               NotifType.error);
    }

    currentEdit = post.id;
    textArea = post.text;
    currentState = States.textarea;
    postType = null;
}

async function submitEdit() {
    if (currentEdit === null) {
        console.error("cannot submit empty post edit");
        return;
    }

    const res: AxiosResponse = await axios
        .post("/api/edit-post", {
            editId: edits.get(currentEdit)?.id,
            postId: currentEdit,
            text: textArea, postType,
        })
        .then(res => res)
        .catch(err => err.response);

    if (res.status !== 200) {
        currentState = States.textarea;
        newNotification("Failed to update post", NotifType.error);
        console.error(res);

        // the editId is not present on the server, delete it.
        edits.delete(currentEdit);
        storeEditIds();

        resetInput();
        return;
    }

    const postId = currentEdit;
    let index = posts.findIndex(el => el.id == postId);
    if (index !== -1) {
        posts[index] = res.data.post;
    } else {
        index = oldPosts.findIndex(el => el.id == postId);
        if (index !== -1) {
            oldPosts[index] = res.data.post;
        }
    }

    lastPoll = new Date();
    resetInput();
}

async function resetInput() {
    currentEdit = null;
    textArea = "";
    postType = null;
    currentState = States.button;
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
        oldPosts = oldPosts.filter(v => v.id != id);
        lastPoll = new Date();
    }
}

async function submitOnShiftEnter(e: KeyboardEvent) {
    if (e.key == "Enter" && e.shiftKey) {
        currentState = States.select;
    }
}

function textAreaError() {
    // display error svg
    submitError = true;
    // allow some 'pos-x-wiggle's
    setTimeout(() => {
        submitError = false;
    }, 1000);
}

async function submitNewPost(_event: Event) {
    if (currentEdit !== null) {
        return submitEdit();
    }

    textArea = textArea.trim();
    if (textArea === "") {
        return textAreaError();
    }

    if (postType === null) {
        console.error("invalid post type");
        return;
    }

    currentState = States.submit;
    submitError = false;

    const res: AxiosResponse = await axios
        .post("/api/create-post", { text: textArea, postType })
        .then((res) => res)
        .catch((err) => err.response);

    if (res.status === 400) {
        currentState = States.textarea;
        postType = null;
        newNotification(res.data.message || res.data, NotifType.error);
        return textAreaError();
    }

    const post = res.data.post;

    // store editId on client
    edits.set(post.id, res.data.edit);
    storeEditIds();

    // insert at beginning
    posts.splice(0, 0, post);

    lastPoll = new Date();
    resetInput();
}

function autoExpandTextArea(obj: any) {
    obj.style.height = Math.min(obj.scrollHeight, 150) + "px";
}

async function focusOnCreate(el: HTMLTextAreaElement) {
    autoExpandTextArea(el);
    el.focus();

    // wait for keyboard animation :|
    await new Promise(resolve => setTimeout(resolve, 200));
    // scroll to textarea if not visible
    // https://stackoverflow.com/questions/5353934/check-if-element-is-visible-on-screen
    const rect = el.getBoundingClientRect();
    const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
    const visible = !(rect.bottom < 0 || rect.top - viewHeight >= 0);
    if (!visible) {
        window.scroll({
            top: rect.top,
            left: rect.bottom,
            behavior: "smooth",
        });
    }
}

const NotifType = {
    info: 0,
    warning: 1,
    error: 2,
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
        setTimeout(() => deleteNotification(id), timeout);
    }
}

function deleteNotification(id: number) {
    notifications = notifications.filter(v => v.id !== id);
}

let intervalID = 0;
const interval = new Date().getDay() === 0 ? 10000 : 60000; // short on sundays

const pollingFunction = async function () {
    const res: AxiosResponse = await axios
        .get("/api/poll")
        .catch((err) => err.response);

    if (res.status !== 200) {
        console.error(res);
        return;
    }

    let lastChange = parseDate(res.data);
    if (lastChange > lastPoll) {
        fetchPosts();
        lastPoll = lastChange;
    }
}

let loading = $state(true);

onMount(async () => {
    getEditIds();

    await fetchPosts();
    loading = false;

    intervalID = window.setInterval(pollingFunction, interval);
    window.addEventListener("focus", () => {
        window.clearInterval(intervalID);
        pollingFunction();
        intervalID = window.setInterval(pollingFunction, interval);
    });
    window.addEventListener("blur", () => {
        window.clearInterval(intervalID);
    });
});
</script>

<!-- good enough for now i guess -->
<div id="notif-wrapper" class="flex flex-col gap-3 fixed top-0 right-0 p-3 z-50">
    {#each notifications as notif (notif.id)}
        <div
            class="h-full w-[11rem] p-3 pr-2 flex gap-4 justify-between items-center rounded-lg bg-gray-600 ring-[4px] ring-gray-600"
            in:fade={{ delay: 200, duration: 200 }}
            out:fade={{ duration: 200 }}
            animate:flip={{ delay: 200, duration: 200 }}
            class:bg-green-800={notif.type == NotifType.info}
            class:bg-yellow-800={notif.type == NotifType.warning}
            class:bg-red-800={notif.type == NotifType.error}
        >
            <button
                class="h-full w-full flex justify-center items-center"
                onclick={() => deleteNotification(notif.id)}
            >
                <p class="whitespace-pre-wrap text-xs"> {notif.msg} </p>
            </button>
        </div>
    {/each}
</div>

{#if isAdmin}
    <button
        class="absolute top-0 right-0 m-2 text-blue-300 text-sm"
        onclick={() => {
            deleteCookie("token");
            window.location.reload();
        }}>
        Admin <br>
        Logout
    </button>
{/if}

<div class="min-h-[5.2rem] h-[10dvh] pt-2 w-full flex flex-col gap-1 justify-center items-center">
    <a href="https://www.ikon.church">
        <img class="h-10" src="/IKON-Logo.png" alt="IKON" />
    </a>
    <p class="text-xs"> Prayer and Praise Requests </p>
</div>

<div class="flex flex-col items-center ml-1 mr-2">
    <div class="centered min-h-60 max-h-[81dvh] pt-1 pb-3 overflow-auto">
        {#if loading}
            <div class="h-60 flex-center text-sm italic">
                <p> Loading... </p>
            </div>
        {:else}
            <div class="flex flex-col gap-2">
                {#each posts as post (post.id)}
                    <div
                        class="flex"
                        in:fade={{ delay: 200, duration: 200 }}
                        out:fade={{ duration: 200 }}
                        animate:flip={{ delay: 200, duration: 200 }}
                    >
                        <Post
                            {isAdmin}
                            {post}
                            {currentEdit}
                            {edits}
                            {startEdit}
                            {resetInput}
                            {deletePost}
                        />
                    </div>
                {:else}
                    <div class="w-full h-60 flex-center text-sm italic">
                        None yet...
                    </div>
                {/each}
            </div>

            {#if oldPosts.length != 0}
                <div class="relative h-[36px] ml-1">
                    <button
                        class="h-full w-full"
                        onclick={() => oldPostsShown = !oldPostsShown}
                        out:fade={{ delay: 300, duration: 0 }}
                    >
                        <div class="p-2 absolute top-0 -left-[0.7rem] flex items-center gap-[0.5rem] cursor-pointer text-sm w-full">
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

            {#if oldPosts.length != 0 && oldPostsShown}
                <div transition:slide={{ duration: 500 }}>
                    <div class="flex flex-col gap-2">
                        {#each oldPosts as post (post.id)}
                            <div
                                class="w-full flex"
                                in:fade={{ delay: 200, duration: 200 }}
                                out:fade={{ duration: 200 }}
                                animate:flip={{ delay: 200, duration: 200 }}
                            >
                                <Post
                                    {isAdmin}
                                    {post}
                                    {currentEdit}
                                    {edits}
                                    {startEdit}
                                    {resetInput}
                                    {deletePost}
                                />
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

        {/if}
    </div>
</div>

{#if !loading}
    <div class="w-full px-2 mt-2 mb-3 lg:mx-50 flex-center">
        {#if currentState == States.submit}
            <div
                class="state-button flex-center px-1 text-sm">
                <div class="loader"></div>
            </div>

        {:else if currentState == States.select}
            <div
                class="state-button flex justify-between items-center text-sm">
                <button
                    onclick={(e) => { postType = "PrayerRequest"; submitNewPost(e); }}
                    class="relative p-1 h-full w-[50%] flex justify-center items-center gap-2
                        rounded-md cursor-pointer"
                    >
                        <p class="text-lg"> 🙏 </p>
                        <p class="text-md"> Prayer </p>
                </button>
                <button
                    class="w-28 h-full rounded flex justify-center items-center"
                    onclick={() => { currentState = States.textarea; }}>
                    <img
                        width="25"
                        id="errorSvg"
                        src="/error.svg"
                        alt="error img"
                    />
                </button>
                <button
                    onclick={(e) => { postType = "PraiseReport"; submitNewPost(e); }}
                    class="relative p-1 h-full w-[50%] flex justify-center items-center gap-2
                        rounded-md cursor-pointer"
                    >
                        <p class="text-lg"> 🎉 </p>
                        <p class="text-md"> Praise </p>
                </button>
            </div>

        {:else if currentState == States.textarea}
            <div
                class="state-button relative p-2 flex justify-between"
                style="height: fit-content;"
            >
                <textarea
                    disabled={textAreaDisabled}
                    bind:value={textArea}
                    oninput={(e) => autoExpandTextArea(e.target)}
                    onkeypress={submitOnShiftEnter}
                    rows="1"
                    placeholder=""
                    id="textarea"
                    class="bg-transparent w-full outline-none resize-none mr-[30px]"
                    use:focusOnCreate
                    maxlength="{maxTextLength}"
                ></textarea>
                <button
                    onclick={() => {
                        if (textArea.trim() === "") { return textAreaError(); }
                        currentState = States.select;
                    }}
                    class="bg-transparent p-1 absolute top-[0.25rem] right-1">
                    {#if submitError}
                        <img
                            id="errorSvg"
                            src="/error.svg"
                            alt="error img"
                            class="boop pos-x-wiggle"
                        />
                    {:else}
                        <img src="/send.svg" alt="send img"/>
                    {/if}
                </button>
            </div>

        {:else}
            <button
                onclick={() => {currentState = States.textarea}}
                class="state-button p-2 text-sm flex items-center justify-center"
            >
                Submit Request
            </button>
        {/if}
    </div>
{/if}

<style>
.resize-none {
    resize: none;
}

.loader {
    width: 20px;
    height: 20px;
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

@keyframes pos-x-wiggle {
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
.boop.pos-x-wiggle {
    animation-name: pos-y-wiggle;
    animation-play-state: running;
}
</style>
