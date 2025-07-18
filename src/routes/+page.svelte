<script lang="ts">
import axios from '$lib/axios';
import { onMount } from 'svelte';
import { fly, slide, fade } from 'svelte/transition';
import { flip } from 'svelte/animate';
import moment from 'moment';

import SelectButton from '$lib/SelectButton.svelte';
import { deleteCookie } from '$lib/cookie';

import type { PageData } from './$types';
import type { AxiosResponse } from 'axios';
import type Prisma from '@prisma/client';
import { postTypeEmoji } from '$lib/utils';

let { data }: { data: PageData }  = $props();
const admin = data.admin && data.admin.emailAddr != "";

type PostType = PageData["posts"];

let loading = $state(true);
let posts: PostType = $state([]);
let oldPosts: PostType = $state([]);
let oldPostsShown = $state(true);

async function getPosts() {
    const res: AxiosResponse = await axios
        .get("/api/get-posts")
        .then((res) => res)
        .catch((err) => err.response);
    if (res?.status === 200) {
        setPostListTo(res.data);
    }
}

function parseDate(date: string | Date): Date {
    if (typeof date === 'string') {
        return new Date(date);
    }
    return date;
}

function setPostListTo(updPosts: PostType): void {
    let today = new Date();
    let dayOfWeek = today.getDay();
    let dayOfMonth = today.getDate() - (dayOfWeek == 0 ? 6 : dayOfWeek)
    let lastSunday = new Date(today.getFullYear(), today.getMonth(), dayOfMonth, 0, 0, 0);

    posts = updPosts.filter(v => parseDate(v.createdAt) > lastSunday);
    oldPosts = updPosts.filter(v => parseDate(v.createdAt) <= lastSunday);
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
    return userEditables.find((el) => el.postId == postId) !== undefined;
}

// undefined for admin
let currentEdit: {editId: string | undefined, postId: number, postListIdx: number} | null = $state(null);
const editing = (id: number) => currentEdit !== null && currentEdit.postId == id;

async function startEdit(postId: number) {
    if (currentEdit !== null) {
        return newNotification("Already editing", NotifType.warning, 2000);
    }
    if (text.trim() !== "") {
        return newNotification("Unsubmitted request\nDelete to continue", NotifType.warning);
    }

    let idx = posts.findIndex(el => el.id == postId);
    currentEdit = { postId, postListIdx: idx, editId: userEditables.find(el => el.postId == postId)?.id };

    text = posts[idx].text;
    currentState = States.textarea;
    postType = null;
}

async function completeEdit() {
    const res: AxiosResponse = await axios
        .post("/api/edit-post", {
            editId: currentEdit!.editId,
            postId: currentEdit!.postId,
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

    posts[currentEdit!.postListIdx] = res.data.post;
    abortPostEdit();
}

async function abortPostEdit() {
    currentEdit = null;
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

function waitForErrorAnimation() {
    submitErr = true;
    setTimeout(() => {
        submitErr = false;
    }, 1000);
}

async function submitForm(_event: Event) {
    if (currentEdit !== null) {
        return completeEdit();
    }

    text = text.trim();
    if (text === "") {
        return waitForErrorAnimation();
    }

    if (postType === null) {
        console.error("invalid post type");
        return;
    }

    currentState = States.submit;
    submitErr = false;

    const res: AxiosResponse = await axios
        .post("/api/create-post", { text, postType })
        .then((res) => res)
        .catch((err) => err.response);
    postType = null;

    if (res.status === 400) {
        currentState = States.textarea;
        newNotification(res.data.message || res.data, NotifType.error);
        return waitForErrorAnimation();
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

let intervalID = 0;
const interval = new Date().getDay() === 0 ? 10000 : 60000; // short on sundays
let lastPoll = new Date();

const pollingFunction = async function () {
    const res1: AxiosResponse = await axios
        .get("/api/poll")
        .catch((err) => err.response);

    if (res1.status !== 200) {
        console.error(res1);
        return;
    }

    let lastChange = parseDate(res1.data);
    if (lastChange > lastPoll) {
        getPosts();
        lastPoll = new Date();
    }
}

onMount(async () => {
    await getPosts();
    loading = false;

    intervalID = window.setInterval(pollingFunction, interval);
    // In case it stops
    window.addEventListener("focus", () => {
        window.clearInterval(intervalID);
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
            <button class="h-full w-full flex justify-center items-center" onclick={() => delNotifById(notif.id)}>
                <p class="whitespace-pre-wrap text-xs"> {notif.msg} </p>
            </button>
        </div>
    {/each}
</div>

{#if admin}
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

<div class="min-h-[5.2rem] h-[10dvh] pt-2 pb-2 w-full flex flex-col gap-1 justify-center items-center">
    <a href="https://www.ikon.church">
        <img class="h-10" src="/IKON-Logo.png" alt="IKON" />
    </a>
    <p class="text-xs"> Prayer and Praise Requests </p>
</div>

<div class="flex flex-col items-center mx-2">
    <div class="centered min-h-60 max-h-[80dvh] py-3 overflow-auto container-border">
        {#if loading}
            <div class="h-60 flex-center text-sm italic">
                <p> Loading... </p>
            </div>
        {:else}
            <div class="flex flex-col gap-2">
                <!-- PostList -->
                {#each posts as post (post.id)}
                    <div
                        class="flex"
                        in:fade={{ delay: 200, duration: 200 }}
                        out:fade={{ duration: 200 }}
                        animate:flip={{ delay: 200, duration: 200 }}
                    >
                        <div class="text-sm mr-2 self-center"> {postTypeEmoji(post.postType)} </div>
                        <div class="bg-gray-600 rounded h-fit my-auto">
                            <p style="overflow-wrap: break-word;" class="truncate text-base whitespace-pre-wrap p-1 px-2">
                                {post.text}
                            </p>
                        </div>
                        <div class="ml-2 flex flex-col w-fit gap-[1px]">
                            <div class="h-full" class:w-12={editing(post.id) || admin || editable(post.id)}>
                                <div class="flex gap-2">
                                    {#if admin}
                                        <button
                                            onclick={() => deletePost(post.id)}
                                            class="w-fit bg-red-400 p-[3px] rounded-border-transp">
                                            <img width="13" src="/trash.svg" alt="trash" />
                                        </button>
                                    {/if}
                                    {#if editing(post.id)}
                                        <button
                                            onclick={() => abortPostEdit()}
                                            class="w-fit bg-red-400 p-1 rounded-border-transp">
                                            <img width="10" src="/close.svg" alt="close" />
                                        </button>
                                    {:else if admin || editable(post.id)}
                                        <button
                                            onclick={() => startEdit(post.id)}
                                            class="w-fit bg-blue-400 p-1 rounded-border-transp">
                                            <img width="10" src="/edit.svg" alt="edit" />
                                        </button>
                                    {/if}
                                </div>
                            </div>
                            <p class="text-xs text-gray-300 w-fit whitespace-pre-wrap">
                                {moment(post.createdAt).format("ddd Do")}
                            </p>
                        </div>
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
                        <!-- OldPostList -->
                        {#each oldPosts as post (post.id)}
                            <div
                                class="w-full flex"
                                in:fade={{ delay: 200, duration: 200 }}
                                out:fade={{ duration: 200 }}
                                animate:flip={{ delay: 200, duration: 200 }}
                            >
                                <div class="text-sm mr-2 self-center"> {postTypeEmoji(post.postType)} </div>
                                <div class="bg-gray-600 rounded h-fit my-auto">
                                    <p
                                        style="overflow-wrap: break-word;"
                                        class="whitespace-pre-wrap p-1 px-2">
                                        {post.text}
                                    </p>
                                </div>
                                <div class="mx-2 flex flex-col w-fit">
                                    <div class="h-full">
                                        {#if admin}
                                            <button
                                                onclick={() => deletePost(post.id)}
                                                class="bg-red-400 rounded border border-transparent">
                                                <img src="/trash.svg" alt="trash" />
                                            </button>
                                        {/if}
                                    </div>
                                    <p class="text-xs text-gray-300 w-fit whitespace-pre-wrap">
                                        {moment(post.createdAt).format("ddd Do")}
                                    </p>
                                </div>
                            </div>
                        {:else}
                            <div class="w-full h-36 flex-center text-sm italic">
                                None yet...
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

        {/if}
    </div>
</div>

{#if !loading}
    <div
        in:fly={{ y: -20, delay: 200, duration: 500 }}
        class="w-full px-2 mt-3 mb-3 lg:mx-50 flex-center">

        {#if currentState == States.submit}
            <div
                class="flex-center bg-gray-600 rounded-lg h-[60px] w-full sm:w-[80%] px-1 text-sm">
                <div class="loader"></div>
            </div>

        {:else if currentState == States.select}
            <div
                class="flex justify-between items-center bg-gray-600 rounded-lg h-[60px] w-full sm:w-[80%] px-1 text-sm">
                <SelectButton
                    onclick={(e) => { postType = "PrayerRequest"; submitForm(e); }}
                    emoji={"🙏"}
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
                    emoji={"🎉"}
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
                        if (text.trim() === "") { return waitForErrorAnimation(); }
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
{/if}

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
